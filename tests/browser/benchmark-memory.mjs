import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const api = "http://127.0.0.1:3002";
const runsPerMode = Math.max(5, Number(process.argv[2] ?? 5));
const output = path.resolve("test-results/browser/memory", process.argv[3] ?? "memory-benchmark-final.json");
await mkdir(path.dirname(output), { recursive: true });
const anonymousId = `memory-benchmark-${Date.now()}`;
let sessionId;
const runs = [];

for (const enabled of [true, false]) {
  await fetch(`${api}/api/memories/toggle`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ anonymousId, enabled }),
    signal: AbortSignal.timeout(15_000)
  });
  for (let index = 0; index < runsPerMode; index += 1) {
    const startedAt = performance.now();
    let fallback = false;
    try {
      const response = await fetch(`${api}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          anonymousId,
          characterId: "mika",
          message: `Memory benchmark ${enabled ? "enabled" : "disabled"} run ${index + 1}: answer only OK.`,
          availableAnimations: ["relax"]
        }),
        signal: AbortSignal.timeout(120_000)
      });
      const body = await response.json();
      if (response.ok) sessionId = body.sessionId;
      const timing = parseServerTiming(response.headers.get("server-timing"));
      fallback = Number(timing["memory-fallbacks"]?.desc ?? 0) > 0;
      runs.push({ enabled, index, status: response.status, wallClockMs: performance.now() - startedAt, timing, fallback });
    } catch (error) {
      runs.push({ enabled, index, status: 0, wallClockMs: performance.now() - startedAt, error: String(error), timeout: true, fallback });
    }
  }
}

const metrics = [
  "recent-history", "preferences", "memory-wall", "memory-db-general", "memory-db-matched",
  "memory-db-deleted", "memory-db-summary", "memory-db-past", "context-build", "mistral", "total"
];
const summary = {};
for (const enabled of [true, false]) {
  const subset = runs.filter((run) => run.enabled === enabled);
  const mode = enabled ? "enabled" : "disabled";
  summary[mode] = {
    runCount: subset.length,
    timeoutCount: subset.filter((run) => run.timeout).length,
    fallbackCount: subset.filter((run) => run.fallback).length,
    cacheHitCount: subset.reduce((sum, run) => sum + Number(run.timing?.["memory-cache-hits"]?.desc ?? 0), 0),
    metrics: Object.fromEntries(metrics.map((metric) => [metric, stats(subset.map((run) => run.timing?.[metric]?.dur).filter(Number.isFinite))]))
  };
}

const result = { generatedAt: new Date().toISOString(), anonymousId, runsPerMode, runs, summary };
await writeFile(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));

function parseServerTiming(value) {
  const parsed = {};
  for (const part of String(value ?? "").split(",")) {
    const [name, ...params] = part.trim().split(";");
    if (!name) continue;
    const entry = {};
    for (const param of params) {
      const [key, raw] = param.split("=");
      if (key === "dur") entry.dur = Number(raw);
      if (key === "desc") entry.desc = String(raw ?? "").replace(/^"|"$/g, "");
    }
    parsed[name] = entry;
  }
  return parsed;
}

function stats(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    min: sorted[0],
    p50: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
    p95: percentile(sorted, 0.95),
    max: sorted.at(-1)
  };
}

function percentile(sorted, fraction) {
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}
