import "./styles.css";
import { playAgentPcmChunk, resampleToLinear16, stopAgentAudio as stopAgentAudioOutput } from "./agentAudio.js";
import { postJson } from "./api.js";
import { dom } from "./dom.js";
import { counters, excuses, makeAttackName, roommateTitles, shortTopic } from "./gameCopy.js";
import { createInitialState } from "./state.js";
import { getVoiceModel, resolveVoiceStyleId, voiceStyleBank } from "./voiceStyles.js";

const {
  prepScreen,
  battleScreen,
  prepForm,
  argumentInput,
  evidenceInput,
  aggroInput,
  roommatePhoto,
  photoPreview,
  photoEvidence,
  bossPhoto,
  bossPhotoWrap,
  foreheadButton,
  foreheadStatus,
  hallwaySet,
  doorButton,
  knockText,
  speakButton,
  resetButton,
  subtitleLine,
  ttsStyleLabel,
  voiceTranscript,
  voiceStatus,
  voiceMeter,
  refereeModeBadge,
  refereeTurnState,
  refereeConfidence,
  refereeLatency,
  attackName,
  attackCaption,
  roundBadge,
  bossTitle,
  floorNote,
  playerHealth,
  bossHealth,
  conversationModeSelect,
  voiceStyleSelect,
  previewVoiceButton,
  playerSentimentLabel,
  playerSentimentBar,
  bossSentimentLabel,
  bossSentimentBar,
  boundaryLabels,
  analysisNote,
  fightCardScreen,
  fightCardBestLine,
  fightCardTurns,
  fightCardConfidence,
  fightCardBoundary,
  fightCardDeflections,
  fightCardCoaching,
  copySummaryButton,
  fightCardResetButton,
} = dom;

function getSelectedVoiceModel() {
  return getVoiceModel(state.voiceStyleId);
}

const state = createInitialState();

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

function setRefereeMode(label) {
  refereeModeBadge.textContent = label;
}

function setRefereeTurnState(label) {
  refereeTurnState.textContent = label;
}

// Only Deepgram (Flux/Nova) results carry a real confidence score -- pass
// null/undefined to clear the readout for browser-fallback turns instead of
// showing a number that has nothing to do with Deepgram.
function setRefereeConfidence(confidence) {
  if (typeof confidence !== "number" || Number.isNaN(confidence)) {
    refereeConfidence.textContent = "";
    state.voice.lastConfidence = null;
    return;
  }
  refereeConfidence.textContent = `Confidence: ${Math.round(confidence * 100)}%`;
  state.voice.lastConfidence = confidence;
}

function resetRefereePanel() {
  setRefereeMode("Idle");
  setRefereeTurnState("Awaiting mic");
  setRefereeConfidence(null);
  refereeLatency.textContent = "";
  state.voice.timing.micStartAt = 0;
  state.voice.timing.firstTranscriptAt = 0;
  state.voice.timing.endOfTurnAt = 0;
  state.voice.timing.endOfTurnPending = false;
}

function markMicLatencyStart() {
  state.voice.timing.micStartAt = performance.now();
  state.voice.timing.firstTranscriptAt = 0;
}

function markFirstTranscript() {
  const timing = state.voice.timing;
  if (timing.firstTranscriptAt || !timing.micStartAt) return;
  timing.firstTranscriptAt = performance.now();
  const ms = Math.round(timing.firstTranscriptAt - timing.micStartAt);
  refereeLatency.textContent = `Mic to first transcript: ${ms}ms`;
}

function markEndOfTurn() {
  state.voice.timing.endOfTurnAt = performance.now();
  state.voice.timing.endOfTurnPending = true;
}

// Called right as roommate audio actually starts playing (not when the
// network request resolves), so the latency reflects what the audience
// hears, not request overhead.
function markRoommateResponseStart() {
  const timing = state.voice.timing;
  if (!timing.endOfTurnPending) return;
  timing.endOfTurnPending = false;
  const ms = Math.round(performance.now() - timing.endOfTurnAt);
  refereeLatency.textContent = `End of turn to roommate response: ${ms}ms`;
}

function getSpeechRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function getRecorderMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function stopAgentAudio() {
  stopAgentAudioOutput(state.agent);
  stopTalkingAnimation();
}

