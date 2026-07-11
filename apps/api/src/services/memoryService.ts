import { type SupabaseClient } from "@supabase/supabase-js";
import { Mistral } from "@mistralai/mistralai";
import type { ApiEnv } from "../config/env.js";
import { parsePossiblyFencedJson } from "../utils/safeJson.js";
import { z } from "zod";
import { createHash } from "node:crypto";

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

export interface MemoryTimings {
  memoriesMs: number;
  generalMemoriesMs: number;
  matchedMemoriesMs: number;
  deletedMemoriesMs: number;
  currentSummaryMs: number;
  pastSummariesMs: number;
  contextBuildMs: number;
  wallMs: number;
  timeoutCount: number;
  fallbackCount: number;
  cacheHitCount: number;
}

export interface MemoryContextResult {
  context: string;
  timings: MemoryTimings;
}

export function createMemoryTimings(overrides: Partial<MemoryTimings> = {}): MemoryTimings {
  return {
    memoriesMs: 0,
    generalMemoriesMs: 0,
    matchedMemoriesMs: 0,
    deletedMemoriesMs: 0,
    currentSummaryMs: 0,
    pastSummariesMs: 0,
    contextBuildMs: 0,
    wallMs: 0,
    timeoutCount: 0,
    fallbackCount: 0,
    cacheHitCount: 0,
    ...overrides
  };
}

export class MemoryService {
  private readonly supabase: SupabaseClient | null;
  private readonly mistral: Mistral;
  private lastTimings: MemoryTimings = createMemoryTimings();

  // Static maps for cross-request caching
  private static readonly cache = new Map<string, { data: any; expiry: number }>();
  private static readonly lastKnown = new Map<string, any>();
  private static readonly memoryVersions = new Map<string, number>();
  private static readonly activeExtractions = new Set<string>();
  private static outboxResumeStarted = false;

  constructor(
    private readonly env: ApiEnv,
    supabaseClient: SupabaseClient | null
  ) {
    this.supabase = supabaseClient;
    this.mistral = new Mistral({ apiKey: env.MISTRAL_API_KEY });
    if (this.supabase && env.NODE_ENV !== "test" && !MemoryService.outboxResumeStarted) {
      MemoryService.outboxResumeStarted = true;
      void this.resumeExtractionOutbox();
    }
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

  getLastTimings(): MemoryTimings {
    return { ...this.lastTimings };
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
    const result = await this.retrieveContextWithTimings(anonymousId, characterId, sessionId, userMessage);
    return result.context;
  }

  async retrieveContextWithTimings(
    anonymousId: string,
    characterId: string,
    sessionId?: string,
    userMessage?: string
  ): Promise<MemoryContextResult> {
    if (!this.supabase || !this.env.MEMORY_ENABLED) {
      const timings = createMemoryTimings();
      this.lastTimings = timings;
      return { context: "", timings };
    }

    try {
      const wallStart = performance.now();
      const timeoutMs = this.env.MEMORY_RETRIEVAL_TIMEOUT_MS;
      const version = MemoryService.getMemoryVersion(anonymousId);

      const generalCacheKey = `general:${anonymousId}:${characterId}:${version}`;
      const summaryCacheKey = sessionId ? `summary:${sessionId}:${version}` : "";
      const pastCacheKey = `past:${anonymousId}:${version}`;
      const deletedCacheKey = `deleted:${anonymousId}:${version}`;

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
      const cachedDeleted = getCached<any[]>(deletedCacheKey);

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
          .select("id, kind, content, normalized_key, importance, confidence, character_id")
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
              .select("id, kind, content, normalized_key, importance, confidence, character_id")
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
            .select("summary, chat_sessions!inner(title, anonymous_id)")
            .eq("chat_sessions.anonymous_id", anonymousId)
            .neq("session_id", sessionId)
            .order("created_at", { ascending: false })
            .limit(3);
          res = data || [];
        } else {
          const { data } = await this.supabase!
            .from("conversation_summaries")
            .select("summary, chat_sessions!inner(title, anonymous_id)")
            .eq("chat_sessions.anonymous_id", anonymousId)
            .order("created_at", { ascending: false })
            .limit(3);
          res = data || [];
        }
        setCached(pastCacheKey, res);
        return { data: res, dur: performance.now() - start };
      })();

      // 5. Fetch deleted memory keys so past summaries cannot resurrect forgotten facts.
      const deletedMemoriesPromise = (async () => {
        const start = performance.now();
        if (cachedDeleted !== null) {
          return { data: cachedDeleted, dur: 0 };
        }
        const { data } = await this.supabase!
          .from("conversation_memories")
          .select("normalized_key, content")
          .eq("anonymous_id", anonymousId)
          .eq("status", "deleted")
          .order("updated_at", { ascending: false })
          .limit(12);
        const res = data || [];
        setCached(deletedCacheKey, res);
        return { data: res, dur: performance.now() - start };
      })();

