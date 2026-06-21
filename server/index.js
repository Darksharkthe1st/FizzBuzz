import express from "express";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = resolve(__dirname, "..");
const clientDir = join(rootDir, "client");
const distClientDir = join(rootDir, "dist", "client");

await loadDotEnv(join(rootDir, ".env"));

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 5175);
const isProduction = process.env.NODE_ENV === "production";

const sessions = new Map();

const titleBank = [
  "The Deflection Engine",
  "Lord of the Unwashed Pan",
  "Baron Von Not My Problem",
  "The Carbonation Witness",
  "Duke of Suddenly Busy",
];

const excuseBank = [
  "I was actually about to clean that, but then the vibe in the kitchen changed.",
  "Technically, the mess became communal when everyone noticed it.",
  "I feel like focusing on the Coke can ignores the freezer's role in this.",
  "Can we not weaponize evidence while I am holding cereal?",
  "I did not leave it there. I simply stopped moving it somewhere else.",
  "This sounds like landlord energy, and I need everyone to sit with that.",
];

const counterBank = [
  {
    name: "Receipt Slam",
    line: "I am describing one specific mess, one specific cleanup, and one specific person who fled the scene.",
  },
  {
    name: "Calm Boundary Uppercut",
    line: "I am not asking for a confession monologue. I am asking you to clean your part today.",
  },
  {
    name: "Shared Space Suplex",
    line: "The kitchen is shared, which means the consequences are shared after the responsibility is handled.",
  },
  {
    name: "Lease Clause Elbow Drop",
    line: "We can be chill after the sticky floor stops crunching under my socks.",
  },
];

const defensiveBank = [
  {
    trigger: ["always", "every time", "again"],
    name: "Pattern Denial Parry",
    line:
      "Okay, 'always' is doing a heroic amount of work there. I did it, like, a spiritually different number of times.",
  },
  {
    trigger: ["clean", "washed", "dishes", "trash"],
    name: "Chore Jurisdiction Dodge",
    line:
      "I was literally entering the pre-cleaning mindset, and now this whole courtroom tone has reset my process.",
  },
  {
    trigger: ["freezer", "coke", "cola", "exploded", "sticky"],
    name: "Carbonation Innocence Plea",
    line:
      "The can made choices under pressure. I am not saying I am blameless, I am saying physics has been weirdly protected here.",
  },
  {
    trigger: ["pay", "money", "rent", "bill"],
    name: "Wallet Fog Machine",
    line:
      "I hear you saying money, but I need you to understand my bank app has been giving haunted-house energy.",
  },
  {
    trigger: ["sorry", "apologize", "apology"],
    name: "Apology Side Quest",
    line:
      "I can apologize, obviously. I just need us to define whether this is an apology-apology or a vibe apology.",
  },
  {
    trigger: ["listen", "hearing", "said"],
    name: "Listening Technicality",
    line:
      "I am listening. I am disagreeing while listening, which is actually two tasks, so you're welcome.",
  },
];

