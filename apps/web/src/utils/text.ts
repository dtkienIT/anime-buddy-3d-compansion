export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function sanitizeAiText(value: unknown, limit = 1200): string {
  if (typeof value !== "string") {
    return "";
  }

  return normalizeWhitespace(value)
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .slice(0, limit);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function splitIntoSpeechChunks(text: string): string[] {
  const clean = sanitizeAiText(text).trim();
  if (!clean) return [];

  // Abbreviations to avoid splitting on trailing dot
  const abbreviations = [
    "tp", "hcm", "hn", "dr", "mr", "mrs", "ms", "prof", "vs", "etc", "co", "ltd", "approx", "eg", "ie", "vol", "ed"
  ];

  const segments: string[] = [];
  let currentSegment = "";

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    currentSegment += char;

    if (/[.!?;:]/.test(char)) {
      const nextChar = clean[i + 1];
      const isEnd = !nextChar || /\s/.test(nextChar);
      if (isEnd) {
        if (currentSegment.endsWith("...")) {
          if (nextChar && nextChar === ".") {
            continue;
          }
        }

        const lastWordMatch = currentSegment.slice(0, -1).trim().match(/(\b\w+)$/);
        if (lastWordMatch) {
          const lastWord = lastWordMatch[1].toLowerCase();
          if (abbreviations.includes(lastWord)) {
            continue;
          }
        }

        const lastSpaceIdx = currentSegment.lastIndexOf(" ");
        const lastPart = lastSpaceIdx === -1 ? currentSegment : currentSegment.slice(lastSpaceIdx + 1);
        if (lastPart.includes("@") || lastPart.includes("://") || lastPart.startsWith("www.")) {
          continue;
        }

        segments.push(currentSegment.trim());
        currentSegment = "";
      }
    }
  }

  if (currentSegment.trim()) {
    segments.push(currentSegment.trim());
  }

  const chunks: string[] = [];
  const firstChunkLimit = 220; // Target 140-220
  const standardLimit = 280;    // Target 180-280
  const maxLimit = 320;

  let activeChunk = "";

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const limit = chunks.length === 0 ? firstChunkLimit : standardLimit;

    if (seg.length > maxLimit) {
      // If we have an active chunk, push it first
      if (activeChunk) {
        chunks.push(activeChunk);
        activeChunk = "";
      }

      // Split the extremely long sentence by commas
      const subParts = seg.split(/,\s+/);
      let currentSub = "";
      for (const part of subParts) {
        const currentLimit = chunks.length === 0 ? firstChunkLimit : standardLimit;
        if (currentSub.length + part.length + 2 > currentLimit) {
          if (currentSub) chunks.push(currentSub.trim() + ",");
          currentSub = part;
        } else {
          currentSub = currentSub ? `${currentSub}, ${part}` : part;
        }
      }
      if (currentSub) {
        activeChunk = currentSub.trim();
      }
    } else {
      const addedLength = activeChunk ? activeChunk.length + seg.length + 1 : seg.length;
      if (addedLength <= limit) {
        activeChunk = activeChunk ? `${activeChunk} ${seg}` : seg;
      } else {
        if (activeChunk) {
          chunks.push(activeChunk);
        }
        activeChunk = seg;
      }
    }
  }

  if (activeChunk) {
    chunks.push(activeChunk);
  }

  // Merge the final chunk if it is short (< 50 characters) and fits into the previous one
  if (chunks.length > 1) {
    const lastIdx = chunks.length - 1;
    if (
      chunks[lastIdx].length < 50 &&
      chunks[lastIdx - 1].length + chunks[lastIdx].length + 1 <= maxLimit
    ) {
      chunks[lastIdx - 1] += " " + chunks[lastIdx];
      chunks.pop();
    }
  }

  // Limit to max 6 chunks to prevent excessive calls for normal responses
  if (chunks.length > 6) {
    const mergedLast = chunks.slice(5).join(" ");
    const finalChunks = chunks.slice(0, 5);
    finalChunks.push(mergedLast);
    return finalChunks;
  }

  return chunks;
}
