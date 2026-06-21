import "./styles.css";

const prepScreen = document.querySelector("#prepScreen");
const battleScreen = document.querySelector("#battleScreen");
const prepForm = document.querySelector("#prepForm");
const argumentInput = document.querySelector("#argumentInput");
const evidenceInput = document.querySelector("#evidenceInput");
const aggroInput = document.querySelector("#aggroInput");
const roommatePhoto = document.querySelector("#roommatePhoto");
const photoPreview = document.querySelector("#photoPreview");
const photoEvidence = document.querySelector(".photo-evidence");
const bossPhoto = document.querySelector("#bossPhoto");
const bossPhotoWrap = document.querySelector(".roommate-avatar-wrap");
const foreheadButton = document.querySelector("#foreheadButton");
const foreheadStatus = document.querySelector("#foreheadStatus");
const hallwaySet = document.querySelector("#hallwaySet");
const doorButton = document.querySelector("#doorButton");
const knockText = document.querySelector("#knockText");
const speakButton = document.querySelector("#speakButton");
const resetButton = document.querySelector("#resetButton");
const subtitleLine = document.querySelector("#subtitleLine");
const voiceTranscript = document.querySelector("#voiceTranscript");
const voiceStatus = document.querySelector("#voiceStatus");
const voiceMeter = document.querySelector("#voiceMeter");
const attackName = document.querySelector("#attackName");
const attackCaption = document.querySelector("#attackCaption");
const roundBadge = document.querySelector("#roundBadge");
const bossTitle = document.querySelector("#bossTitle");
const floorNote = document.querySelector("#floorNote");
const playerHealth = document.querySelector("#playerHealth");
const bossHealth = document.querySelector("#bossHealth");

const state = {
  argument: "",
  sessionId: "",
  roommateLine: "",
  photoUrl: "",
  photoDataUrl: "",
  round: 1,
  player: 100,
  boss: 100,
  knocked: false,
  exchange: 0,
  evidence: 4,
  aggro: 3,
  voice: {
    active: false,
    mode: "idle",
    sttMode: "",
    sttModel: "",
    stream: null,
    recorder: null,
    socket: null,
    recognizer: null,
    finalTranscript: "",
    interimTranscript: "",
    processing: false,
  },
  tts: {
    audio: null,
    objectUrl: "",
    speaking: false,
  },
};

async function postJson(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    console.error("[api] JSON request failed.", {
      path,
      status: response.status,
      details,
    });
    throw new Error(details.error || details.message || `Request failed: ${response.status}`);
  }
  return response.json();
}

function setVoiceUi(status, transcript = "") {
  voiceStatus.textContent = status;
  voiceTranscript.textContent = transcript || "Listening for a usable grievance...";
}

function setVoiceActive(isActive) {
  state.voice.active = isActive;
  speakButton.textContent = isActive ? "Stop arguing" : "Argue live";
  hallwaySet.classList.toggle("is-listening", isActive);
  voiceMeter.style.width = isActive ? "72%" : "12%";
}

function getSpeechRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function getRecorderMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function cleanupDeepgramVoice(socket, stream, recorder, shouldCloseSocket = true) {
  if (recorder?.state === "recording") {
    recorder.stop();
  }
  if (shouldCloseSocket && socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "CloseStream" }));
    socket.close();
  }
  stream?.getTracks().forEach((track) => track.stop());

  if (state.voice.socket === socket) state.voice.socket = null;
  if (state.voice.stream === stream) state.voice.stream = null;
  if (state.voice.recorder === recorder) state.voice.recorder = null;
}

function stopRoommateSpeech() {
  if (state.tts.audio) {
    state.tts.audio.pause();
    state.tts.audio.removeAttribute("src");
    state.tts.audio.load();
  }
  if (state.tts.objectUrl) {
    URL.revokeObjectURL(state.tts.objectUrl);
  }
  window.speechSynthesis?.cancel();
  state.tts.audio = null;
  state.tts.objectUrl = "";
  state.tts.speaking = false;
}