async function loadDotEnv(filePath) {
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

function parseDataUrl(value) {
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

function shortTopic(argument, limit = 70) {
  const fallback = "the exploded Coke incident";
  const cleaned = String(argument || "").trim().replace(/\s+/g, " ");
  if (!cleaned) return fallback;
  return cleaned.length > limit ? `${cleaned.slice(0, Math.max(0, limit - 3))}...` : cleaned;
}

function makeAttackName(argument) {
  const topic = shortTopic(argument).toLowerCase();
  if (topic.includes("coke") || topic.includes("cola") || topic.includes("freezer")) {
    return "Carbonation Cross-Examination";
  }
  if (topic.includes("dish") || topic.includes("sink") || topic.includes("pan")) {
    return "Dish Pile Haymaker";
  }
  if (topic.includes("shower") || topic.includes("smell")) {
    return "Fresh Air Finisher";
  }
  if (topic.includes("trash") || topic.includes("garbage")) {
    return "Trash Bag Takedown";
  }
  return "Respectful Boundary Jab";
}

function createSession(payload) {
  const argument = String(payload.argument || "").slice(0, 240);
  const evidence = clampNumber(payload.evidence, 1, 5, 4);
  const aggro = clampNumber(payload.aggro, 1, 5, 3);
  const titleIndex = Math.min(titleBank.length - 1, Math.floor((aggro - 1) * 1.1));
  const session = {
    id: randomUUID(),
    argument,
    evidence,
    aggro,
    round: 1,
    player: 100,
    boss: 100,
    exchange: 0,
    bossTitle: titleBank[titleIndex],
    createdAt: new Date().toISOString(),
  };
  sessions.set(session.id, session);
  return {
    sessionId: session.id,
    round: session.round,
    player: session.player,
    boss: session.boss,
    bossTitle: session.bossTitle,
    topic: shortTopic(argument),
    roundTopic: shortTopic(argument, 42),
    opener: {
      name: makeAttackName(argument),
      line: `A focused opener about "${shortTopic(argument)}" with zero room for interpretive dance.`,
    },
    roommateLine: `What? I was literally about to deal with ${shortTopic(argument)}.`,
  };
}

function createForeheadPrompt(argument) {
  return [
    "Edit the uploaded photo into a funny boss-battle portrait for a roommate argument game.",
    "Keep the same person's identity, expression cues, hair, and recognizable facial features.",
    "Make it look like the picture was taken from a very close camera angle above their face, so their forehead looks comically massive while the rest of the face shrinks below it.",
    "Use a wide-angle selfie lens feel, exaggerated forced perspective, crisp lighting, and a square close-up crop.",
    "Make it silly and theatrical, not mean-spirited, violent, scary, or realistic evidence.",
    `Argument context for comedic mood: ${shortTopic(argument)}.`,
  ].join(" ");
}

async function generateForeheadPortrait(payload) {
  const apiKey = process.env.GEMINI_API_KEY;
  const image = parseDataUrl(payload.imageDataUrl);
  const prompt = createForeheadPrompt(payload.argument);
  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";

  console.info(
    `[image] /api/media/forehead requested; USE_GEMINI_IMAGE=${process.env.USE_GEMINI_IMAGE}; keyPresent=${Boolean(apiKey)}; imageValid=${Boolean(image)}; model=${model}`,
  );

  if (!image) {
    console.error("[image] Forehead request did not include a valid data URL image.");
    return {
      status: 400,
      body: {
        error:
          "The forehead endpoint did not receive a valid image. Re-upload the roommate photo, wait for the forehead button to unlock, then try again.",
      },
    };
  }

  if (process.env.USE_GEMINI_IMAGE !== "true" || !apiKey) {
    console.info("[image] Gemini image disabled or missing key; returning mock forehead response.");
    return {
      status: 202,
      body: {
        mode: "mock",
        imageUrl: null,
        prompt,
        message:
          "Forehead mode is ready. Add GEMINI_API_KEY and set USE_GEMINI_IMAGE=true to spend real image-generation credits.",
      },
    };
  }

  let response;
  try {
    console.info(
      `[image] Requesting Gemini image edit; mimeType=${image.mimeType}; base64Chars=${image.data.length}; promptChars=${prompt.length}`,
    );
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: image.mimeType,
                    data: image.data,
                  },
                },
              ],
            },
          ],
        }),
      },
    );
  } catch (error) {
    console.error("[image] Gemini image request failed before receiving a response.", {
      name: error.name,
      message: error.message,
    });
    return {
      status: 502,
      body: {
        error: "Gemini image generation could not be reached.",
        details: error.message,
      },
    };
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("[image] Gemini image request rejected.", {
      status: response.status,
      message: result.error?.message || "No Gemini error body.",
      code: result.error?.code,
      statusText: result.error?.status,
    });
    return {
      status: response.status,
      body: {
        error: result.error?.message || "Gemini image generation failed.",
        code: result.error?.code,
        status: result.error?.status,
      },
    };
  }

  const parts = result.candidates?.[0]?.content?.parts || [];
  const generated = parts.find((part) => part.inlineData || part.inline_data);
  const inlineData = generated?.inlineData || generated?.inline_data;

  if (!inlineData?.data) {
    const partSummary = parts.map((part) => ({
      hasText: Boolean(part.text),
      textPreview: part.text ? truncateForDisplay(part.text, 220) : "",
      hasInlineData: Boolean(part.inlineData || part.inline_data),
      inlineMimeType:
        part.inlineData?.mimeType ||
        part.inlineData?.mime_type ||
        part.inline_data?.mimeType ||
        part.inline_data?.mime_type ||
        "",
    }));
    const candidate = result.candidates?.[0] || {};
    console.error("[image] Gemini image response did not include image data.", {
      finishReason: candidate.finishReason,
      finishMessage: candidate.finishMessage,
      partSummary,
      promptFeedback: result.promptFeedback,
      safetyRatings: candidate.safetyRatings,
      usageMetadata: result.usageMetadata,
    });
    return {
      status: 502,
      body: {
        error: "Gemini responded without an image.",
        finishReason: candidate.finishReason,
        finishMessage: candidate.finishMessage,
        partSummary,
        promptFeedback: result.promptFeedback,
      },
    };
  }

  console.info(
    `[image] Gemini forehead image ready; mimeType=${inlineData.mimeType || inlineData.mime_type || "image/png"}; base64Chars=${inlineData.data.length}`,
  );
  return {
    status: 200,
    body: {
      mode: "gemini",
      imageUrl: `data:${inlineData.mimeType || inlineData.mime_type || "image/png"};base64,${inlineData.data}`,
      prompt,
    },
  };
}

