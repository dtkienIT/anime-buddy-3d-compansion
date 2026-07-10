const webUrl = process.env.WEB_URL || "http://127.0.0.1:3001";
const apiUrl = process.env.API_URL || "http://127.0.0.1:3002";
const ttsUrl = process.env.TTS_URL || "http://127.0.0.1:8000";

const results = [];

await check("Web", `${webUrl}/`, (response, text) => response.ok && text.includes("3D AI Companion"));
await check("API health", `${apiUrl}/health`, (response) => response.ok);
await check("TTS health", `${ttsUrl}/health`, (response) => response.ok);

for (const result of results) {
  console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name}: ${result.detail}`);
}

if (results.some((result) => !result.ok)) {
  process.exit(1);
}

async function check(name, url, predicate) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
    const text = await response.text();
    results.push({
      name,
      ok: predicate(response, text),
      detail: `${response.status} ${response.statusText}`
    });
  } catch (error) {
    results.push({
      name,
      ok: false,
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}
