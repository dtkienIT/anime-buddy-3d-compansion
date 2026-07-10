import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = __dirname;

loadEnv(path.join(rootDir, ".env"));

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 3001);
const mistralBaseUrl = stripTrailingSlash(process.env.MISTRAL_BASE_URL || "https://api.mistral.ai/v1");
const mistralModel = process.env.MISTRAL_MODEL || "mistral-small-latest";
const maxTokens = Number(process.env.LLM_MAX_TOKENS || 500);
const temperature = Number(process.env.LLM_TEMPERATURE || 0.45);

const allowedEmotions = new Set(["neutral", "happy", "shy", "sad", "angry", "surprised"]);
const allowedIntents = new Set(["greeting", "chat", "goodbye"]);
const animationByEmotion = {
  neutral: "relax",
  happy: "clapping",
  shy: "blush",
  sad: "sad",
  angry: "angry",
  surprised: "surprised",
};
const animationByIntent = {
  greeting: "greeting",
  goodbye: "goodbye",
};

const systemPrompt = `
You are the brain of a 3D anime AI companion.
Reply in the same language as the user, with a warm, concise conversational style.
Return only valid JSON. No markdown, no code fences, no extra text.

JSON shape:
{
  "reply": "short natural reply",
  "emotion": "neutral | happy | shy | sad | angry | surprised",
  "intent": "greeting | chat | goodbye",
  "voiceStyle": "friendly | calm | energetic | soft",
  "intensity": 0.0
}

Rules:
- Choose exactly one emotion from the allowed list.
- Choose exactly one intent from the allowed list.
- Keep intensity between 0 and 1.
- Do not choose animation names. The frontend controls animation mapping.
`.trim();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);

    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, {
        ok: true,
        model: mistralModel,
        hasApiKey: Boolean(process.env.MISTRAL_API_KEY),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/chat") {
      await handleChat(req, res);
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    await serveStatic(url.pathname, req, res);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "Internal server error" });
  }
});

server.on("error", (error) => {
  if (error?.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use.`);
    console.error(`If the AI Buddy server is already running, open http://${host}:${port}/index.html`);
    console.error("Otherwise close the old server window, stop the process using that port, or set PORT=3002 in .env.");
    process.exitCode = 1;
    return;
  }

  console.error(error);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`AI Buddy server: http://${host}:${port}/index.html`);
  console.log(`Mistral model: ${mistralModel}`);
});

async function handleChat(req, res) {
  if (!process.env.MISTRAL_API_KEY) {
    sendJson(res, 500, { error: "Missing MISTRAL_API_KEY in .env" });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: "Invalid JSON request body" });
    return;
  }

  const message = normalizeText(body?.message, 1200);
  if (!message) {
    sendJson(res, 400, { error: "Message is required" });
    return;
  }

  const messages = [
    { role: "system", content: systemPrompt },
    ...normalizeHistory(body?.history),
    { role: "user", content: message },
  ];

  const apiResponse = await fetch(`${mistralBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: mistralModel,
      messages,
      max_tokens: maxTokens,
      temperature,
      response_format: { type: "json_object" },
    }),
  });

  const apiPayload = await readMistralPayload(apiResponse);
  if (!apiResponse.ok) {
    const detail = apiPayload?.message || apiPayload?.error?.message || apiResponse.statusText;
    sendJson(res, apiResponse.status, { error: `Mistral API error: ${detail}` });
    return;
  }

  const content = apiPayload?.choices?.[0]?.message?.content;
  let parsed;
  try {
    parsed = parseModelJson(content);
  } catch {
    sendJson(res, 502, { error: "Mistral returned invalid companion JSON" });
    return;
  }

  sendJson(res, 200, normalizeBuddyReply(parsed));
}

async function serveStatic(urlPathname, req, res) {
  const pathname = decodeURIComponent(urlPathname === "/" ? "/index.html" : urlPathname);
  const filePath = path.resolve(rootDir, `.${pathname}`);
  const relativePath = path.relative(rootDir, filePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath) || hasHiddenSegment(relativePath)) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  const stat = await fs.promises.stat(filePath).catch(() => null);
  if (!stat?.isFile()) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": contentType(filePath),
    "Cache-Control": "no-store",
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  fs.createReadStream(filePath).pipe(res);
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const loadedValues = new Map();
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    loadedValues.set(key, unquoteEnvValue(rawValue.trim()));
  }

  for (const [key, value] of loadedValues) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function unquoteEnvValue(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function normalizeHistory(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .slice(-10)
    .map((item) => ({
      role: item?.role === "assistant" ? "assistant" : "user",
      content: normalizeText(item?.content, 1200),
    }))
    .filter((item) => item.content);
}

function normalizeBuddyReply(payload) {
  const reply = normalizeText(payload?.reply, 1200) || "Minh nghe roi.";
  const emotion = allowedEmotions.has(payload?.emotion) ? payload.emotion : "neutral";
  const intent = allowedIntents.has(payload?.intent) ? payload.intent : "chat";
  const voiceStyle = normalizeText(payload?.voiceStyle, 40) || "friendly";
  const intensityNumber = Number(payload?.intensity);
  const intensity = Number.isFinite(intensityNumber) ? clamp(intensityNumber, 0, 1) : 0.5;

  return {
    reply,
    emotion,
    intent,
    animation: animationByIntent[intent] || animationByEmotion[emotion] || "relax",
    voiceStyle,
    intensity,
  };
}

function parseModelJson(content) {
  const text = normalizeText(content, 4000);
  if (!text) {
    throw new Error("Mistral returned an empty response");
  }

  const clean = text
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  return JSON.parse(clean);
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) {
      throw new Error("Request body too large");
    }
    chunks.push(chunk);
  }

  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

async function readMistralPayload(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function normalizeText(value, limit) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function hasHiddenSegment(relativePath) {
  return relativePath.split(path.sep).some((segment) => segment.startsWith("."));
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".vrm": "model/gltf-binary",
    ".vrma": "model/gltf-binary",
    ".wasm": "application/wasm",
  };
  return types[ext] || "application/octet-stream";
}