      let currentSummary = "";
      let generalMemories: any[] = [];
      let matchedMemories: any[] = [];
      let pastSummaries: any[] = [];
      let deletedMemories: any[] = [];

      let currentSummaryMs = 0;
      let memoriesMs = 0;
      let pastSummariesMs = 0;

      const deadlineAt = performance.now() + timeoutMs;
      const withRemainingTimeout = async <T>(
        promise: Promise<{ data: T; dur: number }>,
        fallback: T
      ): Promise<{ data: T; dur: number; timedOut: boolean }> => {
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        const remainingMs = Math.max(0, deadlineAt - performance.now());
        const timeoutPromise = new Promise<{ data: T; dur: number; timedOut: boolean }>((resolve) => {
          timeoutId = setTimeout(() => resolve({ data: fallback, dur: timeoutMs, timedOut: true }), remainingMs);
        });

        try {
          const result = await Promise.race([
            promise.then((value) => ({ ...value, timedOut: false })),
            timeoutPromise
          ]);
          return result;
        } catch (err: unknown) {
          console.error("Supabase memory subquery failed, falling back to cache:", err);
          return { data: fallback, dur: 0, timedOut: false };
        } finally {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
        }
      };

      const [summaryRes, generalRes, matchedRes, pastRes, deletedRes] = await Promise.all([
        withRemainingTimeout(currentSummaryPromise, getLastKnown<string>(summaryCacheKey, "")),
        withRemainingTimeout(generalMemoriesPromise, getLastKnown<any[]>(generalCacheKey, [])),
        withRemainingTimeout(matchedMemoriesPromise, []),
        withRemainingTimeout(pastSummariesPromise, getLastKnown<any[]>(pastCacheKey, [])),
        withRemainingTimeout(deletedMemoriesPromise, getLastKnown<any[]>(deletedCacheKey, []))
      ]);

      const results = [summaryRes, generalRes, matchedRes, pastRes, deletedRes];
      const timeoutCount = results.filter((result) => result.timedOut).length;
      const cacheHitCount = [cachedSummary, cachedGeneral, cachedPast, cachedDeleted]
        .filter((value) => value !== null).length;

      if (timeoutCount > 0) {
        console.warn(`Memory retrieval partially timed out after ${timeoutMs}ms. Using completed subquery results plus cache fallbacks.`);
      }

      currentSummary = summaryRes.data;
      generalMemories = generalRes.data;
      matchedMemories = matchedRes.data;
      pastSummaries = pastRes.data;
      deletedMemories = deletedRes.data;

      currentSummaryMs = summaryRes.dur;
      memoriesMs = generalRes.dur + matchedRes.dur + deletedRes.dur;
      pastSummariesMs = pastRes.dur;

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

      const forgottenKeys = Array.from(new Set(
        deletedMemories
          .map((memory) => String(memory.normalized_key ?? "").trim())
          .filter(Boolean)
      ));

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
      if (forgottenKeys.length > 0) {
        promptBlock += `\n[FORGOTTEN MEMORY RULES]\nThe user explicitly asked to forget these memory topics: ${forgottenKeys.join(", ")}. Do not use past summaries, chat history, or stale context to answer those topics. Do not recreate those memories unless the user states a new value in the current message.\n`;
      }

      const timings = createMemoryTimings({
        memoriesMs,
        generalMemoriesMs: generalRes.dur,
        matchedMemoriesMs: matchedRes.dur,
        deletedMemoriesMs: deletedRes.dur,
        currentSummaryMs,
        pastSummariesMs,
        contextBuildMs: performance.now() - contextBuildStart,
        wallMs,
        timeoutCount,
        fallbackCount: timeoutCount,
        cacheHitCount
      });
      this.lastTimings = timings;