function cleanupAgentVoice(socket = state.voice.socket, stream = state.voice.stream) {
  if (state.agent.keepAliveTimer) {
    window.clearInterval(state.agent.keepAliveTimer);
    state.agent.keepAliveTimer = 0;
  }
  stopAgentAudio();
  if (state.agent.processor) {
    state.agent.processor.disconnect();
    state.agent.processor.onaudioprocess = null;
  }
  if (state.agent.source) {
    state.agent.source.disconnect();
  }
  state.agent.processor = null;
  state.agent.source = null;
  state.agent.lastUserText = "";
  state.agent.lastAssistantText = "";
  state.agent.scoring = false;
  if (socket?.readyState === WebSocket.OPEN) {
    socket.close();
  }
  stream?.getTracks().forEach((track) => track.stop());
  if (state.voice.socket === socket) state.voice.socket = null;
  if (state.voice.stream === stream) state.voice.stream = null;
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

// Maps current battle state to an Aura TTS speed + label. Cornered (low
// boss health) takes priority over aggro, since "panicking while losing"
// reads better than "still aggressive while losing." Verified live against
// /v1/speak (2026-06-21): the accepted speed range is roughly 0.7-1.5, not
// the wider range the plan assumed -- all five values below are inside
// that verified window. Defaults to "normal" when boss/aggro aren't known
// (e.g. the door-opening line, before any round has happened).
function resolveTtsStyle(bossHealth = 100, aggro = 3) {
  const model = getSelectedVoiceModel();
  if (bossHealth <= 0) return { speed: 0.75, label: "Aura TTS: defeated speed", model };
  if (bossHealth <= 30) return { speed: 1.3, label: "Aura TTS: panic speed", model };
  if (aggro >= 4) return { speed: 1.18, label: "Aura TTS: high aggro speed", model };
  if (aggro <= 2) return { speed: 0.85, label: "Aura TTS: fake apology speed", model };
  return { speed: 1.0, label: "Aura TTS: normal speed", model };
}

// Stops the roommate mid-sentence if they're talking. Used both for the
// normal "about to play a new line" case and for a deliberate barge-in
// interruption -- in the interrupt case, nothing else will fire an
// "ended"/"error" event on the cut-off audio, so resolveSpeaking is called
// here to release whoever is awaiting "the roommate finished talking"
// instead of leaving that promise hanging forever.
function stopRoommateSpeech() {
  stopTalkingAnimation();
  stopAgentAudio();
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
  ttsStyleLabel.textContent = "";
  if (state.tts.resolveSpeaking) {
    const resolveSpeaking = state.tts.resolveSpeaking;
    state.tts.resolveSpeaking = null;
    resolveSpeaking();
  }
}

async function generateFrames(imageDataUrl) {
  if (!imageDataUrl) return;
  console.info("[frames] Requesting mouth-closed and mouth-open frames from Gemini.");
  try {
    const result = await postJson("/api/media/frames", { imageDataUrl });
    if (result.closedUrl) {
      state.frames.closed = result.closedUrl;
      bossPhoto.src = result.closedUrl;
    }
    if (result.openUrl) {
      state.frames.open = result.openUrl;
    }
    console.info("[frames] Frames ready.", { mode: result.mode, hasClose: Boolean(result.closedUrl), hasOpen: Boolean(result.openUrl) });
    if (state.tts.speaking) startTalkingAnimation();
  } catch (error) {
    console.warn("[frames] Frame generation failed; static photo will be used.", error.message);
  }
}

function startTalkingAnimation() {
  bossPhotoWrap.classList.add("is-speaking");
  if (!state.frames.closed || !state.frames.open) return;
  stopTalkingAnimation();
  bossPhotoWrap.classList.add("is-speaking");
  let showOpen = true;
  state.talkAnim = setInterval(() => {
    bossPhoto.src = showOpen ? state.frames.open : state.frames.closed;
    showOpen = !showOpen;
  }, 150);
}

function stopTalkingAnimation() {
  if (state.talkAnim) {
    clearInterval(state.talkAnim);
    state.talkAnim = null;
  }
  bossPhotoWrap.classList.remove("is-speaking");
  if (state.frames.closed) bossPhoto.src = state.frames.closed;
}

// Returns a promise that resolves once playback (or the unavailable/error
// no-op) is fully done, not just started -- callers that need to wait for
// the roommate to actually finish talking depend on this.
function speakWithBrowserVoice(text, speed = 1.0) {
  if (!("speechSynthesis" in window) || !window.SpeechSynthesisUtterance) {
    console.error("[voice] Browser speech synthesis unavailable.");
    stopTalkingAnimation();
    return Promise.resolve();
  }

  console.info("[voice] Speaking roommate line with browser speech synthesis.");
  window.speechSynthesis.cancel();
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.04 * speed;
    utterance.pitch = 0.78;
    utterance.volume = 1;
    const finish = () => {
      state.tts.speaking = false;
      state.tts.resolveSpeaking = null;
      stopTalkingAnimation();
      resolve();
    };
    utterance.addEventListener("start", () => startTalkingAnimation());
    utterance.addEventListener("end", () => {
      console.info("[voice] Browser speech synthesis ended.");
      finish();
    });
    utterance.addEventListener("error", (event) => {
      console.error("[voice] Browser speech synthesis error.", event);
      finish();
    });
    state.tts.speaking = true;
    state.tts.resolveSpeaking = finish;
    markRoommateResponseStart();
    window.speechSynthesis.speak(utterance);
    startTalkingAnimation();
  });
}