function speakWithBrowserVoice(text) {
  if (!("speechSynthesis" in window) || !window.SpeechSynthesisUtterance) {
    console.error("[voice] Browser speech synthesis unavailable.");
    return;
  }

  console.info("[voice] Speaking roommate line with browser speech synthesis.");
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.04;
  utterance.pitch = 0.78;
  utterance.volume = 1;
  utterance.addEventListener("end", () => {
    state.tts.speaking = false;
    console.info("[voice] Browser speech synthesis ended.");
  });
  utterance.addEventListener("error", (event) => {
    state.tts.speaking = false;
    console.error("[voice] Browser speech synthesis error.", event);
  });
  state.tts.speaking = true;
  window.speechSynthesis.speak(utterance);
}

async function speakRoommateLine(line) {
  const text = String(line || "").replace(/^Roommate:\s*/i, "").replace(/^"|"$/g, "").trim();
  if (!text) return;

  stopRoommateSpeech();
  console.info("[voice] Requesting roommate TTS.", { chars: text.length });

  try {
    const response = await fetch("/api/voice/speak", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ text }),
    });
    const contentType = response.headers.get("content-type") || "";

    if (response.ok && contentType.startsWith("audio/")) {
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const audio = new Audio(objectUrl);
      state.tts.audio = audio;
      state.tts.objectUrl = objectUrl;
      state.tts.speaking = true;
      console.info("[voice] Playing Deepgram TTS audio.", {
        bytes: blob.size,
        contentType,
        requestId: response.headers.get("dg-request-id"),
        model: response.headers.get("dg-model-name"),
      });
      audio.addEventListener("ended", () => {
        console.info("[voice] Deepgram TTS playback ended.");
        stopRoommateSpeech();
      });
      audio.addEventListener("error", (event) => {
        console.error("[voice] Deepgram TTS playback error; using browser speech.", event);
        speakWithBrowserVoice(text);
      });
      await audio.play();
      return;
    }

    const details = await response.json().catch(() => ({}));
    console.warn("[voice] Deepgram TTS unavailable; using browser speech fallback.", {
      status: response.status,
      contentType,
      details,
    });
    speakWithBrowserVoice(text);
  } catch (error) {
    console.error("[voice] TTS request failed; using browser speech fallback.", error);
    speakWithBrowserVoice(text);
  }
}

async function startVoiceArgument() {
  if (state.voice.active || state.voice.processing) return;

  console.info("[voice] Argue live clicked; requesting /api/voice/token.");
  setVoiceActive(true);
  state.voice.finalTranscript = "";
  state.voice.interimTranscript = "";
  setVoiceUi("Requesting mic access. The hallway stenographer is cracking knuckles.");

  try {
    const token = await postJson("/api/voice/token", {});
    console.info("[voice] Token endpoint response:", {
      mode: token.mode,
      sttMode: token.sttMode,
      sttModel: token.sttModel,
      hasToken: Boolean(token.token),
      hasListenUrl: Boolean(token.listenUrl),
      authProtocol: token.authProtocol,
      deepgramStatus: token.deepgramStatus,
      message: token.message,
    });
    if (token.mode === "deepgram" && token.token && token.listenUrl) {
      await startDeepgramVoice(token);
      return;
    }
    startBrowserSpeechFallback(token.message);
  } catch (error) {
    console.error("[voice] /api/voice/token failed; using browser speech fallback.", error);
    startBrowserSpeechFallback(error.message);
  }
}

