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

const AGENT_MODES = new Set(["easy", "medium", "hard"]);

const agentDifficultyBank = {
  easy: {
    label: "Easy Agent",
    temperature: 0.62,
    prompt:
      "You are the FizzBuzz Easy roommate boss: evasive but ultimately coachable. Reply as the roommate only. Be funny, brief, and defensive at first, but concede quickly when the user makes a clear, calm ask. Never narrate game mechanics. Never be threatening.",
    greeting:
      "Okay, I am opening the door, but I reserve the right to misunderstand the entire situation.",
  },
  medium: {
    label: "Medium Agent",
    temperature: 0.78,
    prompt:
      "You are the FizzBuzz Medium roommate boss: funny, evasive, and allergic to accountability. Reply as the roommate only. React to the user's exact complaint, deflect once, then leave a small opening for a clear boundary. Keep responses to one or two punchy sentences. Never narrate game mechanics. Never be threatening.",
    greeting:
      "What? I was literally about to handle it, emotionally if not logistically.",
  },
  hard: {
    label: "Hard Agent",
    temperature: 0.92,
    prompt:
      "You are the FizzBuzz Hard roommate boss: a high-pressure deflection machine. Reply as the roommate only. Be funny, specific, and slippery, using excuses, technicalities, and fake confusion. Still keep it playful and non-threatening. Reward clear boundaries by grudgingly softening. Keep responses short enough for live voice.",
    greeting:
      "Before you start, I just need to say the evidence has a lot of context you are choosing to ignore.",
  },
};

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
    turnLog: [],
    analysisCache: new Map(),
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

