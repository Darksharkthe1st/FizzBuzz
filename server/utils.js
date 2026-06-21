import { readFile } from "node:fs/promises";

export async function loadDotEnv(filePath) {
  try {
    const text = await readFile(filePath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator === -1) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim();
      if (key && process.env[key] === undefined) {
        process.env[key] = value.replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // A missing .env file is fine; defaults and real environment variables still work.
  }
}

export function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

export function shortTopic(argument, limit = 70) {
  const fallback = "the exploded Coke incident";
  const cleaned = String(argument || "").trim().replace(/\s+/g, " ");
  if (!cleaned) return fallback;
  return cleaned.length > limit ? `${cleaned.slice(0, Math.max(0, limit - 3))}...` : cleaned;
}

export function truncateForDisplay(value, limit) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 3))}...`;
}

export function parseJsonObject(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

export function parseDataUrl(value) {
  const text = String(value || "");
  const commaIndex = text.indexOf(",");
  if (commaIndex === -1) return null;

  const metadata = text.slice(0, commaIndex).toLowerCase();
  const data = text.slice(commaIndex + 1).replace(/\s/g, "");
  if (!metadata.startsWith("data:image/") || !metadata.includes(";base64") || !data) {
    return null;
  }

  return {
    mimeType: metadata.slice("data:".length, metadata.indexOf(";")),
    data,
  };
}

export function createSpeechText(value) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  return truncateForDisplay(text, 1200);
}