      return { context: promptBlock, timings };
    } catch (err) {
      console.error("Error retrieving memory context:", err);
      const timings = createMemoryTimings();
      this.lastTimings = timings;
      return { context: "", timings };
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

    if (this.env.NODE_ENV === "test") {
      void this.extractMemoriesBackground(
        sessionId, anonymousId, characterId, userMessage, assistantMessage
      ).catch(() => undefined);
      return;
    }

    const idempotencyKey = createHash("sha256")
      .update(`${sessionId}\0${anonymousId}\0${characterId}\0${userMessage}`)
      .digest("hex");
    if (MemoryService.activeExtractions.has(idempotencyKey)) return;

    MemoryService.activeExtractions.add(idempotencyKey);
    void this.persistAndRunExtraction({
      idempotencyKey,
      sessionId,
      anonymousId,
      characterId,
      userMessage,
      assistantMessage
    }).finally(() => MemoryService.activeExtractions.delete(idempotencyKey));
  }

  private async persistAndRunExtraction(job: {
    idempotencyKey: string;
    sessionId: string;
    anonymousId: string;
    characterId: string;
    userMessage: string;
    assistantMessage: string;
  }): Promise<void> {
    if (!this.supabase) return;
    const payload = {
      sessionId: job.sessionId,
      anonymousId: job.anonymousId,
      characterId: job.characterId,
      userMessage: job.userMessage,
      assistantMessage: job.assistantMessage
    };
    const { error: enqueueError } = await this.supabase.from("memory_extraction_outbox").upsert({
      idempotency_key: job.idempotencyKey,
      anonymous_id: job.anonymousId,
      session_id: job.sessionId,
      payload,
      status: "pending",
      next_attempt_at: new Date().toISOString()
    }, { onConflict: "idempotency_key", ignoreDuplicates: true });

    // Migration 003 may not have been applied yet. Extraction still runs with
    // bounded retry, but process-restart durability is unavailable until it is.
    const durable = !enqueueError;
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        if (durable) {
          await this.supabase.from("memory_extraction_outbox").update({
            status: "processing",
            attempts: attempt,
            updated_at: new Date().toISOString()
          }).eq("idempotency_key", job.idempotencyKey);
        }
        await this.extractMemoriesBackground(
          job.sessionId, job.anonymousId, job.characterId, job.userMessage, job.assistantMessage
        );
        if (durable) {
          await this.supabase.from("memory_extraction_outbox").update({
            status: "completed",
            completed_at: new Date().toISOString(),
            last_error: null,
            updated_at: new Date().toISOString()
          }).eq("idempotency_key", job.idempotencyKey);
        }
        return;
      } catch (error) {
        lastError = error;
        if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      }
    }

    const safeError = lastError instanceof Error ? lastError.message.slice(0, 500) : "Unknown extraction failure";
    if (durable) {
      await this.supabase.from("memory_extraction_outbox").update({
        status: "failed",
        last_error: safeError,
        next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
        updated_at: new Date().toISOString()
      }).eq("idempotency_key", job.idempotencyKey);
    }
    await this.supabase.from("memory_audit_log").insert({
      event_type: "extraction_failed",
      metadata: { idempotencyKey: job.idempotencyKey, error: safeError }
    });
    console.error("Background memory extraction failed after bounded retry");
  }

  private async resumeExtractionOutbox(): Promise<void> {
    if (!this.supabase) return;
    const { data, error } = await this.supabase
      .from("memory_extraction_outbox")
      .select("idempotency_key, payload")
      .in("status", ["pending", "processing", "failed"])
      .lte("next_attempt_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(20);
    if (error) return;
    for (const row of data || []) {
      const payload = row.payload as any;
      if (!payload?.sessionId || !payload?.anonymousId || !payload?.userMessage) continue;
      const key = String(row.idempotency_key);
      if (MemoryService.activeExtractions.has(key)) continue;
      MemoryService.activeExtractions.add(key);
      void this.persistAndRunExtraction({ idempotencyKey: key, ...payload })
        .finally(() => MemoryService.activeExtractions.delete(key));
    }
  }

  private async extractMemoriesBackground(
    sessionId: string,
    anonymousId: string,
    characterId: string,
    userMessage: string,
    assistantMessage: string
  ): Promise<void> {
    if (!this.supabase) return;

    // First load known memories for context to avoid duplicate/conflicting extractions.
    const { data: knownMemories } = await this.supabase
      .from("conversation_memories")
      .select("id, normalized_key, content, status")
      .eq("anonymous_id", anonymousId);

    const activeMemories = (knownMemories || []).filter((memory) => memory.status === "active");
    const deletedMemoryKeys = new Set(
      (knownMemories || [])
        .filter((memory) => memory.status === "deleted")
        .map((memory) => memory.normalized_key)
        .filter(Boolean)
    );

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
4. Only extract facts directly stated by the User. Never create or update a memory from a fact that appears only in the Assistant text.
5. Check if new facts conflict with or update the existing memories:
Existing memories:
${activeMemoriesStr}

6. normalizedKey must be a camelCase string identifying the topic (e.g., userName, favoriteColor, userJob, petName).
7. Deleted memory keys must not be recreated unless the User explicitly states a new value in the current message.
Deleted memory keys: ${Array.from(deletedMemoryKeys).join(", ") || "(none)"}

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
          deletedMemoryKeys.add(m.normalized_key);
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
      if (
        deletedMemoryKeys.has(memory.normalizedKey) &&
        !memory.explicitUserRequest &&
        !isMemoryGroundedInUserMessage(memory.content, userMessage)
      ) {
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

function isMemoryGroundedInUserMessage(memoryContent: string, userMessage: string): boolean {
  const userTokens = new Set(extractSignificantTokens(userMessage));
  return extractSignificantTokens(memoryContent).some((token) => userTokens.has(token));
}

function extractSignificantTokens(value: string): string[] {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !memoryStopWords.has(token));
}

const memoryStopWords = new Set([
  "user",
  "the",
  "and",
  "has",
  "his",
  "her",
  "their",
  "name",
  "favorite",
  "color",
  "mau",
  "ten",
  "minh",
  "ban",
  "cua",
  "la"
]);