// Returns a promise that resolves once the roommate has actually finished
// speaking (audio "ended"/"error", or immediately if there's no line to
// speak). Callers that advance the battle must await this -- otherwise
// `state.voice.processing` clears as soon as the /api/argue fetch resolves,
// well before TTS playback even starts (it's a second, separate network
// call), leaving a window where a fast follow-up turn from the user can
// advance the battle again and cut the roommate off mid-sentence.
async function speakRoommateLine(line, style = resolveTtsStyle()) {
  const text = String(line || "").replace(/^Roommate:\s*/i, "").replace(/^"|"$/g, "").trim();
  if (!text) return;

  stopRoommateSpeech();
  ttsStyleLabel.textContent = style.label;
  startTalkingAnimation();
  console.info("[voice] Requesting roommate TTS.", { chars: text.length, speed: style.speed });

  try {
    const response = await fetch("/api/voice/speak", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ text, speed: style.speed, model: style.model }),
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
      await new Promise((resolve) => {
        state.tts.resolveSpeaking = resolve;
        audio.addEventListener("ended", () => {
          console.info("[voice] Deepgram TTS playback ended.");
          stopRoommateSpeech();
          resolve();
        });
        audio.addEventListener("error", (event) => {
          console.error("[voice] Deepgram TTS playback error; using browser speech.", event);
          resolve(speakWithBrowserVoice(text, style.speed));
        });
        audio
          .play()
          .then(() => {
            markRoommateResponseStart();
            startTalkingAnimation();
          })
          .catch((error) => {
            console.error("[voice] Deepgram TTS playback failed to start; using browser speech.", error);
            resolve(speakWithBrowserVoice(text, style.speed));
          });
      });
      return;
    }

    const details = await response.json().catch(() => ({}));
    console.warn("[voice] Deepgram TTS unavailable; using browser speech fallback.", {
      status: response.status,
      contentType,
      details,
    });
    await speakWithBrowserVoice(text, style.speed);
  } catch (error) {
    console.error("[voice] TTS request failed; using browser speech fallback.", error);
    await speakWithBrowserVoice(text, style.speed);
  }
}

async function startVoiceArgument() {
  if (state.voice.active || state.voice.processing) return;
  if (state.conversationMode !== "turn-style") {
    await startDeepgramAgentArgument();
    return;
  }
  await startTurnStyleVoiceArgument();
}

async function startTurnStyleVoiceArgument() {
  if (state.voice.active || state.voice.processing) return;

  console.info("[voice] Argue live clicked; requesting /api/voice/token.");
  setVoiceActive(true);
  state.voice.finalTranscript = "";
  state.voice.interimTranscript = "";
  state.voice.lastAdvancedTurnIndex = -1;
  markMicLatencyStart();
  setRefereeTurnState("Awaiting mic");
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
      setRefereeMode(token.sttMode === "flux" ? "Flux live" : "Nova fallback");
      await startDeepgramVoice(token);
      return;
    }
    startBrowserSpeechFallback(token.message);
  } catch (error) {
    console.error("[voice] /api/voice/token failed; using browser speech fallback.", error);
    startBrowserSpeechFallback(error.message);
  }
}

async function startDeepgramAgentArgument() {
  console.info("[agent] Argue live clicked; requesting /api/voice/agent.", { mode: state.conversationMode });
  setVoiceActive(true);
  state.voice.mode = "agent";
  state.voice.finalTranscript = "";
  state.voice.interimTranscript = "";
  state.agent.lastUserText = "";
  state.agent.lastAssistantText = "";
  markMicLatencyStart();
  setRefereeMode(`Agent: ${state.conversationMode}`);
  setRefereeTurnState("Awaiting agent");
  setRefereeConfidence(null);
  setVoiceUi("Requesting Deepgram Agent access. The roommate is loading a fresh excuse.");

  try {
    const agent = await postJson("/api/voice/agent", {
      mode: state.conversationMode,
      argument: state.argument,
      evidence: state.evidence,
      aggro: state.aggro,
      ttsModel: getSelectedVoiceModel(),
    });
    console.info("[agent] Agent endpoint response:", {
      mode: agent.mode,
      agentMode: agent.agentMode,
      hasToken: Boolean(agent.token),
      hasSettings: Boolean(agent.settings),
      message: agent.message,
    });

    if (agent.mode === "deepgram-agent" && agent.token && agent.agentUrl && agent.settings) {
      await startDeepgramAgentVoice(agent);
      return;
    }

    setVoiceUi(agent.message || "Agent mode is unavailable. Falling back to turn-style.");
    setRefereeMode("Turn-style fallback");
    setVoiceActive(false);
    await startTurnStyleVoiceArgument();
  } catch (error) {
    console.error("[agent] /api/voice/agent failed; falling back to turn-style.", error);
    setVoiceUi(error.message || "Agent mode failed. Falling back to turn-style.");
    setRefereeMode("Turn-style fallback");
    setVoiceActive(false);
    await startTurnStyleVoiceArgument();
  }
}