async function advanceArgument(sessionId, transcript = "") {
  const session = sessions.get(sessionId);
  if (!session) {
    return null;
  }

  const defensive =
    (await generateGeminiArgumentTurn(session, transcript)) || chooseDefensiveResponse(session, transcript);
  const damage = 10 + session.evidence * 3;
  const recoil = Math.max(3, session.aggro * 2 - session.evidence);

  session.round += 1;
  session.exchange += 1;
  session.boss = Math.max(0, session.boss - damage);
  session.player = Math.max(0, session.player - recoil);

  return {
    sessionId: session.id,
    round: session.round,
    player: session.player,
    boss: session.boss,
    heard: truncateForDisplay(transcript, 180),
    attack: defensive.attack,
    roommateLine:
      session.boss === 0
        ? "Roommate has been stunned by a complete sentence. They agree to clean it today, allegedly."
        : defensive.roommateLine,
    complete: session.boss === 0,
  };
}

function chooseDefensiveResponse(session, transcript) {
  const heard = String(transcript || "").trim().replace(/\s+/g, " ");
  const lowerHeard = heard.toLowerCase();
  const matched = defensiveBank.find((entry) =>
    entry.trigger.some((word) => lowerHeard.includes(word)),
  );

  if (matched) {
    return {
      attack: {
        name: matched.name,
        line: heard
          ? `You said: "${truncateForDisplay(heard, 130)}"`
          : "You inhaled like someone with a laminated chore chart.",
      },
      roommateLine: matched.line,
    };
  }

  const counter = counterBank[session.exchange % counterBank.length];
  const excuse = excuseBank[(session.exchange + session.aggro) % excuseBank.length];
  return {
    attack: {
      name: counter.name,
      line: heard
        ? `You said: "${truncateForDisplay(heard, 130)}"`
        : counter.line,
    },
    roommateLine: heard
      ? `I heard "${truncateForDisplay(heard, 80)}," and honestly the accusation-to-context ratio is aggressive.`
      : excuse,
  };
}

