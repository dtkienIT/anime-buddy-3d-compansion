const cases = [
  ["python", "http://127.0.0.1:8000/synthesize"],
  ["api", "http://127.0.0.1:3002/api/tts"]
];

for (const [name, url] of cases) {
  const started = performance.now();
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: name === "python" ? "Bay." : "Tam.", stream: true })
  });
  const headersAt = performance.now();
  const first = await response.body.getReader().read();
  console.log(JSON.stringify({
    name,
    status: response.status,
    type: response.headers.get("content-type"),
    cache: response.headers.get("x-tts-cache"),
    headersMs: headersAt - started,
    firstChunkMs: performance.now() - started,
    bytes: first.value?.byteLength,
    done: first.done
  }));
}
