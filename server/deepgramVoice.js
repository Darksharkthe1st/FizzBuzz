import { clampNumber, createSpeechText, shortTopic } from "./utils.js";

const VALID_STT_MODES = ["nova", "flux"];
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

export function resolveNumericEnv(name, { min, max, fallback }) {
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

export function resolveSttMode() {
  const raw = process.env.DEEPGRAM_STT_MODE;
  if (VALID_STT_MODES.includes(raw)) return raw;
  if (raw) {
    console.warn(
      `[voice] DEEPGRAM_STT_MODE="${raw}" is not recognized (expected "nova" or "flux"); falling back to "nova".`,
    );
  }
  return "nova";
}

export function buildListenUrl(sttMode) {
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

export async function createDeepgramToken() {
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
  const thinkProvider = process.env.DEEPGRAM_AGENT_LLM_PROVIDER || "google";
  const thinkModel = process.env.DEEPGRAM_AGENT_LLM_MODEL || "gemini-2.5-flash";
  const speakModel = resolveTtsModel(payload.ttsModel || process.env.DEEPGRAM_AGENT_TTS_MODEL);
  const thinkKey = process.env.DEEPGRAM_AGENT_LLM_KEY || process.env.GEMINI_API_KEY;
  const thinkProviderConfig = {
    type: thinkProvider,
    temperature: profile.temperature,
  };

  const think = {
    provider: thinkProviderConfig,
    prompt: createAgentPrompt(profile, payload),
    context_length: 4000,
  };

  if (thinkProvider === "google" && thinkKey) {
    think.endpoint = {
      url:
        process.env.DEEPGRAM_AGENT_LLM_ENDPOINT ||
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(thinkModel)}:streamGenerateContent?alt=sse`,
      headers: {
        "x-goog-api-key": thinkKey,
      },
    };
  } else {
    thinkProviderConfig.model = thinkModel;
  }

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
        think,
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

export async function createDeepgramAgentConfig(payload) {
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

function resolveTtsSpeed(rawSpeed) {
  return clampNumber(rawSpeed, 0.7, 1.5, 1.0);
}

export function resolveTtsModel(requestedModel) {
  const fallback = process.env.DEEPGRAM_TTS_MODEL || "aura-2-thalia-en";
  if (typeof requestedModel === "string" && ALLOWED_TTS_MODELS.has(requestedModel)) {
    return requestedModel;
  }
  if (requestedModel) {
    console.warn(`[voice] Requested TTS model "${requestedModel}" is not on the allowlist; using "${fallback}".`);
  }
  return fallback;
}

export async function synthesizeDeepgramSpeech(payload) {
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