async function startDeepgramVoice(token) {
  state.voice.mode = "deepgram";
  state.voice.sttMode = token.sttMode || "nova";
  state.voice.sttModel = token.sttModel || "";
  console.info(`[voice] Starting Deepgram voice mode. sttMode=${state.voice.sttMode} sttModel=${state.voice.sttModel}`);
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  const authProtocol = token.authProtocol || "token";
  const socket = new WebSocket(token.listenUrl, [authProtocol, token.token]);
  const mimeType = getRecorderMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

  state.voice.stream = stream;
  state.voice.socket = socket;
  state.voice.recorder = recorder;

  socket.addEventListener("open", () => {
    if (state.voice.socket !== socket) return;
    console.info("[voice] Deepgram websocket open; starting MediaRecorder.");
    setVoiceUi("Deepgram is live. Start arguing before the roommate develops a new excuse.");
    recorder.start(250);
  });

  socket.addEventListener("message", (event) => {
    if (state.voice.socket !== socket) return;

    let data;
    try {
      data = JSON.parse(event.data);
    } catch (error) {
      console.error("[voice] Failed to parse a Deepgram websocket message; ignoring it.", {
        raw: event.data,
        error,
      });
      return;
    }

    if (data.type !== "Results") {
      // Flux's turn-taking events ("Connected", "TurnInfo", etc.) use a
      // different schema than this handler understands -- that wiring is
      // Session 2's job. Logging them here now means the real event
      // payloads are visible during manual testing instead of needing to
      // re-run the standalone discovery script every time.
      if (state.voice.sttMode === "flux") {
        console.debug("[voice] Flux event (not yet handled by the game):", data);
      }
      return;
    }

    const transcript = data.channel?.alternatives?.[0]?.transcript?.trim() || "";
    if (!transcript) return;
    console.debug("[voice] Deepgram transcript result:", {
      isFinal: Boolean(data.is_final),
      speechFinal: Boolean(data.speech_final),
      transcript,
    });

    if (data.is_final) {
      state.voice.finalTranscript = `${state.voice.finalTranscript} ${transcript}`.trim();
    } else {
      state.voice.interimTranscript = transcript;
    }

    const visibleTranscript = [state.voice.finalTranscript, state.voice.interimTranscript]
      .filter(Boolean)
      .join(" ");
    setVoiceUi(
      data.is_final ? "Heard that. The roommate is preparing an objection." : "Hearing you in real time...",
      visibleTranscript,
    );

    if (data.speech_final) {
      void resolveLiveArgument(state.voice.finalTranscript || transcript);
    }
  });

  socket.addEventListener("close", (event) => {
    console.warn("[voice] Deepgram websocket closed.", {
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean,
    });
    if (state.voice.socket !== socket) return;
    if (state.voice.active) {
      cleanupDeepgramVoice(socket, stream, recorder, false);
      setVoiceActive(false);
      setVoiceUi("Deepgram left the hallway. Try the mic again.");
    }
  });

  socket.addEventListener("error", (event) => {
    console.error("[voice] Deepgram websocket error; falling back to browser speech.", event);
    if (state.voice.socket !== socket) return;
    cleanupDeepgramVoice(socket, stream, recorder, false);
    setVoiceUi("Deepgram tripped over the doormat. Browser captions can still take a swing.");
    startBrowserSpeechFallback();
  });

  recorder.addEventListener("dataavailable", (event) => {
    if (state.voice.socket !== socket) return;
    if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
      socket.send(event.data);
    }
  });
}

function startBrowserSpeechFallback(reason = "") {
  console.info("[voice] Starting browser speech fallback.", { reason });
  const SpeechRecognition = getSpeechRecognition();
  if (!SpeechRecognition) {
    console.error("[voice] Browser speech fallback unavailable.");
    stopVoiceArgument(false);
    setVoiceUi(reason || "No Deepgram key and this browser does not expose speech captions.");
    return;
  }

  state.voice.mode = "browser";
  setVoiceActive(true);
  const recognizer = new SpeechRecognition();
  recognizer.continuous = true;
  recognizer.interimResults = true;
  recognizer.lang = "en-US";
  state.voice.recognizer = recognizer;
  let restartAttempts = 0;
  let browserSpeechFatal = false;

  recognizer.addEventListener("result", (event) => {
    restartAttempts = 0;
    let interim = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const transcript = event.results[index][0].transcript.trim();
      if (event.results[index].isFinal) {
        state.voice.finalTranscript = `${state.voice.finalTranscript} ${transcript}`.trim();
        console.debug("[voice] Browser speech final transcript:", transcript);
      } else {
        interim = transcript;
      }
    }
    state.voice.interimTranscript = interim;
    setVoiceUi(
      reason
        ? "Mock voice mode: browser captions are listening while Deepgram waits for keys."
        : "Browser captions are listening.",
      [state.voice.finalTranscript, state.voice.interimTranscript].filter(Boolean).join(" "),
    );

    if (state.voice.finalTranscript) {
      void resolveLiveArgument(state.voice.finalTranscript);
    }
  });

  recognizer.addEventListener("error", (event) => {
    console.error("[voice] Browser speech recognition error.", event);
    browserSpeechFatal = ["audio-capture", "not-allowed", "service-not-allowed"].includes(event.error);
    if (browserSpeechFatal) {
      stopVoiceArgument(false);
      setVoiceUi(event.message || "Browser captions could not access the mic.");
    }
  });

  recognizer.addEventListener("end", () => {
    console.warn("[voice] Browser speech recognition ended.");
    if (state.voice.active && !state.voice.processing) {
      if (!browserSpeechFatal && restartAttempts < 2) {
        restartAttempts += 1;
        window.setTimeout(() => {
          if (!state.voice.active || state.voice.processing || state.voice.recognizer !== recognizer) return;
          try {
            recognizer.start();
            setVoiceUi(
              reason
                ? "Mock voice mode: browser captions are listening while Deepgram waits for keys."
                : "Browser captions are listening.",
            );
          } catch (error) {
            console.error("[voice] Browser speech recognition restart failed.", error);
            stopVoiceArgument(false);
            setVoiceUi(error.message || "Browser captions could not restart.");
          }
        }, 150);
        return;
      }
      stopVoiceArgument(false);
      setVoiceUi("Mic stopped. The roommate is pretending that means they won.");
    }
  });

  try {
    recognizer.start();
    setVoiceUi(
      reason
        ? "Mock voice mode: browser captions are listening while Deepgram waits for keys."
        : "Browser captions are listening.",
    );
  } catch (error) {
    console.error("[voice] Browser speech recognition failed to start.", error);
    stopVoiceArgument(false);
    setVoiceUi(error.message || reason || "Browser captions could not start.");
  }
}

