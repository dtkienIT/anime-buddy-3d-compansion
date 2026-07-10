const chatForm = document.querySelector("#chat-form");
const chatInput = document.querySelector("#chat-input");
const chatSend = document.querySelector("#chat-send");
const chatLog = document.querySelector("#chat-log");
const chatStatus = document.querySelector("#chat-status");
const speechBubble = document.querySelector("#speech-bubble");

const allowedEmotions = new Set(["neutral", "happy", "shy", "sad", "angry", "surprised"]);
const allowedIntents = new Set(["greeting", "chat", "goodbye"]);
const emotionAnimations = {
  neutral: "relax",
  happy: "clapping",
  shy: "blush",
  sad: "sad",
  angry: "angry",
  surprised: "surprised",
};
const intentAnimations = {
  greeting: "greeting",
  goodbye: "goodbye",
};

const history = [];
let isWaiting = false;
let relaxTimer = null;
let bubbleTimer = null;

addMessage("assistant", "Chao ban, minh san sang noi chuyen roi.");
showSpeech("Chao ban, minh san sang noi chuyen roi.", 3800);

chatForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const message = chatInput?.value.trim();
  if (!message || isWaiting) {
    return;
  }

  chatInput.value = "";
  setWaiting(true);
  addMessage("user", message);
  remember("user", message);
  setChatStatus("Thinking");
  showSpeech("...", 0);
  playBuddyAnimation("thinking");

  try {
    const result = await requestBuddyReply(message);
    const reply = result.reply || "Minh nghe roi.";
    remember("assistant", reply);
    addMessage("assistant", reply);
    showSpeech(reply, estimateSpeechTime(reply));

    const nextAnimation = resolveAnimation(result);
    await playBuddyAnimation(nextAnimation);
    scheduleRelax(result);
    setChatStatus(labelForEmotion(result.emotion));
  } catch (error) {
    console.error(error);
    const messageText = friendlyError(error);
    addMessage("assistant", messageText);
    showSpeech(messageText, 5200);
    playBuddyAnimation("sad");
    scheduleRelax({ intensity: 0.4 });
    setChatStatus("API error");
  } finally {
    setWaiting(false);
  }
});

async function requestBuddyReply(message) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      history: history.slice(-10),
    }),
  });

  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(payload?.error || `Request failed with ${response.status}`);
  }

  return normalizeBuddyReply(payload);
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Backend did not return JSON. Hay chay bang start-ai.bat de co /api/chat.");
  }
}

function normalizeBuddyReply(payload) {
  const reply = typeof payload?.reply === "string" ? payload.reply.trim() : "";
  const emotion = allowedEmotions.has(payload?.emotion) ? payload.emotion : "neutral";
  const intent = allowedIntents.has(payload?.intent) ? payload.intent : "chat";
  const voiceStyle = typeof payload?.voiceStyle === "string" ? payload.voiceStyle.trim() : "friendly";
  const intensityNumber = Number(payload?.intensity);
  const intensity = Number.isFinite(intensityNumber) ? clamp(intensityNumber, 0, 1) : 0.5;

  return {
    reply,
    emotion,
    intent,
    voiceStyle,
    intensity,
  };
}

function resolveAnimation(result) {
  if (result.intent in intentAnimations) {
    return intentAnimations[result.intent];
  }

  return emotionAnimations[result.emotion] || "relax";
}

function scheduleRelax(result) {
  window.clearTimeout(relaxTimer);
  const delay = 2200 + Math.round((result.intensity ?? 0.5) * 1700);
  relaxTimer = window.setTimeout(() => {
    playBuddyAnimation("relax");
    setChatStatus("Ready");
  }, delay);
}

async function playBuddyAnimation(animationId) {
  const api = window.buddyViewer;
  if (!api?.playAnimation) {
    return;
  }

  try {
    await api.playAnimation(animationId, { silent: true });
  } catch (error) {
    console.warn(`Could not play ${animationId}`, error);
  }
}

function addMessage(role, text) {
  if (!chatLog) {
    return;
  }

  const node = document.createElement("div");
  node.className = `chat-message is-${role}`;
  node.textContent = text;
  chatLog.append(node);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function remember(role, content) {
  history.push({ role, content });
  if (history.length > 16) {
    history.splice(0, history.length - 16);
  }
}

function showSpeech(text, timeoutMs) {
  if (!speechBubble) {
    return;
  }

  window.clearTimeout(bubbleTimer);
  speechBubble.textContent = text;
  speechBubble.classList.add("is-visible");

  if (timeoutMs > 0) {
    bubbleTimer = window.setTimeout(() => {
      speechBubble.classList.remove("is-visible");
    }, timeoutMs);
  }
}

function estimateSpeechTime(text) {
  return clamp(1800 + text.length * 42, 2600, 9000);
}

function setWaiting(nextValue) {
  isWaiting = nextValue;
  if (chatInput) {
    chatInput.disabled = nextValue;
  }
  if (chatSend) {
    chatSend.disabled = nextValue;
  }
}

function setChatStatus(text) {
  if (chatStatus) {
    chatStatus.textContent = text;
  }
  window.buddyViewer?.setStatus?.(text);
}

function labelForEmotion(emotion) {
  const labels = {
    neutral: "Talking",
    happy: "Happy",
    shy: "Shy",
    sad: "Sad",
    angry: "Angry",
    surprised: "Surprised",
  };
  return labels[emotion] || "Talking";
}

function friendlyError(error) {
  const text = error?.message || "";
  if (text.includes("MISTRAL_API_KEY")) {
    return "Backend chua doc duoc MISTRAL_API_KEY trong file .env.";
  }
  if (text.includes("start-ai.bat") || text.includes("/api/chat")) {
    return "Hay chay start-ai.bat thay vi start-mika.bat de bat chatbot.";
  }
  return "Minh chua goi duoc AI. Kiem tra server Node va .env nha.";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