async function startDeepgramAgentVoice(agent) {
  state.voice.mode = "agent";
  state.voice.sttMode = "agent";
  state.voice.sttModel = agent.settings?.agent?.listen?.provider?.model || "";
  console.info("[agent] Starting Deepgram Agent voice mode.", {
    agentMode: agent.agentMode,
    sttModel: state.voice.sttModel,
  });

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    throw new Error("This browser does not expose Web Audio for Agent mode.");
  }
  const audioContext = state.agent.audioContext || new AudioContext();
  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }
  state.agent.audioContext = audioContext;
  state.agent.outputCursor = audioContext.currentTime;

  const authProtocol = agent.authProtocol || "bearer";
  const socket = new WebSocket(agent.agentUrl, [authProtocol, agent.token]);
  socket.binaryType = "arraybuffer";

  state.voice.stream = stream;
  state.voice.socket = socket;
  state.voice.recorder = null;

  socket.addEventListener("open", () => {
    if (state.voice.socket !== socket) return;
    console.info("[agent] Deepgram Agent websocket open.");
    setRefereeTurnState("Configuring agent");
    setVoiceUi("Deepgram Agent is connected. Waiting for settings to apply.");
  });

  socket.addEventListener("message", async (event) => {
    if (state.voice.socket !== socket) return;

    if (event.data instanceof ArrayBuffer) {
      markRoommateResponseStart();
      startTalkingAnimation();
      playAgentPcmChunk(state.agent, event.data, agent.settings?.audio?.output?.sample_rate || 24000);
      return;
    }
    if (event.data instanceof Blob) {
      markRoommateResponseStart();
      startTalkingAnimation();
      playAgentPcmChunk(state.agent, await event.data.arrayBuffer(), agent.settings?.audio?.output?.sample_rate || 24000);
      return;
    }

    let data;
    try {
      data = JSON.parse(event.data);
    } catch (error) {
      console.error("[agent] Failed to parse Agent websocket message.", { raw: event.data, error });
      return;
    }
    handleAgentMessage(data, socket, stream, agent);
  });

  socket.addEventListener("close", (event) => {
    console.warn("[agent] Deepgram Agent websocket closed.", {
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean,
    });
    if (state.voice.socket !== socket) return;
    cleanupAgentVoice(socket, stream);
    setVoiceActive(false);
    if (state.boss > 0) {
      setVoiceUi("Deepgram Agent left the hallway. Turn-style is still available.");
      setRefereeTurnState("Awaiting mic");
    }
  });

  socket.addEventListener("error", (event) => {
    console.error("[agent] Deepgram Agent websocket error.", event);
    if (state.voice.socket !== socket) return;
    cleanupAgentVoice(socket, stream);
    setVoiceActive(false);
    setVoiceUi("Deepgram Agent tripped over the doormat. Try turn-style if this keeps happening.");
  });
}

function startAgentPcmCapture(socket, stream, sampleRate = 24000) {
  const context = state.agent.audioContext;
  if (!context) return;
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  processor.onaudioprocess = (event) => {
    if (state.voice.socket !== socket || socket.readyState !== WebSocket.OPEN) return;
    if (state.agent.playing) return;
    const input = event.inputBuffer.getChannelData(0);
    socket.send(resampleToLinear16(input, context.sampleRate, sampleRate));
  };
  source.connect(processor);
  processor.connect(context.destination);
  state.agent.source = source;
  state.agent.processor = processor;
}

function handleAgentMessage(data, socket, stream, agent) {
  console.debug("[agent] Agent event:", data);

  if (data.type === "Welcome") {
    socket.send(JSON.stringify(agent.settings));
    return;
  }

  if (data.type === "SettingsApplied") {
    setRefereeMode(agent.label || `Agent: ${agent.agentMode}`);
    setRefereeTurnState("Listening");
    setVoiceUi("Deepgram Agent is live. Start arguing before the roommate finds a loophole.");
    startAgentPcmCapture(socket, stream, agent.settings?.audio?.input?.sample_rate || 24000);
    state.agent.keepAliveTimer = window.setInterval(() => {
      if (state.voice.socket === socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "KeepAlive" }));
      }
    }, 5000);
    return;
  }

  if (data.type === "UserStartedSpeaking") {
    stopAgentAudio();
    markFirstTranscript();
    setRefereeTurnState("User started speaking");
    setVoiceUi("Hearing you in Agent mode...", state.voice.finalTranscript);
    return;
  }

  if (data.type === "AgentThinking") {
    markEndOfTurn();
    setRefereeTurnState("Agent preparing deflection");
    if (data.content) {
      console.debug("[agent] Agent thinking:", data.content);
    }
    return;
  }

  if (data.type === "AgentStartedSpeaking") {
    setRefereeTurnState("Roommate responding");
    if (typeof data.total_latency === "number") {
      refereeLatency.textContent = `Agent response latency: ${Math.round(data.total_latency * 1000)}ms`;
    }
    markRoommateResponseStart();
    startTalkingAnimation();
    return;
  }

  if (data.type === "ConversationText") {
    const content = String(data.content || "").trim();
    if (!content) return;
    if (data.role === "user") {
      state.voice.finalTranscript = content;
      state.voice.interimTranscript = "";
      markFirstTranscript();
      setRefereeConfidence(null);
      setRefereeTurnState("Agent heard turn");
      setVoiceUi("Deepgram Agent stamped your transcript.", content);
      void scoreAgentBattle(content);
      return;
    }
    if (data.role === "assistant") {
      state.agent.lastAssistantText = content;
      subtitleLine.textContent = `Roommate: "${content}"`;
      setVoiceUi("Roommate is responding through Deepgram Agent.", state.voice.finalTranscript || content);
      return;
    }
  }

  if (data.type === "AgentAudioDone") {
    console.info("[agent] Agent audio stream finished sending.");
    return;
  }

  if (data.type === "Error") {
    const message = data.description || data.message || data.reason || data.error || "Deepgram Agent reported an error.";
    console.error("[agent] Agent error.", JSON.stringify(data, null, 2));
    setVoiceUi(message);
    return;
  }

  if (data.type === "Warning") {
    console.warn("[agent] Agent warning.", data);
  }
}