function truncateForDisplay(value, limit) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 3))}...`;
}

function parseJsonObject(text) {
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

function createSpeechText(value) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  return truncateForDisplay(text, 1200);
}

function createRoommatePrompt(session, transcript) {
  return [
    "Return ONLY compact JSON. No markdown. No intro.",
    'Format: {"attackName":"2-4 words","attackLine":"short summary","roommateLine":"one funny defensive comeback"}',
    "Role: evasive, defensive, funny roommate boss. Clearly react to the user's exact complaint. Playful, non-threatening.",
    `Topic: ${shortTopic(session.argument, 100)}`,
    `Aggro:${session.aggro}/5 Evidence:${session.evidence}/5 Round:${session.round}`,
    `User: ${truncateForDisplay(transcript, 260) || "(silence)"}`,
  ].join("\n");
}

async function generateGeminiArgumentTurn(session, transcript) {
  const apiKey = process.env.GEMINI_API_KEY;
  const enabled =
    process.env.USE_GEMINI_TEXT !== "false" && Boolean(apiKey) && Boolean(String(transcript || "").trim());
  const model = process.env.GEMINI_TEXT_MODEL || "gemini-3.5-flash";

  if (!enabled) {
    console.info(
      `[argue] Gemini text disabled; USE_GEMINI_TEXT=${process.env.USE_GEMINI_TEXT}; keyPresent=${Boolean(apiKey)}; transcriptPresent=${Boolean(String(transcript || "").trim())}`,
    );
    return null;
  }

  console.info(`[argue] Requesting Gemini roommate response; model=${model}; chars=${String(transcript).length}`);

  let response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: createRoommatePrompt(session, transcript) }],
            },
          ],
          generationConfig: {
            temperature: 1.05,
            topP: 0.9,
            maxOutputTokens: 1024,
          },
        }),
      },
    );
  } catch {
    console.error("[argue] Gemini roommate response request failed before receiving a response.");
    return null;
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(
      `[argue] Gemini roommate response rejected; status=${response.status}; message=${result.error?.message || "No Gemini error body."}`,
    );
    return null;
  }

  const generatedText = result.candidates?.[0]?.content?.parts?.[0]?.text;
  const parsed = parseJsonObject(generatedText);
  if (!parsed?.roommateLine) {
    console.error("[argue] Gemini roommate response was not usable JSON.", {
      finishReason: result.candidates?.[0]?.finishReason,
      generatedText,
    });
    return null;
  }

  console.info("[argue] Gemini roommate response ready.");
  return {
    attack: {
      name: truncateForDisplay(parsed.attackName || "Deflection Burst", 48),
      line: truncateForDisplay(parsed.attackLine || `You said: "${truncateForDisplay(transcript, 130)}"`, 180),
    },
    roommateLine: truncateForDisplay(parsed.roommateLine, 260),
  };
}

const VALID_STT_MODES = ["nova", "flux"];

// Reads an env var as a number, clamped to [min, max]. Deepgram rejects the
// whole websocket connection (close code 1006) if a query param value is
// out of its accepted range, so we clamp defensively here rather than
// finding out live during a demo. Every fallback is logged loudly so a
// misconfigured .env never fails silently.
function resolveNumericEnv(name, { min, max, fallback }) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    console.warn(`[voice] ${name}="${raw}" is not a number; using default ${fallback}.`);
    return fallback;
  }
  if (value < min || value > max) {
    const clamped = Math.min(max, Math.max(min, value));
    console.warn(`[voice] ${name}=${value} is outside the expected range [${min}, ${max}]; clamped to ${clamped}.`);
    return clamped;
  }
  return value;
}

// Resolves DEEPGRAM_STT_MODE to a known value. An unset or unrecognized
// mode (typo, leftover value from a different branch, etc.) falls back to
// "nova" -- the long-proven path -- instead of breaking voice entirely.
// The fallback is always logged so it is never a silent surprise mid-demo.
function resolveSttMode() {
  const raw = process.env.DEEPGRAM_STT_MODE;
  if (VALID_STT_MODES.includes(raw)) return raw;
  if (raw) {
    console.warn(
      `[voice] DEEPGRAM_STT_MODE="${raw}" is not recognized (expected "nova" or "flux"); falling back to "nova".`,
    );
  }
  return "nova";
}

// Builds the Deepgram Listen websocket URL for the resolved STT mode.
// Verified against the live Flux API on 2026-06-21: an unrecognized query
// param name causes Deepgram to immediately close the connection (code
// 1006) rather than ignore it, so every param name here is one that was
// confirmed to be accepted -- do not add new ones without re-verifying.
function buildListenUrl(sttMode) {
  if (sttMode === "flux") {
    const model = process.env.DEEPGRAM_STT_MODEL || "flux-general-en";
    const eotThreshold = resolveNumericEnv("DEEPGRAM_EOT_THRESHOLD", { min: 0, max: 1, fallback: 0.7 });
    const eagerEotThreshold = resolveNumericEnv("DEEPGRAM_EAGER_EOT_THRESHOLD", {
      min: 0,
      max: 1,
      fallback: 0.6,
    });
    const eotTimeoutMs = resolveNumericEnv("DEEPGRAM_EOT_TIMEOUT_MS", { min: 500, max: 30000, fallback: 5000 });
    const params = new URLSearchParams({
      model,
      eot_threshold: String(eotThreshold),
      eager_eot_threshold: String(eagerEotThreshold),
      eot_timeout_ms: String(eotTimeoutMs),
    });
    return { listenUrl: `wss://api.deepgram.com/v2/listen?${params.toString()}`, sttModel: model };
  }

  return {
    listenUrl:
      "wss://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&interim_results=true&endpointing=550&utterance_end_ms=1000",
    sttModel: "nova-3",
  };
}

