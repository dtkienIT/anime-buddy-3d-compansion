import { type SupabaseClient } from "@supabase/supabase-js";
import { Mistral } from "@mistralai/mistralai";
import type { ApiEnv } from "../config/env.js";
import { parsePossiblyFencedJson } from "../utils/safeJson.js";
import { z } from "zod";

// Schema for Mistral extraction response
const extractedMemorySchema = z.object({
  memories: z.array(
    z.object({
      shouldRemember: z.boolean(),
      kind: z.enum(["identity", "preference", "goal", "project", "relationship", "instruction", "other"]),
      content: z.string().min(1),
      normalizedKey: z.string().min(1),
      importance: z.number().min(0).max(1).default(0.5),
      confidence: z.number().min(0).max(1).default(0.5),
      explicitUserRequest: z.boolean().default(false),
      sensitive: z.boolean().default(false)
    })
  ).default([]),
  forgetRequests: z.array(
    z.object({
      target: z.string().min(1)
    })
  ).default([])
});

const summaryResponseSchema = z.object({
  summary: z.string().min(1),
  topics: z.array(z.string()).default([]),
  unresolvedItems: z.array(z.string()).default([])
});

export class MemoryService {
  private readonly supabase: SupabaseClient | null;
  private readonly mistral: Mistral;
  private lastTimings = {
    memoriesMs: 0,
    currentSummaryMs: 0,
    pastSummariesMs: 0,
    contextBuildMs: 0,
    wallMs: 0
  };

  // Static maps for cross-request caching
  private static readonly cache = new Map<string, { data: any; expiry: number }>();
  private static readonly lastKnown = new Map<string, any>();
  private static readonly memoryVersions = new Map<string, number>();

  constructor(
    private readonly env: ApiEnv,
    supabaseClient: SupabaseClient | null
  ) {
    this.supabase = supabaseClient;
    this.mistral = new Mistral({ apiKey: env.MISTRAL_API_KEY });
  }

  isConfigured(): boolean {
    return Boolean(this.supabase);
  }

  static getMemoryVersion(anonymousId: string): number {
    if (!this.memoryVersions.has(anonymousId)) {
      this.memoryVersions.set(anonymousId, 1);
    }
    return this.memoryVersions.get(anonymousId)!;
  }

  static bumpMemoryVersion(anonymousId: string): void {
    const current = this.memoryVersions.get(anonymousId) || 1;
    this.memoryVersions.set(anonymousId, current + 1);
  }

  getLastTimings() {
    return this.lastTimings;
  }