async function scoreAgentBattle(transcript) {
  const heard = String(transcript || "").trim();
  if (!heard || state.agent.scoring || heard === state.agent.lastUserText) return;
  state.agent.scoring = true;
  state.agent.lastUserText = heard;

  try {
    const next = await postJson("/api/argue/score", {
      sessionId: state.sessionId,
      transcript: heard,
      confidence: null,
    });
    state.round = next.round;
    state.player = next.player;
    state.boss = next.boss;
    attackName.textContent = next.attack.name;
    attackCaption.textContent = next.attack.line;
    roundBadge.textContent = next.complete ? "Victory: Accountability Located" : `Round ${state.round}`;
    renderBoundaryLabels(next.boundary);
    renderSentimentDuel(next.sentimentDuel);
    renderAnalysisNote(next.analysis);
    setHealth();
    bossHealth.parentElement.classList.add("damage-pop");
    window.setTimeout(() => bossHealth.parentElement.classList.remove("damage-pop"), 450);

    if (next.complete) {
      subtitleLine.textContent = next.roommateLine;
      speakButton.textContent = "Grievance filed";
      speakButton.disabled = true;
      setVoiceUi("Case closed. The mic has nothing left to prove.", next.heard || heard);
      cleanupAgentVoice();
      setVoiceActive(false);
      if (next.fightCard) {
        state.lastFightCard = next.fightCard;
        window.setTimeout(() => showFightCard(next.fightCard), 900);
      }
    }
  } catch (error) {
    console.error("[agent] Agent scoring failed.", error);
    setVoiceUi(error.message || "Agent mode heard you, but scoring failed.");
  } finally {
    state.agent.scoring = false;
  }
}