function stopVoiceArgument(shouldResolve = true) {
  const transcript = state.voice.finalTranscript || state.voice.interimTranscript;
  setVoiceActive(false);

  cleanupDeepgramVoice(state.voice.socket, state.voice.stream, state.voice.recorder);
  if (state.voice.recognizer) {
    try {
      state.voice.recognizer.stop();
    } catch (error) {
      console.debug("[voice] Browser speech recognizer was already stopped.", error);
    }
  }

  state.voice.stream = null;
  state.voice.recorder = null;
  state.voice.socket = null;
  state.voice.recognizer = null;

  if (shouldResolve) {
    void resolveLiveArgument(transcript);
  }
}

async function resolveLiveArgument(transcript) {
  const heard = String(transcript || "").trim();
  if (!heard || state.voice.processing) return;

  console.info("[voice] Resolving live argument with transcript:", heard);
  state.voice.processing = true;
  stopVoiceArgument(false);
  setVoiceUi("Roommate heard you. Unfortunately, that made them more defensive.", heard);

  try {
    await advanceBattle(heard);
  } finally {
    state.voice.finalTranscript = "";
    state.voice.interimTranscript = "";
    state.voice.processing = false;
    if (state.boss > 0) {
      speakButton.disabled = false;
      setVoiceUi("Mic ready for the next accusation.", "Say the next part out loud.");
    }
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolveFile, rejectFile) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolveFile(String(reader.result || "")));
    reader.addEventListener("error", () => rejectFile(new Error("Could not read image")));
    reader.readAsDataURL(file);
  });
}

const roommateTitles = [
  "The Deflection Engine",
  "Lord of the Unwashed Pan",
  "Baron Von Not My Problem",
  "The Carbonation Witness",
  "Duke of Suddenly Busy",
];

const excuses = [
  "I was actually about to clean that, but then the vibe in the kitchen changed.",
  "Technically, the mess became communal when everyone noticed it.",
  "I feel like focusing on the Coke can ignores the freezer's role in this.",
  "Can we not weaponize evidence while I am holding cereal?",
  "I did not leave it there. I simply stopped moving it somewhere else.",
  "This sounds like landlord energy, and I need everyone to sit with that.",
];