async function createDeepgramToken() {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  const enabled = process.env.USE_DEEPGRAM === "true" && Boolean(apiKey);
  const sttMode = resolveSttMode();
  console.info(
    `[voice] /api/voice/token requested; USE_DEEPGRAM=${process.env.USE_DEEPGRAM}; keyPresent=${Boolean(apiKey)}; sttMode=${sttMode}`,
  );

  if (!enabled) {
    console.info("[voice] Deepgram disabled or missing key; returning browser speech fallback.");
    return {
      status: 200,
      body: {
        mode: "mock",
        token: null,
        expiresIn: 0,
        listenUrl: null,
        sttMode,
        message:
          "Deepgram is in mock mode. Add DEEPGRAM_API_KEY and set USE_DEEPGRAM=true for live transcription.",
      },
    };
  }

  let response;
  try {
    console.info("[voice] Requesting temporary Deepgram token from /v1/auth/grant.");
    response = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: {
        authorization: `Token ${apiKey}`,
      },
    });
  } catch {
    console.error("[voice] Deepgram token request failed before receiving a response.");
    return {
      status: 200,
      body: {
        mode: "mock",
        token: null,
        expiresIn: 0,
        listenUrl: null,
        sttMode,
        message:
          "Deepgram could not be reached, so FizzBuzz is using browser speech captions for this round.",
        deepgramStatus: 0,
      },
    };
  }

  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result.access_token) {
    const deepgramMessage = result.err_msg || result.error?.message || result.error;
    console.error(
      `[voice] Deepgram token request rejected; status=${response.status}; message=${deepgramMessage || "No Deepgram error body."}`,
    );
    return {
      status: 200,
      body: {
        mode: "mock",
        token: null,
        expiresIn: 0,
        listenUrl: null,
        sttMode,
        message:
          response.status === 403
            ? "Deepgram rejected the API key or project permissions, so FizzBuzz is using browser speech captions for this round."
            : deepgramMessage || "Deepgram token minting failed, so FizzBuzz is using browser speech captions for this round.",
        deepgramStatus: response.status,
      },
    };
  }

  const { listenUrl, sttModel } = buildListenUrl(sttMode);
  console.info(
    `[voice] Deepgram token granted; expiresIn=${result.expires_in || 30}; sttMode=${sttMode}; sttModel=${sttModel}; listenUrl=${listenUrl}`,
  );
  return {
    status: 200,
    body: {
      mode: "deepgram",
      token: result.access_token,
      authProtocol: "bearer",
      expiresIn: result.expires_in || 30,
      sttMode,
      sttModel,
      listenUrl,
    },
  };
}