// Handles one Flux TurnInfo message. Verified live against /v2/listen
// (2026-06-21): `transcript` is cumulative for the whole turn so far (each
// message replaces, not appends), `turn_index` only increments after a
// genuine EndOfTurn (never after EagerEndOfTurn/TurnResumed on the same
// turn), and a turn can cycle through EagerEndOfTurn/TurnResumed more than
// once before it actually closes. Eager EOT and TurnResumed are
// deliberately not acted on here -- live testing showed EagerEndOfTurn
// fires too close to the real EndOfTurn (0-109ms apart) to be worth
// speculative handling this session.
//
// Tried true barge-in (mic live through TTS, interrupting the roommate on a
// new EndOfTurn) and reverted it: relying on echoCancellation to keep the
// roommate's own voice out of what Deepgram hears was too unreliable in a
// quiet room, and the demo venue will be noisy -- worse. Back to wait: the
// mic is gated off during TTS playback (see the dataavailable handler in
// startDeepgramVoice) and a duplicate/overlapping EndOfTurn while a turn is
// still resolving is dropped, not acted on.
function handleFluxTurnInfo(data) {
  const transcript = String(data.transcript || "").trim();
  // Not confirmed present on every TurnInfo message live -- show it when
  // Deepgram includes it, clear it otherwise rather than guessing.
  setRefereeConfidence(typeof data.confidence === "number" ? data.confidence : null);

  if (data.event === "StartOfTurn") {
    setRefereeTurnState("User started speaking");
    markFirstTranscript();
    setVoiceUi("Hearing you in real time...", transcript);
    return;
  }

  if (transcript) {
    state.voice.finalTranscript = transcript;
    markFirstTranscript();
    setRefereeTurnState(data.event === "EndOfTurn" ? "End of turn detected" : "Still talking");
    setVoiceUi(
      data.event === "EndOfTurn" ? "Heard that. The roommate is preparing an objection." : "Hearing you in real time...",
      transcript,
    );
  }

  if (data.event !== "EndOfTurn") return;
  markEndOfTurn();
  setRefereeTurnState("End of turn detected");

  if (data.turn_index === state.voice.lastAdvancedTurnIndex) {
    console.warn("[voice] Duplicate EndOfTurn for turn_index", data.turn_index, "; ignoring.");
    return;
  }
  state.voice.lastAdvancedTurnIndex = data.turn_index;

  if (state.voice.processing) {
    console.warn(
      "[voice] EndOfTurn arrived while a previous turn was still resolving; dropping turn_index",
      data.turn_index,
    );
    return;
  }

  setRefereeTurnState("Roommate preparing deflection");
  void resolveLiveArgument(transcript || state.voice.finalTranscript, { teardownVoice: false });
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
    setRefereeTurnState("Listening");
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
      if (state.voice.sttMode === "flux" && data.type === "TurnInfo") {
        handleFluxTurnInfo(data);
      } else if (state.voice.sttMode === "flux") {
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

    markFirstTranscript();
    setRefereeConfidence(data.channel?.alternatives?.[0]?.confidence);

    if (data.is_final) {
      state.voice.finalTranscript = `${state.voice.finalTranscript} ${transcript}`.trim();
    } else {
      state.voice.interimTranscript = transcript;
    }

    const visibleTranscript = [state.voice.finalTranscript, state.voice.interimTranscript]
      .filter(Boolean)
      .join(" ");
    setRefereeTurnState(data.speech_final ? "End of turn detected" : "Still talking");
    setVoiceUi(
      data.is_final ? "Heard that. The roommate is preparing an objection." : "Hearing you in real time...",
      visibleTranscript,
    );

    if (data.speech_final) {
      markEndOfTurn();
      setRefereeTurnState("Roommate preparing deflection");
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
    // Flux keeps the mic hot across turns, so without this the roommate's
    // own Aura TTS playback can get transcribed as a new user turn and fire
    // a spurious EndOfTurn. Gate transmission, don't close the socket.
    // (Tried leaving this open for barge-in and relying on
    // echoCancellation alone -- too unreliable even in a quiet room, and
    // the real demo venue will be noisier, so reverted to gating.)
    if (state.voice.sttMode === "flux" && state.tts.speaking) return;
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
    setRefereeMode("Typed fallback");
    stopVoiceArgument(false);
    setVoiceUi(reason || "No Deepgram key and this browser does not expose speech captions.");
    return;
  }

  setRefereeMode("Browser mock");
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
    markFirstTranscript();
    // Browser SpeechRecognition isn't Deepgram, so the referee panel
    // doesn't show a confidence number for it -- showing one here would
    // misattribute it.
    setRefereeConfidence(null);
    setRefereeTurnState(state.voice.finalTranscript ? "End of turn detected" : "Still talking");
    setVoiceUi(
      reason
        ? "Mock voice mode: browser captions are listening while Deepgram waits for keys."
        : "Browser captions are listening.",
      [state.voice.finalTranscript, state.voice.interimTranscript].filter(Boolean).join(" "),
    );

    if (state.voice.finalTranscript) {
      markEndOfTurn();
      setRefereeTurnState("Roommate preparing deflection");
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

  if (state.voice.mode === "agent") {
    cleanupAgentVoice(state.voice.socket, state.voice.stream);
    if (shouldResolve) {
      void scoreAgentBattle(transcript);
    }
    return;
  }

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

async function resolveLiveArgument(transcript, { teardownVoice = true } = {}) {
  const heard = String(transcript || "").trim();
  if (!heard || state.voice.processing) return;

  console.info("[voice] Resolving live argument with transcript:", heard);
  state.voice.processing = true;
  // Flux's persistent-connection mode resolves a turn without tearing down
  // the socket/mic -- the conversation keeps going. Nova (and manual Stop
  // arguing, in either mode) always tears down here, same as before.
  if (teardownVoice) {
    stopVoiceArgument(false);
  }
  setVoiceUi("Roommate heard you. Unfortunately, that made them more defensive.", heard);

  try {
    await advanceBattle(heard);
  } finally {
    state.voice.finalTranscript = "";
    state.voice.interimTranscript = "";
    state.voice.processing = false;
    if (state.boss > 0) {
      speakButton.disabled = false;
      // state.voice.active is already false here if voice was torn down
      // (above, or by a manual Stop click that raced this resolution) --
      // checking it (not the teardownVoice param) keeps the message
      // correct in both cases.
      setRefereeTurnState(state.voice.active ? "Listening" : "Awaiting mic");
      setVoiceUi(
        state.voice.active ? "Still listening. Keep arguing whenever you're ready." : "Mic ready for the next accusation.",
        "Say the next part out loud.",
      );
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
  fightCardScreen.classList.toggle("is-active", screen === "fightcard");
  window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0 }));
}

function renderBoundaryLabels(boundary) {
  boundaryLabels.innerHTML = "";
  if (!boundary?.labels?.length) return;
  for (const label of boundary.labels) {
    const span = document.createElement("span");
    span.className = label.penalty ? "boundary-label penalty" : "boundary-label";
    span.textContent = label.text;
    boundaryLabels.appendChild(span);
  }
}

function renderSentimentDuel(duel) {
  state.sentimentDuel = duel || null;
  const player = duel?.user;
  const boss = duel?.boss;
  playerSentimentLabel.textContent = player?.label || "Awaiting grievance";
  bossSentimentLabel.textContent = boss?.label || "Deflection charging";
  playerSentimentBar.style.width = `${Math.max(0, Math.min(100, player?.value ?? 10))}%`;
  bossSentimentBar.style.width = `${Math.max(0, Math.min(100, boss?.value ?? 18))}%`;
  playerSentimentBar.parentElement.classList.toggle("is-hot", player?.label === "heated");
  playerSentimentBar.parentElement.classList.toggle("is-petty", player?.label === "petty but valid");
  bossSentimentBar.parentElement.classList.toggle("is-cornered", boss?.label === "cornered");
}

const analysisCopy = {
  setting_boundary: "setting a boundary",
  requesting_cleanup: "requesting cleanup",
  seeking_apology: "seeking an apology",
};
const topicCopy = {
  chores: "chores",
  money: "money",
  noise: "noise",
  "food crime": "a food crime",
};

function renderAnalysisNote(analysis) {
  if (!analysis) {
    analysisNote.textContent = "";
    return;
  }
  const intent = analysisCopy[analysis.intentLabel] || analysis.intentLabel || "making a point";
  const topic = topicCopy[analysis.topicLabel] || analysis.topicLabel || "the situation";
  const sourceTag = analysis.source === "deepgram" ? "Deepgram Intelligence" : "Local read";
  const score =
    typeof analysis.sentimentScore === "number"
      ? ` (${analysis.sentimentScore > 0 ? "+" : ""}${analysis.sentimentScore.toFixed(2)})`
      : "";
  analysisNote.textContent = `${sourceTag}: ${analysis.sentimentLabel}${score}, ${intent}, about ${topic}.`;
}

function formatPercent(value) {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "--";
}

function showFightCard(fightCard) {
  fightCardBestLine.textContent = fightCard.bestLine ? `"${fightCard.bestLine}"` : "--";
  fightCardTurns.textContent = String(fightCard.turns);
  fightCardConfidence.textContent = formatPercent(fightCard.avgConfidence);
  fightCardBoundary.textContent = String(fightCard.avgBoundary);
  fightCardDeflections.textContent = String(fightCard.deflectionsResisted);
  fightCardCoaching.textContent = fightCard.coachingNote || "--";
  showScreen("fightcard");
}

function buildDemoSummary(fightCard) {
  return [
    "Deepgram powered this confrontation: Flux/Nova decided when I was done speaking,",
    `Aura voiced the roommate, and the boundary meter scored my delivery over ${fightCard.turns} turns`,
    `(avg boundary clarity ${fightCard.avgBoundary}, avg transcript confidence ${formatPercent(fightCard.avgConfidence)}).`,
    `Best line: "${fightCard.bestLine}"`,
  ].join(" ");
}

copySummaryButton.addEventListener("click", async () => {
  const summary = buildDemoSummary(state.lastFightCard || {});
  try {
    await navigator.clipboard.writeText(summary);
    copySummaryButton.textContent = "Copied!";
  } catch (error) {
    console.error("[fightcard] Clipboard write failed.", error);
    copySummaryButton.textContent = "Copy failed";
  } finally {
    window.setTimeout(() => {
      copySummaryButton.textContent = "Copy demo summary";
    }, 1600);
  }
});

fightCardResetButton.addEventListener("click", () => {
  resetButton.click();
});

roommatePhoto.addEventListener("change", async () => {
  const file = roommatePhoto.files?.[0];
  if (!file) return;
  if (state.photoUrl) URL.revokeObjectURL(state.photoUrl);
  state.photoUrl = URL.createObjectURL(file);
  state.photoDataUrl = "";
  state.frames = { closed: null, open: null };
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
    void generateFrames(state.photoDataUrl);
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
      state.frames = { closed: null, open: null };
      photoPreview.src = generated.imageUrl;
      bossPhoto.src = generated.imageUrl;
      foreheadStatus.textContent = "Forehead mode applied. Accountability now has forced perspective.";
      void generateFrames(generated.imageUrl);
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

conversationModeSelect.addEventListener("change", () => {
  state.conversationMode = conversationModeSelect.value || "turn-style";
  console.info("[agent] Conversation mode selected.", { mode: state.conversationMode });
});

voiceStyleSelect.addEventListener("change", () => {
  state.voiceStyleId = resolveVoiceStyleId(voiceStyleSelect.value);
  console.info("[voice] Voice style selected.", { selected: voiceStyleSelect.value, resolved: state.voiceStyleId });
});

previewVoiceButton.addEventListener("click", async () => {
  state.voiceStyleId = resolveVoiceStyleId(voiceStyleSelect.value);
  const style = { speed: 1.0, label: `Aura TTS: previewing ${voiceStyleBank[state.voiceStyleId].label}`, model: getSelectedVoiceModel() };
  previewVoiceButton.disabled = true;
  previewVoiceButton.textContent = "Previewing...";
  try {
    await speakRoommateLine("I was literally about to clean that.", style);
  } finally {
    previewVoiceButton.disabled = false;
    previewVoiceButton.textContent = "Preview voice";
  }
});

prepForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  state.argument = argumentInput.value;
  state.evidence = Number(evidenceInput.value);
  state.aggro = Number(aggroInput.value);
  state.conversationMode = conversationModeSelect.value || "turn-style";
  state.sessionId = "";
  state.roommateLine = "";
  state.round = 1;
  state.player = 100;
  state.boss = 100;
  state.exchange = 0;
  state.knocked = false;
  stopVoiceArgument(false);
  stopRoommateSpeech();
  resetRefereePanel();
  renderBoundaryLabels(null);
  renderSentimentDuel(null);
  renderAnalysisNote(null);
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

  if (state.photoDataUrl && !state.frames.closed) {
    void generateFrames(state.photoDataUrl);
  }
});

function playKnockSound() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  const ctx = new AudioCtx();

  function knock(time) {
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(220, time);
    osc.frequency.exponentialRampToValueAtTime(55, time + 0.1);
    oscGain.gain.setValueAtTime(1.0, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.18);

    const noiseLen = Math.floor(ctx.sampleRate * 0.07);
    const noiseBuffer = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) {
      noiseData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / noiseLen, 3);
    }
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 700;
    noiseFilter.Q.value = 0.7;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.55, time);
    noiseSrc.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noiseSrc.start(time);
    noiseSrc.stop(time + 0.07);
  }

  const now = ctx.currentTime + 0.01;
  knock(now);
  knock(now + 0.28);
  knock(now + 0.56);
  window.setTimeout(() => ctx.close(), 1500);
}

