export const env = {
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:3002").replace(/\/+$/, ""),
  enablePerfMetrics: import.meta.env.VITE_ENABLE_PERF_METRICS === "true" || import.meta.env.DEV
};
