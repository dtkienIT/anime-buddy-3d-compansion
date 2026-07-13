export const env = {
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:3002").replace(/\/+$/, ""),
  enablePerfMetrics: import.meta.env.VITE_ENABLE_PERF_METRICS === "true" || import.meta.env.DEV,
  ttsRequestTimeoutMs: positiveNumber(import.meta.env.VITE_TTS_REQUEST_TIMEOUT_MS, 125000)
};

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