doorButton.addEventListener("click", () => {
  if (state.knocked) return;
  state.knocked = true;
  doorButton.disabled = true;
  playKnockSound();
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
      const next = await postJson("/api/argue", {
        sessionId: state.sessionId,
        transcript,
        confidence: state.voice.lastConfidence,
      });
      state.round = next.round;
      state.player = next.player;
      state.boss = next.boss;
      attackName.textContent = next.attack.name;
      attackCaption.textContent = next.attack.line;
      roundBadge.textContent = next.complete ? "Victory: Accountability Located" : `Round ${state.round}`;
      subtitleLine.textContent = next.complete
        ? next.roommateLine
        : `Roommate: "${next.roommateLine}"`;
      renderBoundaryLabels(next.boundary);
      renderSentimentDuel(next.sentimentDuel);
      renderAnalysisNote(next.analysis);
      // Fire the TTS request now (so playback starts as soon as it's ready)
      // but keep the rest of this turn's UI updates synchronous/instant --
      // only the function's return (and therefore resolveLiveArgument's
      // "processing" flag) waits for the roommate to actually finish
      // speaking, so the battle can't advance again mid-sentence.
      const speaking = speakRoommateLine(next.roommateLine, resolveTtsStyle(state.boss, state.aggro));
      setHealth();
      bossHealth.parentElement.classList.add("damage-pop");
      window.setTimeout(() => bossHealth.parentElement.classList.remove("damage-pop"), 450);
      if (next.complete) {
        speakButton.textContent = "Grievance filed";
        setVoiceUi("Case closed. The mic has nothing left to prove.", next.heard || transcript);
      }
      // speakButton stays disabled (set true above) through TTS playback too
      // -- re-enable only once the roommate has actually finished talking.
      await speaking;
      speakButton.disabled = next.complete;
      if (next.complete && next.fightCard) {
        state.lastFightCard = next.fightCard;
        window.setTimeout(() => showFightCard(next.fightCard), 900);
      }
      return;
    } catch {
      speakButton.disabled = false;
      state.sessionId = "";
    }
  }

  renderBoundaryLabels(null);
  renderSentimentDuel(null);
  renderAnalysisNote(null);
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
  const speaking = speakRoommateLine(
    state.boss === 0
      ? "Roommate has been stunned by a complete sentence. They agree to clean it today, allegedly."
      : excuse,
    resolveTtsStyle(state.boss, state.aggro),
  );
  setHealth();
  bossHealth.parentElement.classList.add("damage-pop");
  window.setTimeout(() => bossHealth.parentElement.classList.remove("damage-pop"), 450);
  if (state.boss === 0) {
    speakButton.textContent = "Grievance filed";
  }
  await speaking;
  speakButton.disabled = state.boss === 0;
}

resetButton.addEventListener("click", () => {
  stopVoiceArgument(false);
  stopRoommateSpeech();
  resetRefereePanel();
  renderBoundaryLabels(null);
  renderSentimentDuel(null);
  renderAnalysisNote(null);
  speakButton.textContent = "Argue live";
  state.sessionId = "";
  state.roommateLine = "";
  setVoiceUi("Mic is holstered until the door opens.", "New grievance, new hallway.");
  showScreen("prep");
  window.scrollTo({ top: 0, behavior: "smooth" });
});

setHealth();
