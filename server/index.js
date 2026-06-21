import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = resolve(__dirname, "..");
const publicDir = rootDir;

await loadDotEnv(join(rootDir, ".env"));

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 5175);

const sessions = new Map();

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

const publicFiles = new Set(["index.html", "styles.css", "script.js", "favicon.ico"]);

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

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(body);
}

function readRequestJson(request) {
  return new Promise((resolveBody, rejectBody) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        rejectBody(new Error("Request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!body) {
        resolveBody({});
        return;
      }
      try {
        resolveBody(JSON.parse(body));
      } catch {
        rejectBody(new Error("Invalid JSON"));
      }
    });
    request.on("error", rejectBody);
  });
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

async function routeApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      service: "fizzbuzz-backend",
      integrations: {
        openai: process.env.USE_OPENAI === "true",
        deepgram: process.env.USE_DEEPGRAM === "true",
        pika: process.env.USE_PIKA === "true",
      },
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/session") {
    const payload = await readRequestJson(request);
    sendJson(response, 201, createSession(payload));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/argue") {
    const payload = await readRequestJson(request);
    const next = advanceArgument(payload.sessionId);
    if (!next) {
      sendJson(response, 404, { error: "Unknown confrontation session" });
      return;
    }
    sendJson(response, 200, next);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/voice/token") {
    sendJson(response, 200, {
      mode: process.env.USE_DEEPGRAM === "true" ? "deepgram" : "mock",
      token: null,
      message: "Deepgram token minting hook is ready. Add DEEPGRAM_API_KEY and implement server-side token creation here.",
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/media/avatar") {
    const payload = await readRequestJson(request);
    sendJson(response, 202, {
      mode: process.env.USE_PIKA === "true" ? "pika" : "mock",
      jobId: randomUUID(),
      prompt: `0.5 zoom meme yapping roommate, boss battle intro, situation: ${shortTopic(payload.argument)}`,
      status: "queued",
      message: "Pika job hook is ready. Wire this endpoint to the Pika API when credentials are available.",
    });
    return;
  }

  sendJson(response, 404, { error: "API route not found" });
}

async function serveStatic(url, response) {
  const rawPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = normalize(decodeURIComponent(rawPath))
    .replace(/^[/\\]+/, "")
    .replace(/^(\.\.[/\\])+/, "");

  if (!publicFiles.has(safePath)) {
    response.writeHead(404, {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end("Not found");
    return;
  }

  const filePath = resolve(join(publicDir, safePath));

  if (!filePath.startsWith(publicDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const data = await readFile(filePath);
    response.writeHead(200, {
      "content-type": contentTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(data);
  } catch {
    const fallback = await readFile(join(publicDir, "index.html"));
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(fallback);
  }
}

function createAppServer() {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", `http://${request.headers.host || `${host}:${port}`}`);
      if (url.pathname.startsWith("/api/")) {
        await routeApi(request, response, url);
        return;
      }
      await serveStatic(url, response);
    } catch (error) {
      sendJson(response, 500, { error: error.message || "Internal server error" });
    }
  });
}

function listenWithFallback(targetPort, attemptsLeft = 10) {
  const server = createAppServer();
  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && attemptsLeft > 1) {
      console.log(`Port ${targetPort} is busy; trying ${targetPort + 1}.`);
      listenWithFallback(targetPort + 1, attemptsLeft - 1);
      return;
    }

    console.error(`Could not start FizzBuzz backend on ${host}:${targetPort}.`);
    console.error(error.message);
    process.exitCode = 1;
  });

  server.listen(targetPort, host, () => {
    console.log(`FizzBuzz backend listening at http://${host}:${targetPort}`);
  });
}

listenWithFallback(port);
