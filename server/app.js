import express from "express";
import { join } from "node:path";
import {
  buildListenUrl,
  createDeepgramAgentConfig,
  createDeepgramToken,
  resolveSttMode,
  synthesizeDeepgramSpeech,
} from "./deepgramVoice.js";
import { createGameService } from "./game.js";
import { createAvatarJob, generateForeheadPortrait } from "./media.js";

export async function createApp({ clientDir, distClientDir, isProduction }) {
  const app = express();
  const game = createGameService();

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
        deepgramSttMode: sttMode,
        deepgramSttModel: sttModel,
        deepgramAgent: process.env.USE_DEEPGRAM === "true",
        deepgramAgentUrl: process.env.DEEPGRAM_AGENT_URL || "wss://agent.deepgram.com/v1/agent/converse",
        pika: process.env.USE_PIKA === "true",
      },
    });
  });

  app.post("/api/session", (request, response) => {
    response.status(201).json(game.createSession(request.body || {}));
  });

  app.post("/api/argue", async (request, response) => {
    const next = await game.advanceArgument(request.body?.sessionId, request.body?.transcript, request.body?.confidence);
    if (!next) {
      response.status(404).json({ error: "Unknown confrontation session" });
      return;
    }
    response.json(next);
  });

  app.post("/api/argue/score", async (request, response) => {
    const next = await game.scoreAgentArgument(request.body?.sessionId, request.body?.transcript, request.body?.confidence);
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
    response.status(202).json(createAvatarJob(request.body || {}));
  });

  app.post("/api/media/forehead", async (request, response) => {
    const generated = await generateForeheadPortrait(request.body || {});
    response.status(generated.status).json(generated.body);
  });

  await attachFrontend(app, { clientDir, distClientDir, isProduction });
  return app;
}

async function attachFrontend(app, { clientDir, distClientDir, isProduction }) {
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