  /**
   * Retrieves memory context (long-term memories, rolling summary, past summaries)
   * and builds a formatted string to inject into the system prompt.
   */
  async retrieveContext(
    anonymousId: string,
    characterId: string,
    sessionId?: string,
    userMessage?: string
  ): Promise<string> {
    if (!this.supabase || !this.env.MEMORY_ENABLED) {
      this.lastTimings = { memoriesMs: 0, currentSummaryMs: 0, pastSummariesMs: 0, contextBuildMs: 0, wallMs: 0 };
      return "";
    }

    try {
      const wallStart = performance.now();
      const timeoutMs = this.env.MEMORY_RETRIEVAL_TIMEOUT_MS;
      const version = MemoryService.getMemoryVersion(anonymousId);

      const generalCacheKey = `general:${anonymousId}:${characterId}:${version}`;
      const summaryCacheKey = sessionId ? `summary:${sessionId}:${version}` : "";
      const pastCacheKey = `past:${anonymousId}:${version}`;

      const getCached = <T>(key: string): T | null => {
        const entry = MemoryService.cache.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiry) {
          MemoryService.lastKnown.set(key, entry.data);
          MemoryService.cache.delete(key);
          return null;
        }
        return entry.data as T;
      };

      const setCached = <T>(key: string, data: T, ttlMs = 60000): void => {
        MemoryService.cache.set(key, { data, expiry: Date.now() + ttlMs });
        MemoryService.lastKnown.set(key, data);
      };

      const getLastKnown = <T>(key: string, fallback: T): T => {
        return MemoryService.lastKnown.get(key) || MemoryService.cache.get(key)?.data || fallback;
      };

      const cachedGeneral = getCached<any[]>(generalCacheKey);
      const cachedSummary = summaryCacheKey ? getCached<string>(summaryCacheKey) : null;
      const cachedPast = getCached<any[]>(pastCacheKey);

      // 1. Get current session summary if available
      const currentSummaryPromise = (async () => {
        const start = performance.now();
        if (cachedSummary !== null) {
          return { data: cachedSummary, dur: 0 };
        }
        let data = "";
        if (sessionId) {
          const { data: session } = await this.supabase!
            .from("chat_sessions")
            .select("rolling_summary")
            .eq("id", sessionId)
            .maybeSingle();
          data = session?.rolling_summary || "";
          setCached(summaryCacheKey, data);
        }
        return { data, dur: performance.now() - start };
      })();

      // 2. Fetch general identity/preferences memories
      const generalMemoriesPromise = (async () => {
        const start = performance.now();
        if (cachedGeneral !== null) {
          return { data: cachedGeneral, dur: 0 };
        }
        const { data } = await this.supabase!
          .from("conversation_memories")
          .select("*")
          .eq("anonymous_id", anonymousId)
          .eq("status", "active")
          .or(`character_id.is.null,character_id.eq.${characterId}`)
          .in("kind", ["identity", "preference"])
          .order("importance", { ascending: false })
          .limit(4);
        const res = data || [];
        setCached(generalCacheKey, res);
        return { data: res, dur: performance.now() - start };
      })();

      // 3. Fetch topic-specific memories using simple word match or FTS if userMessage is provided
      const matchedMemoriesPromise = (async () => {
        const start = performance.now();
        let res: any[] = [];
        if (userMessage && userMessage.trim().length > 0) {
          const words = userMessage
            .replace(/[^\w\s]/g, "")
            .split(/\s+/)
            .filter((w) => w.length > 2)
            .map((w) => `${w}:*`)
            .join(" & ");

          if (words) {
            const { data } = await this.supabase!
              .from("conversation_memories")
              .select("*")
              .eq("anonymous_id", anonymousId)
              .eq("status", "active")
              .or(`character_id.is.null,character_id.eq.${characterId}`)
              .textSearch("fts_doc", words, { config: "simple" })
              .order("importance", { ascending: false })
              .limit(this.env.MEMORY_TOP_K);
            res = data || [];
          }
        }
        return { data: res, dur: performance.now() - start };
      })();

      // 4. Fetch past session summaries (up to 3)
      const pastSummariesPromise = (async () => {
        const start = performance.now();
        if (cachedPast !== null) {
          return { data: cachedPast, dur: 0 };
        }
        let res: any[] = [];
        if (sessionId) {
          const { data } = await this.supabase!
            .from("conversation_summaries")
            .select("summary, chat_sessions(title)")
            .neq("session_id", sessionId)
            .order("created_at", { ascending: false })
            .limit(3);
          res = data || [];
        } else {
          const { data } = await this.supabase!
            .from("conversation_summaries")
            .select("summary, chat_sessions(title)")
            .order("created_at", { ascending: false })
            .limit(3);
          res = data || [];
        }
        setCached(pastCacheKey, res);
        return { data: res, dur: performance.now() - start };
      })();

      let dbResult: any[] | null = null;
      let timedOut = false;
      let timeoutId: NodeJS.Timeout;

      const dbOperationsPromise = Promise.all([
        currentSummaryPromise,
        generalMemoriesPromise,
        matchedMemoriesPromise,
        pastSummariesPromise
      ]);

      const timeoutPromise = new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => {
          timedOut = true;
          resolve(null);
        }, timeoutMs);
      });

      try {
        dbResult = await Promise.race([dbOperationsPromise, timeoutPromise]);
      } catch (err) {
        console.error("Supabase memory retrieval error, falling back to cache:", err);
      } finally {
        clearTimeout(timeoutId!);
      }

      let currentSummary = "";
      let generalMemories: any[] = [];
      let matchedMemories: any[] = [];
      let pastSummaries: any[] = [];

      let currentSummaryMs = 0;
      let memoriesMs = 0;
      let pastSummariesMs = 0;

      if (dbResult && !timedOut) {
        const [summaryRes, generalRes, matchedRes, pastRes] = dbResult;
        currentSummary = summaryRes.data;
        generalMemories = generalRes.data;
        matchedMemories = matchedRes.data;
        pastSummaries = pastRes.data;

        currentSummaryMs = summaryRes.dur;
        memoriesMs = generalRes.dur + matchedRes.dur;
        pastSummariesMs = pastRes.dur;
      } else {
        console.warn(`Memory retrieval timed out after ${timeoutMs}ms or database failed. Falling back to cache.`);
        currentSummary = getLastKnown<string>(summaryCacheKey, "");
        generalMemories = getLastKnown<any[]>(generalCacheKey, []);
        matchedMemories = [];
        pastSummaries = getLastKnown<any[]>(pastCacheKey, []);

        currentSummaryMs = timeoutMs;
        memoriesMs = timeoutMs;
        pastSummariesMs = timeoutMs;
      }

      const wallMs = performance.now() - wallStart;
      const contextBuildStart = performance.now();

      // De-duplicate memories by ID
      const allMemoriesMap = new Map<string, any>();
      generalMemories.forEach((m) => allMemoriesMap.set(m.id, m));
      matchedMemories.forEach((m) => allMemoriesMap.set(m.id, m));
      const memories = Array.from(allMemoriesMap.values());

      // Build context components
      const memoryLines = memories.map(
        (m) => `- [${m.kind}] ${m.content} (importance: ${m.importance.toFixed(1)}, confidence: ${m.confidence.toFixed(1)})`
      );

      const pastSummaryLines = pastSummaries.map(
        (s) => `- Session "${s.chat_sessions?.title || "Quá khứ"}": ${s.summary}`
      );

      // Truncate based on character budget (1 token ~ 4 characters)
      let longTermMemoryBlock = memoryLines.join("\n");
      let pastSummariesBlock = pastSummaryLines.join("\n");
      const currentSummaryBlock = currentSummary;

      let totalChars = longTermMemoryBlock.length + pastSummariesBlock.length + currentSummaryBlock.length;
      const maxChars = this.env.MEMORY_MAX_CONTEXT_TOKENS * 4;

      while (totalChars > maxChars && (memoryLines.length > 0 || pastSummaryLines.length > 0)) {
        if (pastSummaryLines.length > 0) {
          pastSummaryLines.pop();
          pastSummariesBlock = pastSummaryLines.join("\n");
        } else if (memoryLines.length > 0) {
          // Remove least important memory
          memoryLines.sort((a, b) => {
            const impA = parseFloat(a.match(/importance: ([\d.]+)/)?.[1] || "0");
            const impB = parseFloat(b.match(/importance: ([\d.]+)/)?.[1] || "0");
            return impA - impB; // Ascending order to pop the smallest importance
          });
          memoryLines.shift(); // remove smallest
          longTermMemoryBlock = memoryLines.join("\n");
        }
        totalChars = longTermMemoryBlock.length + pastSummariesBlock.length + currentSummaryBlock.length;
      }

      let promptBlock = "";
      if (longTermMemoryBlock) {
        promptBlock += `\n[LONG-TERM MEMORY]\n(These are memories of the user from past conversations. Treat them as factual context, but if they contradict the user's current message, prioritize the user's latest statement. Do not expose internal details like normalized keys or importance/confidence scores in chat response)\n${longTermMemoryBlock}\n`;
      }
      if (currentSummaryBlock) {
        promptBlock += `\n[CURRENT SESSION SUMMARY]\n(This is a rolling summary of the current session so far)\n${currentSummaryBlock}\n`;
      }
      if (pastSummariesBlock) {
        promptBlock += `\n[PAST SESSIONS SUMMARY]\n(Context from other past conversations with the user)\n${pastSummariesBlock}\n`;
      }

      this.lastTimings = {
        memoriesMs,
        currentSummaryMs,
        pastSummariesMs,
        contextBuildMs: performance.now() - contextBuildStart,
        wallMs
      };

      return promptBlock;
    } catch (err) {
      console.error("Error retrieving memory context:", err);
      this.lastTimings = { memoriesMs: 0, currentSummaryMs: 0, pastSummariesMs: 0, contextBuildMs: 0, wallMs: 0 };
      return "";
    }
  }

  /**
   * Run background memory extraction. Analyzes the last exchange and updates user memories in database.
   */
  async extractMemories(
    sessionId: string,
    anonymousId: string,
    characterId: string,
    userMessage: string,
    assistantMessage: string
  ): Promise<void> {
    if (!this.supabase || !this.env.MEMORY_ENABLED) {
      return;
    }

    // Run extraction asynchronously in the background
    this.extractMemoriesBackground(sessionId, anonymousId, characterId, userMessage, assistantMessage).catch((err) => {
      console.error("Error in background memory extraction:", err);
    });
  }

  private async extractMemoriesBackground(
    sessionId: string,
    anonymousId: string,
    characterId: string,
    userMessage: string,
    assistantMessage: string
  ): Promise<void> {
    if (!this.supabase) return;

    // First load recent memories for context to avoid duplicate/conflicting extractions
    const { data: activeMemories } = await this.supabase
      .from("conversation_memories")
      .select("id, normalized_key, content")
      .eq("anonymous_id", anonymousId)
      .eq("status", "active");

    const activeMemoriesStr = (activeMemories || [])
      .map((m) => `- Key: "${m.normalized_key}", Content: "${m.content}"`)
      .join("\n");

    const systemPrompt = `You are a memory extraction assistant.
Analyze the user message and the assistant's reply. Extract long-term facts, preferences, instructions, or goals that are stable and worth remembering.
Also detect requests to forget specific information (e.g. "forget my color preference", "quên tên mình đi").

Rules:
1. Do NOT extract temporary states, emotions, greetings, passwords, API keys, financial data, exact locations, or sensitive health info.
2. If the user explicitly asks you to remember something ("hãy nhớ là...", "ghi nhớ điều này..."), mark explicitUserRequest = true.
3. If information is sensitive but requested to be remembered, only save it if explicitUserRequest is true.
4. Check if new facts conflict with or update the existing memories:
Existing memories:
${activeMemoriesStr}

5. normalizedKey must be a camelCase string identifying the topic (e.g., userName, favoriteColor, userJob, petName).

Output format must be a single JSON object matching:
{
  "memories": [
    {
      "shouldRemember": true,
      "kind": "identity | preference | goal | project | relationship | instruction | other",
      "content": "Description of the fact in third person, e.g. User's name is Minh.",
      "normalizedKey": "userName",
      "importance": 0.0 to 1.0,
      "confidence": 0.0 to 1.0,
      "explicitUserRequest": boolean,
      "sensitive": boolean
    }
  ],
  "forgetRequests": [
    {
      "target": "target term or normalizedKey to forget"
    }
  ]
}`;

    const userPrompt = `User: "${userMessage}"\nAssistant: "${assistantMessage}"`;

    const response = await this.mistral.chat.complete({
      model: this.env.MISTRAL_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.1,
      responseFormat: { type: "json_object" }
    } as any);

    const text = response?.choices?.[0]?.message?.content;
    if (typeof text !== "string") return;

    const parsedRaw = parsePossiblyFencedJson(text);
    const result = extractedMemorySchema.parse(parsedRaw);

    // 1. Process forget requests
    for (const forget of result.forgetRequests) {
      const target = forget.target.toLowerCase();
      // Find active memories that match the target key or content
      const { data: matched } = await this.supabase
        .from("conversation_memories")
        .select("id, content, normalized_key")
        .eq("anonymous_id", anonymousId)
        .eq("status", "active");

      for (const m of matched || []) {
        if (m.normalized_key.toLowerCase().includes(target) || m.content.toLowerCase().includes(target)) {
          // Mark deleted
          await this.supabase
            .from("conversation_memories")
            .update({ status: "deleted", updated_at: new Date().toISOString() })
            .eq("id", m.id);

          // Write audit log
          await this.supabase.from("memory_audit_log").insert({
            memory_id: m.id,
            event_type: "deleted",
            previous_content: m.content,
            metadata: { reason: "User requested forget", target: forget.target }
          });
        }
      }
    }

    // 2. Process extracted memories
    for (const memory of result.memories) {
      if (!memory.shouldRemember) continue;
      if (memory.sensitive && !memory.explicitUserRequest) {
        // Skip sensitive facts unless explicitly requested
        continue;
      }

      // Determine character specificity: kind === "relationship" or "instruction" is character-specific
      const finalCharId = (memory.kind === "relationship" || memory.kind === "instruction") ? characterId : null;

      // Check if there is an active memory with the same key
      const { data: existing } = await this.supabase
        .from("conversation_memories")
        .select("id, content, importance, confidence")
        .eq("anonymous_id", anonymousId)
        .eq("normalized_key", memory.normalizedKey)
        .eq("status", "active")
        .or(finalCharId ? `character_id.eq.${finalCharId}` : "character_id.is.null")
        .maybeSingle();

      if (existing) {
        if (existing.content === memory.content) {
          // Same content: update confidence/last seen
          const nextConfidence = Math.min(1.0, existing.confidence + 0.1);
          await this.supabase
            .from("conversation_memories")
            .update({
              confidence: nextConfidence,
              last_seen_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq("id", existing.id);
        } else {
          // Different content: supersede the old one
          await this.supabase
            .from("conversation_memories")
            .update({
              status: "superseded",
              updated_at: new Date().toISOString()
            })
            .eq("id", existing.id);

          const { data: newMem } = await this.supabase
            .from("conversation_memories")
            .insert({
              anonymous_id: anonymousId,
              character_id: finalCharId,
              kind: memory.kind,
              content: memory.content,
              normalized_key: memory.normalizedKey,
              importance: memory.importance,
              confidence: memory.confidence,
              explicit_user_request: memory.explicitUserRequest,
              sensitive: memory.sensitive,
              source_session_id: sessionId,
              supersedes_memory_id: existing.id
            })
            .select("id")
            .single();

          // Write audit log
          if (newMem) {
            await this.supabase.from("memory_audit_log").insert({
              memory_id: newMem.id,
              event_type: "superseded",
              previous_content: existing.content,
              new_content: memory.content,
              metadata: { supersedes_memory_id: existing.id }
            });
          }
        }
      } else {
        // Create new memory
        const { data: newMem } = await this.supabase
          .from("conversation_memories")
          .insert({
            anonymous_id: anonymousId,
            character_id: finalCharId,
            kind: memory.kind,
            content: memory.content,
            normalized_key: memory.normalizedKey,
            importance: memory.importance,
            confidence: memory.confidence,
            explicit_user_request: memory.explicitUserRequest,
            sensitive: memory.sensitive,
            source_session_id: sessionId
          })
          .select("id")
          .single();

        // Write audit log
        if (newMem) {
          await this.supabase.from("memory_audit_log").insert({
            memory_id: newMem.id,
            event_type: "created",
            new_content: memory.content
          });
        }
      }
    }
    MemoryService.bumpMemoryVersion(anonymousId);
  }

  /**
   * Triggers rolling summarization if message count threshold is met.
   */
  async triggerRollingSummary(sessionId: string, anonymousId: string): Promise<void> {
    if (!this.supabase || !this.env.MEMORY_ENABLED) {
      return;
    }

    this.triggerRollingSummaryBackground(sessionId, anonymousId).catch((err) => {
      console.error("Error in background rolling summary:", err);
    });
  }

  private async triggerRollingSummaryBackground(sessionId: string, anonymousId: string): Promise<void> {
    if (!this.supabase) return;

    // Check message count of session
    const { data: session } = await this.supabase
      .from("chat_sessions")
      .select("rolling_summary, summary_through_message_id, message_count")
      .eq("id", sessionId)
      .eq("anonymous_id", anonymousId)
      .maybeSingle();

    if (!session) return;

    // Get count of messages in this session
    const { count, error } = await this.supabase
      .from("chat_messages")
      .select("*", { count: "exact", head: true })
      .eq("session_id", sessionId);

    if (error || count === null) return;

    // If total messages is greater than summary_through_message_id index + trigger threshold
    // Let's count messages since the last summary_through_message_id
    let unsummarizedQuery = this.supabase
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId);

    if (session.summary_through_message_id) {
      // Find the created_at of summary_through_message_id
      const { data: lastSumMsg } = await this.supabase
        .from("chat_messages")
        .select("created_at")
        .eq("id", session.summary_through_message_id)
        .maybeSingle();

      if (lastSumMsg) {
        unsummarizedQuery = unsummarizedQuery.gt("created_at", lastSumMsg.created_at);
      }
    }

    const { count: unsummarizedCount } = await unsummarizedQuery;
    if (unsummarizedCount === null || unsummarizedCount < this.env.MEMORY_SUMMARY_TRIGGER_MESSAGES) {
      return; // Threshold not met
    }

    // Load unsummarized messages
    let msgQuery = this.supabase
      .from("chat_messages")
      .select("id, role, content, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (session.summary_through_message_id) {
      const { data: lastSumMsg } = await this.supabase
        .from("chat_messages")
        .select("created_at")
        .eq("id", session.summary_through_message_id)
        .maybeSingle();
      if (lastSumMsg) {
        msgQuery = msgQuery.gt("created_at", lastSumMsg.created_at);
      }
    }

    const { data: messages } = await msgQuery;
    if (!messages || messages.length === 0) return;

    const messagesStr = messages
      .map((m) => `${m.role === "assistant" ? "Assistant" : "User"}: "${m.content}"`)
      .join("\n");

    const previousSummary = session.rolling_summary || "Không có tóm tắt trước đó.";
    const lastMessageId = messages[messages.length - 1].id;

    const systemPrompt = `You are a conversation summarizer.
Update the rolling summary of the chat session by incorporating the new messages. Do NOT lose track of important facts, goals, decisions, preferences, and unresolved questions.

Format the output strictly as a single JSON object:
{
  "summary": "Updated text summary in third person, max 300 words.",
  "topics": ["list of main topics discussed"],
  "unresolvedItems": ["any questions or tasks left unanswered or open"]
}`;

    const userPrompt = `Previous Summary:\n"${previousSummary}"\n\nNew Messages:\n${messagesStr}`;

    const response = await this.mistral.chat.complete({
      model: this.env.MISTRAL_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.15,
      responseFormat: { type: "json_object" }
    } as any);

    const text = response?.choices?.[0]?.message?.content;
    if (typeof text !== "string") return;

    const parsedRaw = parsePossiblyFencedJson(text);
    const result = summaryResponseSchema.parse(parsedRaw);

    // Save summary record
    const firstMessageId = messages[0].id;
    await this.supabase.from("conversation_summaries").insert({
      session_id: sessionId,
      from_message_id: firstMessageId,
      through_message_id: lastMessageId,
      message_count: messages.length,
      summary: result.summary,
      topics: result.topics,
      unresolved_items: result.unresolvedItems
    });

    // Update chat_sessions rolling summary
    await this.supabase
      .from("chat_sessions")
      .update({
        rolling_summary: result.summary,
        summary_through_message_id: lastMessageId,
        summary_updated_at: new Date().toISOString(),
        message_count: count
      })
      .eq("id", sessionId);

    MemoryService.bumpMemoryVersion(anonymousId);
  }
}