async function synthesizeDeepgramSpeech(payload) {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  const enabled = process.env.USE_DEEPGRAM === "true" && Boolean(apiKey);
  const text = createSpeechText(payload.text);
  const model = process.env.DEEPGRAM_TTS_MODEL || "aura-2-thalia-en";

  console.info(
    `[voice] /api/voice/speak requested; USE_DEEPGRAM=${process.env.USE_DEEPGRAM}; keyPresent=${Boolean(apiKey)}; chars=${text.length}; model=${model}`,
  );

  if (!text) {
    return {
      status: 400,
      body: {
        mode: "mock",
        error: "No text was provided for TTS.",
      },
    };
  }

  if (!enabled) {
    console.info("[voice] Deepgram TTS disabled or missing key; returning browser speech fallback.");
    return {
      status: 202,
      body: {
        mode: "mock",
        message: "Deepgram TTS is disabled, so FizzBuzz is using browser speech synthesis.",
      },
    };
  }

  let response;
  try {
    console.info("[voice] Requesting Deepgram TTS audio from /v1/speak.");
    response = await fetch(
      `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(model)}`,
      {
        method: "POST",
        headers: {
          authorization: `Token ${apiKey}`,
          "content-type": "application/json",
          accept: "audio/mpeg",
        },
        body: JSON.stringify({ text }),
      },
    );
  } catch {
    console.error("[voice] Deepgram TTS request failed before receiving a response.");
    return {
      status: 202,
      body: {
        mode: "mock",
        message: "Deepgram TTS could not be reached, so FizzBuzz is using browser speech synthesis.",
        deepgramStatus: 0,
      },
    };
  }

  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    const bodyText = await response.text().catch(() => "");
    let deepgramMessage = bodyText;
    if (contentType.includes("application/json")) {
      try {
        const body = JSON.parse(bodyText);
        deepgramMessage = body.err_msg || body.error?.message || body.error || bodyText;
      } catch {
        // Keep the raw response body for logging.
      }
    }
    console.error(
      `[voice] Deepgram TTS request rejected; status=${response.status}; message=${deepgramMessage || "No Deepgram error body."}`,
    );
    return {
      status: 202,
      body: {
        mode: "mock",
        message: "Deepgram TTS rejected the request, so FizzBuzz is using browser speech synthesis.",
        deepgramStatus: response.status,
        deepgramMessage,
      },
    };
  }

  const audio = Buffer.from(await response.arrayBuffer());
  console.info(
    `[voice] Deepgram TTS audio ready; bytes=${audio.length}; requestId=${response.headers.get("dg-request-id") || "none"}`,
  );

  return {
    status: 200,
    audio,
    contentType: response.headers.get("content-type") || "audio/mpeg",
    headers: {
      "dg-request-id": response.headers.get("dg-request-id") || "",
      "dg-model-name": response.headers.get("dg-model-name") || model,
    },
  };
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function createApp() {
  const app = express();

  app.use("/api", express.json({ limit: "12mb" }));
  app.use("/api", (error, request, response, next) => {
    if (!error) {
      next();
      return;
    }
    response.status(error.status || 400).json({
      error:
        error.type === "entity.too.large"
          ? "That image is too large for forehead mode. Try a smaller or cropped face photo."
          : "The request body was not valid JSON.",
    });
  });

  app.get("/api/health", (request, response) => {
    const sttMode = resolveSttMode();
    const { sttModel } = buildListenUrl(sttMode);
    response.json({
      ok: true,
      service: "fizzbuzz-backend",
      frontend: isProduction ? "static-dist" : "vite-dev-middleware",
      integrations: {
        openai: process.env.USE_OPENAI === "true",
        geminiImage: process.env.USE_GEMINI_IMAGE === "true" && Boolean(process.env.GEMINI_API_KEY),
        geminiText: process.env.USE_GEMINI_TEXT !== "false" && Boolean(process.env.GEMINI_API_KEY),
        deepgram: process.env.USE_DEEPGRAM === "true",
        // Reported regardless of USE_DEEPGRAM so a misconfigured mode is
        // visible even while Deepgram itself is disabled.
        deepgramSttMode: sttMode,
        deepgramSttModel: sttModel,
        pika: process.env.USE_PIKA === "true",
      },
    });
  });

  app.post("/api/session", (request, response) => {
    response.status(201).json(createSession(request.body || {}));
  });

  app.post("/api/argue", async (request, response) => {
    const next = await advanceArgument(request.body?.sessionId, request.body?.transcript);
    if (!next) {
      response.status(404).json({ error: "Unknown confrontation session" });
      return;
    }
    response.json(next);
  });

  app.post("/api/voice/token", async (request, response) => {
    const token = await createDeepgramToken();
    response.status(token.status).json(token.body);
  });

  app.post("/api/voice/speak", async (request, response) => {
    const speech = await synthesizeDeepgramSpeech(request.body || {});
    if (speech.audio) {
      response.status(speech.status);
      response.setHeader("content-type", speech.contentType);
      response.setHeader("cache-control", "no-store");
      for (const [key, value] of Object.entries(speech.headers)) {
        if (value) response.setHeader(key, value);
      }
      response.send(speech.audio);
      return;
    }
    response.status(speech.status).json(speech.body);
  });

  app.post("/api/media/avatar", (request, response) => {
    response.status(202).json({
      mode: process.env.USE_PIKA === "true" ? "pika" : "mock",
      jobId: randomUUID(),
      prompt: `0.5 zoom meme yapping roommate, boss battle intro, situation: ${shortTopic(request.body?.argument)}`,
      status: "queued",
      message: "Pika job hook is ready. Wire this endpoint to the Pika API when credentials are available.",
    });
  });

  app.post("/api/media/forehead", async (request, response) => {
    const generated = await generateForeheadPortrait(request.body || {});
    response.status(generated.status).json(generated.body);
  });

  return app;
}

async function attachFrontend(app) {
  if (isProduction) {
    app.use(express.static(distClientDir));
    app.get("*", (request, response) => {
      response.sendFile(join(distClientDir, "index.html"));
    });
    return;
  }

  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    root: clientDir,
    server: {
      middlewareMode: true,
    },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

async function listenWithFallback(targetPort, attemptsLeft = 10) {
  const app = createApp();
  await attachFrontend(app);

  const server = app.listen(targetPort, host, () => {
    console.log(`FizzBuzz listening at http://${host}:${targetPort}`);
  });

  server.once("error", async (error) => {
    if (error.code === "EADDRINUSE" && attemptsLeft > 1) {
      console.log(`Port ${targetPort} is busy; trying ${targetPort + 1}.`);
      await listenWithFallback(targetPort + 1, attemptsLeft - 1);
      return;
    }

    console.error(`Could not start FizzBuzz on ${host}:${targetPort}.`);
    console.error(error.message);
    process.exitCode = 1;
  });
}

await listenWithFallback(port);
