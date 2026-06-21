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

  if (!image) {
    return {
      status: 400,
      body: {
        error:
          "The forehead endpoint did not receive a valid image. Re-upload the roommate photo, wait for the forehead button to unlock, then try again.",
      },
    };
  }

  if (process.env.USE_GEMINI_IMAGE !== "true" || !apiKey) {
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

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-image:generateContent",
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
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
          responseFormat: {
            image: {
              aspectRatio: "1:1",
              imageSize: "1K",
            },
          },
        },
      }),
    },
  );

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      status: response.status,
      body: {
        error: result.error?.message || "Gemini image generation failed.",
      },
    };
  }

  const parts = result.candidates?.[0]?.content?.parts || [];
  const generated = parts.find((part) => part.inlineData || part.inline_data);
  const inlineData = generated?.inlineData || generated?.inline_data;

  if (!inlineData?.data) {
    return {
      status: 502,
      body: {
        error: "Gemini responded without an image.",
      },
    };
  }

  return {
    status: 200,
    body: {
      mode: "gemini",
      imageUrl: `data:${inlineData.mimeType || inlineData.mime_type || "image/png"};base64,${inlineData.data}`,
      prompt,
    },
  };
}

function advanceArgument(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    return null;
  }

  const counter = counterBank[session.exchange % counterBank.length];
  const excuse = excuseBank[(session.exchange + session.aggro) % excuseBank.length];
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
    attack: counter,
    roommateLine:
      session.boss === 0
        ? "Roommate has been stunned by a complete sentence. They agree to clean it today, allegedly."
        : excuse,
    complete: session.boss === 0,
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
    response.json({
      ok: true,
      service: "fizzbuzz-backend",
      frontend: isProduction ? "static-dist" : "vite-dev-middleware",
      integrations: {
        openai: process.env.USE_OPENAI === "true",
        geminiImage: process.env.USE_GEMINI_IMAGE === "true" && Boolean(process.env.GEMINI_API_KEY),
        deepgram: process.env.USE_DEEPGRAM === "true",
        pika: process.env.USE_PIKA === "true",
      },
    });
  });

  app.post("/api/session", (request, response) => {
    response.status(201).json(createSession(request.body || {}));
  });

  app.post("/api/argue", (request, response) => {
    const next = advanceArgument(request.body?.sessionId);
    if (!next) {
      response.status(404).json({ error: "Unknown confrontation session" });
      return;
    }
    response.json(next);
  });

  app.post("/api/voice/token", (request, response) => {
    response.json({
      mode: process.env.USE_DEEPGRAM === "true" ? "deepgram" : "mock",
      token: null,
      message: "Deepgram token minting hook is ready. Add DEEPGRAM_API_KEY and implement server-side token creation here.",
    });
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