const counters = [
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

function shortTopic(text, limit = 70) {
  const fallback = "the exploded Coke incident";
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (!cleaned) return fallback;
  return cleaned.length > limit ? `${cleaned.slice(0, Math.max(0, limit - 3))}...` : cleaned;
}

function makeAttackName(text) {
  const topic = shortTopic(text).toLowerCase();
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

function setHealth() {
  playerHealth.style.width = `${Math.max(0, state.player)}%`;
  bossHealth.style.width = `${Math.max(0, state.boss)}%`;
}

function updateBattleCopy() {
  const topic = shortTopic(state.argument);
  const roundTopic = shortTopic(state.argument, 42);
  const titleIndex = Math.min(roommateTitles.length - 1, Math.floor((state.aggro - 1) * 1.1));
  roundBadge.textContent = `Round ${state.round}: ${roundTopic}`;
  bossTitle.textContent = roommateTitles[titleIndex];
  floorNote.textContent = `Evidence bag: ${topic}`;
  attackName.textContent = makeAttackName(state.argument);
  attackCaption.textContent = `A focused opener about "${topic}" with zero room for interpretive dance.`;
}

function applySession(session) {
  state.sessionId = session.sessionId || "";
  state.round = session.round ?? state.round;
  state.player = session.player ?? state.player;
  state.boss = session.boss ?? state.boss;
  state.roommateLine = session.roommateLine || "";
  roundBadge.textContent = `Round ${state.round}: ${session.roundTopic || shortTopic(state.argument, 42)}`;
  bossTitle.textContent = session.bossTitle || bossTitle.textContent;
  floorNote.textContent = `Evidence bag: ${session.topic || shortTopic(state.argument)}`;
  attackName.textContent = session.opener?.name || makeAttackName(state.argument);
  attackCaption.textContent =
    session.opener?.line ||
    `A focused opener about "${shortTopic(state.argument)}" with zero room for interpretive dance.`;
  setHealth();
}

function showScreen(screen) {
  prepScreen.classList.toggle("is-active", screen === "prep");
  battleScreen.classList.toggle("is-active", screen === "battle");
  window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0 }));
}

roommatePhoto.addEventListener("change", async () => {
  const file = roommatePhoto.files?.[0];
  if (!file) return;
  if (state.photoUrl) URL.revokeObjectURL(state.photoUrl);
  state.photoUrl = URL.createObjectURL(file);
  state.photoDataUrl = "";
  photoPreview.src = state.photoUrl;
  bossPhoto.src = state.photoUrl;
  photoEvidence.classList.add("has-image");
  bossPhotoWrap.classList.add("has-image");
  foreheadButton.disabled = true;
  foreheadStatus.textContent = "Loading this face into the wide-angle accusation chamber...";

  try {
    state.photoDataUrl = await readFileAsDataUrl(file);
    foreheadButton.disabled = false;
    foreheadStatus.textContent = "Ready for forehead inflation. This is legally not a flattering lens.";
  } catch {
    foreheadStatus.textContent = "The image refused to become evidence. Try a smaller photo.";
  }
});

foreheadButton.addEventListener("click", async () => {
  if (!state.photoDataUrl) return;
  foreheadButton.disabled = true;
  foreheadButton.textContent = "Inflating...";
  foreheadStatus.textContent = "Asking Nano Banana to weaponize camera angle, gently.";
  console.info("[image] Requesting forehead mode.", {
    argumentChars: argumentInput.value.length,
    imageDataUrlChars: state.photoDataUrl.length,
  });

  try {
    const generated = await postJson("/api/media/forehead", {
      imageDataUrl: state.photoDataUrl,
      argument: argumentInput.value,
    });
    console.info("[image] Forehead mode response.", {
      mode: generated.mode,
      hasImage: Boolean(generated.imageUrl),
      message: generated.message,
    });

    if (generated.imageUrl) {
      state.photoDataUrl = generated.imageUrl;
      photoPreview.src = generated.imageUrl;
      bossPhoto.src = generated.imageUrl;
      foreheadStatus.textContent = "Forehead mode applied. Accountability now has forced perspective.";
    } else {
      foreheadStatus.textContent = generated.message || "Forehead mode is ready, but needs an API key.";
    }
  } catch (error) {
    console.error("[image] Forehead mode failed.", error);
    foreheadStatus.textContent = error.message || "Forehead inflation failed. The normal photo remains armed.";
  } finally {
    foreheadButton.disabled = false;
    foreheadButton.textContent = "Inflate forehead evidence";
  }
});

prepForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  state.argument = argumentInput.value;
  state.evidence = Number(evidenceInput.value);
  state.aggro = Number(aggroInput.value);
  state.sessionId = "";
  state.roommateLine = "";
  state.round = 1;
  state.player = 100;
  state.boss = 100;
  state.exchange = 0;
  state.knocked = false;
  stopVoiceArgument(false);
  setVoiceUi("Mic is holstered until the door opens.", "Door closed. Grievance pending.");
  hallwaySet.classList.remove("is-open", "is-knocking");
  doorButton.disabled = false;
  speakButton.disabled = true;
  speakButton.textContent = "Argue live";
  knockText.textContent = "Knock";
  updateBattleCopy();
  setHealth();
  subtitleLine.textContent = "You approach the door. Somewhere inside, accountability puts on noise-canceling headphones.";
  showScreen("battle");

  try {
    const session = await postJson("/api/session", {
      argument: state.argument,
      evidence: state.evidence,
      aggro: state.aggro,
    });
    applySession(session);
  } catch {
    state.roommateLine = `What? I was literally about to deal with ${shortTopic(state.argument)}.`;
  }
});

