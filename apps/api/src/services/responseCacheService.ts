import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompanionChatResponse } from "@anime-buddy/shared";
import type { ApiEnv } from "../config/env.js";
import type { TtsRequestBody } from "../schemas/chatSchemas.js";
import type { TtsProxyResult } from "./ttsService.js";

type CachedReply = Omit<CompanionChatResponse, "sessionId" | "warnings">;

interface ResponseCacheRow {
  id: string;
  response_text: string;
  emotion: CachedReply["emotion"];
  animation: string;
  expression: CachedReply["expression"];
  intensity: number;
  voice_style: CachedReply["voiceStyle"];
}

interface AudioCacheRow {
  storage_path: string;
  content_type: string;
  content_length: number;
  audio_format: string | null;
  sample_rate: string | null;
  channels: string | null;
  bytes_per_sample: string | null;
}

export class ResponseCacheService {
  constructor(
    private readonly env: ApiEnv,
    private readonly client: SupabaseClient | null
  ) {}

  isConfigured(): boolean {
    return this.env.RESPONSE_CACHE_ENABLED && Boolean(this.client);
  }

  async findReply(message: string, characterId: string): Promise<CachedReply | null> {
    if (!this.isConfigured()) return null;
    try {
      const { data, error } = await this.client!.rpc("match_response_cache", {
        query_text: normalizeText(message),
        query_character_id: characterId,
        similarity_threshold: this.env.RESPONSE_CACHE_SIMILARITY_THRESHOLD,
        match_count: this.env.RESPONSE_CACHE_TOP_K
      });
      if (error) throw error;
      const row = (data?.[0] ?? null) as ResponseCacheRow | null;
      if (!row) return null;
      return {
        reply: row.response_text,
        emotion: row.emotion,
        animation: row.animation,
        expression: row.expression,
        intensity: row.intensity,
        voiceStyle: row.voice_style
      };
    } catch {
      return null;
    }
  }

  async saveReply(message: string, characterId: string, response: CachedReply): Promise<void> {
    if (!this.isConfigured()) return;
    const normalizedInput = normalizeText(message);
    if (!normalizedInput) return;
    const { error } = await this.client!.from("response_cache").upsert({
      character_id: characterId,
      input_text: message.trim(),
      normalized_input: normalizedInput,
      response_text: response.reply,
      emotion: response.emotion,
      animation: response.animation,
      expression: response.expression,
      intensity: response.intensity,
      voice_style: response.voiceStyle,
      approved: true
    }, { onConflict: "character_id,normalized_input" });
    if (error) throw error;
  }

  async findAudio(body: TtsRequestBody): Promise<TtsProxyResult | null> {
    if (!this.isConfigured()) return null;
    const cacheKey = audioKey(body);
    try {
      const { data: row, error } = await this.client!
        .from("response_audio_cache")
        .select("storage_path, content_type, content_length, audio_format, sample_rate, channels, bytes_per_sample")
        .eq("cache_key", cacheKey)
        .maybeSingle<AudioCacheRow>();
      if (error || !row) return null;
      const { data: file, error: downloadError } = await this.client!.storage
        .from(this.env.RESPONSE_CACHE_BUCKET)
        .download(row.storage_path);
      if (downloadError || !file) return null;
      const bytes = Buffer.from(await file.arrayBuffer());
      return {
        audio: Readable.from(bytes),
        contentType: row.content_type,
        contentLength: String(row.content_length || bytes.byteLength),
        cacheStatus: "SUPABASE_HIT",
        audioFormat: row.audio_format ?? undefined,
        sampleRate: row.sample_rate ?? undefined,
        channels: row.channels ?? undefined,
        bytesPerSample: row.bytes_per_sample ?? undefined,
        upstreamHeadersMs: 0
      };
    } catch {
      return null;
    }
  }

  async saveAudio(body: TtsRequestBody, result: TtsProxyResult, bytes: Buffer): Promise<void> {
    if (!this.isConfigured() || bytes.byteLength === 0) return;
    const cacheKey = audioKey(body);
    const extension = result.contentType.includes("wav") ? "wav" : "bin";
    const storagePath = `${cacheKey.slice(0, 2)}/${cacheKey}.${extension}`;
    const { error: uploadError } = await this.client!.storage
      .from(this.env.RESPONSE_CACHE_BUCKET)
      .upload(storagePath, bytes, { contentType: result.contentType, upsert: true });
    if (uploadError) throw uploadError;
    const { error } = await this.client!.from("response_audio_cache").upsert({
      cache_key: cacheKey,
      text: body.text,
      voice: body.voice ?? "",
      style: body.style ?? "",
      storage_path: storagePath,
      content_type: result.contentType,
      content_length: bytes.byteLength,
      audio_format: result.audioFormat ?? null,
      sample_rate: result.sampleRate ?? null,
      channels: result.channels ?? null,
      bytes_per_sample: result.bytesPerSample ?? null,
      approved: true
    }, { onConflict: "cache_key" });
    if (error) throw error;
  }

}

export async function readableToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLocaleLowerCase("vi-VN")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function audioKey(body: TtsRequestBody): string {
  return createHash("sha256")
    .update(`${body.voice ?? ""}\0${body.style ?? ""}\0${body.text.trim()}`)
    .digest("hex");
}
