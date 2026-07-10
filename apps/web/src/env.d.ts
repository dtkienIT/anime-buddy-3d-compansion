/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_ENABLE_PERF_METRICS?: string;
}

interface Window {
  __BUDDY_PERF__?: {
    runs: import("./utils/PerformanceMetrics.js").PerformanceRun[];
  };
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