doorButton.addEventListener("click", () => {
  if (state.knocked) return;
  state.knocked = true;
  doorButton.disabled = true;
  hallwaySet.classList.add("is-knocking");
  knockText.textContent = "KNOCK KNOCK";
  subtitleLine.textContent = "The door absorbs the knock, considers deflecting, then panics.";

  window.setTimeout(() => {
    hallwaySet.classList.remove("is-knocking");
    hallwaySet.classList.add("is-opening");
    knockText.textContent = "Opened";
    const opener =
      state.roommateLine || `What? I was literally about to deal with ${shortTopic(state.argument)}.`;
    subtitleLine.textContent = `"${opener}"`;
    speakButton.disabled = false;
    setVoiceUi("Mic ready. Deepgram can now witness this domestic masterpiece.", "Say your opening argument.");
    void speakRoommateLine(opener);
  }, 900);
  window.setTimeout(() => {
    hallwaySet.classList.remove("is-opening");
    hallwaySet.classList.add("is-open");
  }, 1900);
});

speakButton.addEventListener("click", () => {
  if (state.voice.active) {
    stopVoiceArgument(true);
    return;
  }
  void startVoiceArgument();
});

async function advanceBattle(transcript = "") {
  if (state.sessionId) {
    try {
      speakButton.disabled = true;
      const next = await postJson("/api/argue", { sessionId: state.sessionId, transcript });
      state.round = next.round;
      state.player = next.player;
      state.boss = next.boss;
      attackName.textContent = next.attack.name;
      attackCaption.textContent = next.attack.line;
      roundBadge.textContent = next.complete ? "Victory: Accountability Located" : `Round ${state.round}`;
      subtitleLine.textContent = next.complete
        ? next.roommateLine
        : `Roommate: "${next.roommateLine}"`;
      void speakRoommateLine(next.roommateLine);
      setHealth();
      bossHealth.parentElement.classList.add("damage-pop");
      window.setTimeout(() => bossHealth.parentElement.classList.remove("damage-pop"), 450);
      speakButton.disabled = next.complete;
      if (next.complete) {
        speakButton.textContent = "Grievance filed";
        setVoiceUi("Case closed. The mic has nothing left to prove.", next.heard || transcript);
      }
      return;
    } catch {
      speakButton.disabled = false;
      state.sessionId = "";
    }
  }

  const counter = counters[state.exchange % counters.length];
  const excuse = excuses[(state.exchange + state.aggro) % excuses.length];
  const damage = 10 + state.evidence * 3;
  const recoil = Math.max(3, state.aggro * 2 - state.evidence);
  state.round += 1;
  state.exchange += 1;
  state.boss = Math.max(0, state.boss - damage);
  state.player = Math.max(0, state.player - recoil);
  attackName.textContent = counter.name;
  attackCaption.textContent = counter.line;
  roundBadge.textContent = state.boss === 0 ? "Victory: Accountability Located" : `Round ${state.round}`;
  subtitleLine.textContent =
    state.boss === 0
      ? "Roommate has been stunned by a complete sentence. They agree to clean it today, allegedly."
      : `Roommate: "${excuse}"`;
  void speakRoommateLine(
    state.boss === 0
      ? "Roommate has been stunned by a complete sentence. They agree to clean it today, allegedly."
      : excuse,
  );
  setHealth();
  bossHealth.parentElement.classList.add("damage-pop");
  window.setTimeout(() => bossHealth.parentElement.classList.remove("damage-pop"), 450);
  if (state.boss === 0) {
    speakButton.disabled = true;
    speakButton.textContent = "Grievance filed";
  }
}

resetButton.addEventListener("click", () => {
  stopVoiceArgument(false);
  speakButton.textContent = "Argue live";
  state.sessionId = "";
  state.roommateLine = "";
  setVoiceUi("Mic is holstered until the door opens.", "New grievance, new hallway.");
  showScreen("prep");
  window.scrollTo({ top: 0, behavior: "smooth" });
});

setHealth();