// Calm Boundary Meter heuristic (Tier 2 #5). Pure local scoring -- no
// Deepgram dependency, since this needs to work even when voice falls back
// to typed/browser mode. Each rule contributes a signed delta and a label;
// the sum (clamped) is added straight onto battle damage so a clear, calm,
// specific sentence does more damage than rambling, the way the plan's
// acceptance criteria asks for.
const ESCALATION_WORDS = [
  "shut up", "idiot", "stupid", "hate you", "or else", "i swear", "moron", "pathetic",
];
const CLEAR_ASK_PATTERN = /\b(please|i need you to|i need to|can you|could you|i'd like you to|i want you to)\b/i;
const BOUNDARY_PATTERN = /\b(i won't|i will not|not okay|not ok|needs to stop|this stops|going forward|next time|i'm done|i am done)\b/i;

function scoreBoundary(transcript, argument) {
  const heard = String(transcript || "").trim();
  const lowerHeard = heard.toLowerCase();
  const wordCount = heard.split(/\s+/).filter(Boolean).length;
  const labels = [];
  let score = 0;
  let escalation = false;

  const argumentWords = new Set(
    String(argument || "")
      .toLowerCase()
      .split(/\W+/)
      .filter((word) => word.length > 3),
  );
  const overlap = lowerHeard.split(/\W+/).filter((word) => argumentWords.has(word)).length;
  if (overlap >= 2) {
    score += 10;
    labels.push({ text: "Specific ask bonus", penalty: false });
  } else if (overlap === 1) {
    score += 5;
    labels.push({ text: "Boundary clarity +5", penalty: false });
  }

  if (CLEAR_ASK_PATTERN.test(heard)) {
    score += 8;
    labels.push({ text: "Clear ask bonus", penalty: false });
  }

  if (BOUNDARY_PATTERN.test(heard)) {
    score += 8;
    labels.push({ text: "Boundary stated", penalty: false });
  }

  if (heard && wordCount < 3) {
    score -= 6;
    labels.push({ text: "Mumbled evidence penalty", penalty: true });
  }

  if (ESCALATION_WORDS.some((word) => lowerHeard.includes(word))) {
    score -= 10;
    escalation = true;
    labels.push({ text: "Escalation warning", penalty: true });
  }

  return { score: clampNumber(score, -15, 30, 0), labels, escalation };
}

// Local fallback for Deepgram Intelligence -- keyword-only, used when
// Deepgram is disabled/unreachable so analysis never blocks a turn.
function localAnalysisFallback(text) {
  const lower = text.toLowerCase();
  let sentimentLabel = "calm";
  if (/!{2,}|shut up|idiot|stupid|hate/.test(lower)) sentimentLabel = "heated";
  else if (/sorry|whatever|fine\.?$/.test(lower)) sentimentLabel = "petty but valid";

  let topicLabel = "general grievance";
  if (/rent|money|bill|pay|owe/.test(lower)) topicLabel = "money";
  else if (/loud|noise|music|party/.test(lower)) topicLabel = "noise";
  else if (/dish|trash|clean|chore|sink|laundry/.test(lower)) topicLabel = "chores";
  else if (/coke|soda|fridge|freezer|snack|food/.test(lower)) topicLabel = "food crime";

  let intentLabel = "setting_boundary";
  if (/sorry|apolog/.test(lower)) intentLabel = "seeking_apology";
  else if (/clean|fix|pay|stop|replace/.test(lower)) intentLabel = "requesting_cleanup";

  return { sentimentLabel, topicLabel, intentLabel, summary: text, source: "local" };
}

// Maps a live Deepgram /v1/read response into game copy. Verified live
// against the real API on 2026-06-21: results.sentiments.average.{sentiment,
// sentiment_score}, results.topics.segments[].topics[].topic, and
// results.intents.segments[].intents[].intent are all real response shapes,
// not guesses.
function mapDeepgramAnalysis(body, text) {
  const lower = text.toLowerCase();
  const average = body.results?.sentiments?.average;
  const sentimentScore = typeof average?.sentiment_score === "number" ? average.sentiment_score : 0;
  const sentimentRaw = average?.sentiment || "neutral";

  let sentimentLabel = "calm";
  if (sentimentRaw === "negative") {
    sentimentLabel = sentimentScore <= -0.6 ? "heated" : "petty but valid";
  } else if (sentimentRaw === "positive") {
    sentimentLabel = "calm";
  }

  const dgTopics = (body.results?.topics?.segments || []).flatMap((segment) =>
    (segment.topics || []).map((topic) => topic.topic),
  );
  let topicLabel = "general grievance";
  if (/rent|money|bill|pay|owe/.test(lower)) topicLabel = "money";
  else if (/loud|noise|music|party/.test(lower)) topicLabel = "noise";
  else if (/dish|trash|clean|chore|sink|laundry/.test(lower)) topicLabel = "chores";
  else if (/coke|soda|fridge|freezer|snack|food/.test(lower)) topicLabel = "food crime";
  else if (dgTopics[0]) topicLabel = dgTopics[0].toLowerCase();

  let intentLabel = "setting_boundary";
  if (/sorry|apolog/.test(lower)) intentLabel = "seeking_apology";
  else if (/clean|fix|pay|stop|replace/.test(lower)) intentLabel = "requesting_cleanup";

  return {
    sentimentLabel,
    topicLabel,
    intentLabel,
    summary: body.results?.summary?.text || text,
    source: "deepgram",
  };
}

// Deepgram Intelligence round analysis (Tier 2 #6). Cached per-session by
// exact transcript text so a re-render or duplicate call never re-spends a
// Deepgram request on the same line. Falls back to the local heuristic on
// any failure so a flaky network call never blocks the battle from
// advancing.
async function analyzeTranscript(session, transcript) {
  const text = String(transcript || "").trim();
  if (!text) return null;
  if (session.analysisCache.has(text)) {
    return session.analysisCache.get(text);
  }

  const apiKey = process.env.DEEPGRAM_API_KEY;
  const enabled = process.env.USE_DEEPGRAM === "true" && Boolean(apiKey);
  let result;

  if (!enabled) {
    result = localAnalysisFallback(text);
  } else {
    try {
      const response = await fetch(
        "https://api.deepgram.com/v1/read?language=en&sentiment=true&intents=true&topics=true&summarize=true",
        {
          method: "POST",
          headers: {
            authorization: `Token ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ text }),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error(`[analyze] Deepgram Read rejected; status=${response.status}; falling back to local heuristic.`);
        result = localAnalysisFallback(text);
      } else {
        result = mapDeepgramAnalysis(body, text);
      }
    } catch (error) {
      console.error("[analyze] Deepgram Read request failed before receiving a response.", error.message);
      result = localAnalysisFallback(text);
    }
  }

  session.analysisCache.set(text, result);
  return result;
}

// Post-fight Deepgram fight card (Tier 2 #7), built from the session's
// accumulated turnLog at the moment the boss reaches 0.
function buildFightCard(session) {
  const turns = session.turnLog;
  const withConfidence = turns.filter((turn) => typeof turn.confidence === "number");
  const avgConfidence = withConfidence.length
    ? withConfidence.reduce((sum, turn) => sum + turn.confidence, 0) / withConfidence.length
    : null;
  const avgBoundary = turns.length
    ? Math.round(turns.reduce((sum, turn) => sum + turn.boundaryScore, 0) / turns.length)
    : 0;
  const best = turns.reduce((best, turn) => (!best || turn.boundaryScore > best.boundaryScore ? turn : best), null);
  const heatedCount = turns.filter((turn) => turn.sentimentLabel === "heated").length;

  let coachingNote = "You stayed steady. A few more specific asks would have ended this even faster.";
  if (avgBoundary >= 10) {
    coachingNote = "Your asks were specific and your boundaries were clear -- that's the actual win condition.";
  } else if (turns.length && heatedCount > turns.length / 2) {
    coachingNote = "You won, but the heat crept in. Lock the ask in before the volume rises next time.";
  }

  return {
    bestLine: best?.heard || "(silence, but a powerful one)",
    turns: turns.length,
    avgConfidence,
    avgBoundary,
    deflectionsResisted: turns.length,
    coachingNote,
  };
}

async function scoreArgumentTurn(session, transcript = "", confidence) {
  const boundary = scoreBoundary(transcript, session.argument);
  const analysis = await analyzeTranscript(session, transcript);

  const baseDamage = 10 + session.evidence * 3;
  const damage = Math.max(4, baseDamage + boundary.score);
  const recoil = Math.max(3, session.aggro * 2 - session.evidence + (boundary.escalation ? 5 : 0));

  session.round += 1;
  session.exchange += 1;
  session.boss = Math.max(0, session.boss - damage);
  session.player = Math.max(0, session.player - recoil);

  const heard = truncateForDisplay(transcript, 180);
  session.turnLog.push({
    round: session.round,
    heard,
    confidence: typeof confidence === "number" ? confidence : null,
    boundaryScore: boundary.score,
    sentimentLabel: analysis?.sentimentLabel || null,
  });

  const complete = session.boss === 0;
  const result = {
    sessionId: session.id,
    round: session.round,
    player: session.player,
    boss: session.boss,
    heard,
    complete,
    boundary: { score: boundary.score, labels: boundary.labels },
    analysis: analysis
      ? {
          sentimentLabel: analysis.sentimentLabel,
          topicLabel: analysis.topicLabel,
          intentLabel: analysis.intentLabel,
          source: analysis.source,
        }
      : null,
  };

  if (complete) {
    result.fightCard = buildFightCard(session);
  }

  return result;
}

async function advanceArgument(sessionId, transcript = "", confidence) {
  const session = sessions.get(sessionId);
  if (!session) {
    return null;
  }

  const defensive =
    (await generateGeminiArgumentTurn(session, transcript)) || chooseDefensiveResponse(session, transcript);
  const result = await scoreArgumentTurn(session, transcript, confidence);
  return {
    ...result,
    attack: defensive.attack,
    roommateLine: result.complete
      ? "Roommate has been stunned by a complete sentence. They agree to clean it today, allegedly."
      : defensive.roommateLine,
  };
}

async function scoreAgentArgument(sessionId, transcript = "", confidence) {
  const session = sessions.get(sessionId);
  if (!session) {
    return null;
  }

  const result = await scoreArgumentTurn(session, transcript, confidence);
  const counter = counterBank[(session.exchange - 1) % counterBank.length] || counterBank[0];
  return {
    ...result,
    attack: {
      name: counter.name,
      line: transcript
        ? `You said: "${truncateForDisplay(transcript, 130)}"`
        : counter.line,
    },
    roommateLine: result.complete
      ? "Roommate has been stunned by a complete sentence. They agree to clean it today, allegedly."
      : "",
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

function resolveAgentMode(mode) {
  return AGENT_MODES.has(mode) ? mode : "medium";
}

function createAgentPrompt(profile, payload = {}) {
  return [
    profile.prompt,
    `The user's grievance topic is: ${shortTopic(payload.argument, 120)}.`,
    `Evidence strength: ${clampNumber(payload.evidence, 1, 5, 4)}/5.`,
    `Roommate aggro setting: ${clampNumber(payload.aggro, 1, 5, 3)}/5.`,
    "When the user states a clear, calm, specific boundary, soften or concede a little.",
    "Do not mention Deepgram, transcripts, health bars, scoring, JSON, or being an AI.",
  ].join("\n");
}

function createAgentSettings(mode, payload = {}) {
  const resolvedMode = resolveAgentMode(mode);
  const profile = agentDifficultyBank[resolvedMode];
  const listenModel = process.env.DEEPGRAM_AGENT_STT_MODEL || "flux-general-en";
  const thinkProvider = process.env.DEEPGRAM_AGENT_LLM_PROVIDER || "open_ai";
  const thinkModel = process.env.DEEPGRAM_AGENT_LLM_MODEL || "gpt-4o-mini";
  const speakModel = resolveTtsModel(payload.ttsModel || process.env.DEEPGRAM_AGENT_TTS_MODEL);

  return {
    mode: resolvedMode,
    label: profile.label,
    settings: {
      type: "Settings",
      tags: ["fizzbuzz", "voice_agent", resolvedMode],
      audio: {
        input: {
          encoding: "linear16",
          sample_rate: 24000,
        },
        output: {
          encoding: "linear16",
          sample_rate: 24000,
          container: "none",
        },
      },
      agent: {
        language: "en",
        listen: {
          provider: {
            type: "deepgram",
            model: listenModel,
            version: listenModel.startsWith("flux-") ? "v2" : undefined,
            eot_threshold: resolveNumericEnv("DEEPGRAM_EOT_THRESHOLD", { min: 0, max: 1, fallback: 0.7 }),
            eager_eot_threshold: resolveNumericEnv("DEEPGRAM_EAGER_EOT_THRESHOLD", {
              min: 0,
              max: 1,
              fallback: 0.6,
            }),
            eot_timeout_ms: resolveNumericEnv("DEEPGRAM_EOT_TIMEOUT_MS", {
              min: 500,
              max: 30000,
              fallback: 5000,
            }),
          },
        },
        think: {
          provider: {
            type: thinkProvider,
            model: thinkModel,
            temperature: profile.temperature,
          },
          prompt: createAgentPrompt(profile, payload),
          context_length: 4000,
        },
        speak: {
          provider: {
            type: "deepgram",
            model: speakModel,
          },
        },
        greeting: profile.greeting,
      },
    },
  };
}

async function createDeepgramAgentConfig(payload) {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  const enabled = process.env.USE_DEEPGRAM === "true" && Boolean(apiKey);
  const agentMode = resolveAgentMode(payload.mode);
  const agent = createAgentSettings(agentMode, payload);

  console.info(
    `[agent] /api/voice/agent requested; USE_DEEPGRAM=${process.env.USE_DEEPGRAM}; keyPresent=${Boolean(apiKey)}; mode=${agent.mode}`,
  );

  if (!enabled) {
    return {
      status: 200,
      body: {
        mode: "mock",
        agentMode: agent.mode,
        label: agent.label,
        message:
          "Deepgram Agent mode needs DEEPGRAM_API_KEY and USE_DEEPGRAM=true. Falling back to turn-style/browser captions.",
      },
    };
  }

  let response;
  try {
    response = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: {
        authorization: `Token ${apiKey}`,
      },
    });
  } catch {
    return {
      status: 200,
      body: {
        mode: "mock",
        agentMode: agent.mode,
        label: agent.label,
        message: "Deepgram Agent token minting could not be reached. Falling back to turn-style.",
        deepgramStatus: 0,
      },
    };
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token) {
    const deepgramMessage = result.err_msg || result.error?.message || result.error;
    return {
      status: 200,
      body: {
        mode: "mock",
        agentMode: agent.mode,
        label: agent.label,
        message: deepgramMessage || "Deepgram Agent token minting failed. Falling back to turn-style.",
        deepgramStatus: response.status,
      },
    };
  }

  return {
    status: 200,
    body: {
      mode: "deepgram-agent",
      agentMode: agent.mode,
      label: agent.label,
      token: result.access_token,
      authProtocol: "bearer",
      expiresIn: result.expires_in || 30,
      agentUrl: process.env.DEEPGRAM_AGENT_URL || "wss://agent.deepgram.com/v1/agent/converse",
      settings: agent.settings,
    },
  };
}

// Verified live against /v1/speak with aura-2-thalia-en on 2026-06-21: the
// API accepts a `speed` query param and it genuinely changes playback pace
// (confirmed via output byte size at fixed text length), but the accepted
// range is narrower than Deepgram's docs might suggest -- 0.65 and 1.6 both
// returned 400, while 0.7 and 1.5 succeeded. Clamp inside that verified
// window, not a guessed one. There is also no `dg-speed-used` response
// header in practice (the plan's wording assumed one) -- the exposed
// headers on a real response are dg-model-name, dg-model-uuid,
// dg-additional-model-uuids, dg-char-count, dg-request-id, dg-project-id,
// dg-error, dg-breaks-applied, dg-pronunciations-applied,
// dg-pronunciation-warnings. Don't try to read or forward dg-speed-used.
function resolveTtsSpeed(rawSpeed) {
  return clampNumber(rawSpeed, 0.7, 1.5, 1.0);
}

// Voice Casting model allowlist. Each of these was confirmed live against
// /v1/speak on 2026-06-21 (200 + matching dg-model-name); aura-2-helios-en
// was tried and rejected (400) so it is deliberately excluded. An
// unrecognized or missing requested model falls back to DEEPGRAM_TTS_MODEL
// rather than failing the request, since a bad client-side voice id should
// never break TTS mid-demo.
const ALLOWED_TTS_MODELS = new Set([
  "aura-2-thalia-en",
  "aura-2-arcas-en",
  "aura-2-zeus-en",
  "aura-2-orion-en",
  "aura-2-luna-en",
  "aura-2-andromeda-en",
  "aura-2-apollo-en",
  "aura-2-hera-en",
  "aura-2-orpheus-en",
  "aura-2-cora-en",
  "aura-2-aries-en",
]);

function resolveTtsModel(requestedModel) {
  const fallback = process.env.DEEPGRAM_TTS_MODEL || "aura-2-thalia-en";
  if (typeof requestedModel === "string" && ALLOWED_TTS_MODELS.has(requestedModel)) {
    return requestedModel;
  }
  if (requestedModel) {
    console.warn(`[voice] Requested TTS model "${requestedModel}" is not on the allowlist; using "${fallback}".`);
  }
  return fallback;
}

async function synthesizeDeepgramSpeech(payload) {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  const enabled = process.env.USE_DEEPGRAM === "true" && Boolean(apiKey);
  const text = createSpeechText(payload.text);
  const model = resolveTtsModel(payload.model);
  const speed = resolveTtsSpeed(payload.speed);

  console.info(
    `[voice] /api/voice/speak requested; USE_DEEPGRAM=${process.env.USE_DEEPGRAM}; keyPresent=${Boolean(apiKey)}; chars=${text.length}; model=${model}; speed=${speed}`,
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
      `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(model)}&speed=${speed}`,
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
    `[voice] Deepgram TTS audio ready; bytes=${audio.length}; requestId=${response.headers.get("dg-request-id") || "none"}; charCount=${response.headers.get("dg-char-count") || "none"}; speed=${speed}`,
  );

  return {
    status: 200,
    audio,
    contentType: response.headers.get("content-type") || "audio/mpeg",
    headers: {
      "dg-request-id": response.headers.get("dg-request-id") || "",
      "dg-model-name": response.headers.get("dg-model-name") || model,
      "dg-char-count": response.headers.get("dg-char-count") || "",
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
        deepgramAgent: process.env.USE_DEEPGRAM === "true",
        deepgramAgentUrl: process.env.DEEPGRAM_AGENT_URL || "wss://agent.deepgram.com/v1/agent/converse",
        pika: process.env.USE_PIKA === "true",
      },
    });
  });

  app.post("/api/session", (request, response) => {
    response.status(201).json(createSession(request.body || {}));
  });

  app.post("/api/argue", async (request, response) => {
    const next = await advanceArgument(request.body?.sessionId, request.body?.transcript, request.body?.confidence);
    if (!next) {
      response.status(404).json({ error: "Unknown confrontation session" });
      return;
    }
    response.json(next);
  });

  app.post("/api/argue/score", async (request, response) => {
    const next = await scoreAgentArgument(request.body?.sessionId, request.body?.transcript, request.body?.confidence);
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

  app.post("/api/voice/agent", async (request, response) => {
    const agent = await createDeepgramAgentConfig(request.body || {});
    response.status(agent.status).json(agent.body);
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
