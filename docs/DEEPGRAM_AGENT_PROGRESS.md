# Deepgram Voice Agent Mode Progress

## Goal

Add a selectable conversation mode to FizzBuzz:

- `Turn-style`: the current app-owned flow using Deepgram Listen/Flux or Nova for STT, `/api/argue` for game logic, and Deepgram Aura TTS for the roommate.
- `Easy`: Deepgram Voice Agent mode with a more cooperative roommate.
- `Medium`: Deepgram Voice Agent mode with normal evasive roommate behavior.
- `Hard`: Deepgram Voice Agent mode with stronger deflection and higher pressure.

## Current Status

- [x] Confirmed the existing turn-style flow is already implemented and should remain the default.
- [x] Identified the main integration boundary: Agent mode should be a parallel voice runtime, not a rewrite of the current Flux/Aura path.
- [x] Verify the exact current Deepgram Voice Agent websocket settings and event schema before coding the live Agent path.
- [x] Add the setup UI for choosing `Turn-style`, `Easy`, `Medium`, or `Hard`.
- [x] Add server-side Agent profile configuration for easy/medium/hard.
- [x] Add an Agent-mode token/config endpoint or websocket proxy.
- [x] Add client-side Agent websocket handling.
- [x] Split battle scoring from roommate generation so Agent mode can update health/fight-card state while Deepgram owns the spoken roommate response.
- [x] Wire Agent-mode transcripts/audio into the existing Deepgram Referee panel.
- [ ] Verify turn-style still works after the new mode is added.
- [ ] Verify Agent mode with real credentials and mic input.

## Implementation Notes

The current turn-style flow is:

```text
browser mic
  -> Deepgram Listen/Flux or Nova websocket
  -> final transcript / end-of-turn event
  -> /api/argue
  -> game state, boundary score, analysis, fight card
  -> /api/voice/speak
  -> Deepgram Aura audio playback
```

The intended Agent-mode flow is:

```text
browser mic
  -> Deepgram Voice Agent websocket
  -> user transcript events
  -> local/server scoring update
  -> agent-generated roommate transcript/audio
  -> battle UI + referee panel update
```

## Design Decisions

- Keep `Turn-style` as the default and safest demo path.
- Treat Agent modes as a separate runtime path with shared UI/state helpers where possible.
- Store difficulty prompts server-side so the client only chooses a mode id.
- Prefer graceful fallback to turn-style/browser speech if Agent mode cannot start.
- Agent mode uses `linear16` PCM at 24 kHz for both browser mic input and Deepgram audio output.
- Agent settings are generated server-side; the browser receives a temporary Deepgram grant, Agent websocket URL, and sanitized settings object.
- The first client implementation uses direct browser WebSocket + Web Audio PCM rather than adding the Deepgram Browser Agent SDK dependency.

## Open Questions

- Does the Deepgram Agent websocket accept the same bearer subprotocol auth path in-browser that Listen uses with temporary grants?
- Can Agent mode emit enough transcript metadata for the current fight card confidence metric, or should confidence be shown as unavailable for Agent turns? Current implementation assumes unavailable.
- Does the direct PCM browser pipeline feel good enough, or should we switch to Deepgram's Browser Agent SDK later?

## Verification Log

- Verified docs on 2026-06-21:
  - Voice Agent uses a single websocket and starts with a `Settings` message.
  - Server events include `ConversationText`, `UserStartedSpeaking`, `AgentStartedSpeaking`, and `AgentAudioDone`.
  - Browser playback must handle raw/containerless audio carefully.
- `npm run check` passed.
- `npm run build` passed.
- UI smoke test passed on `http://127.0.0.1:5175`: the setup screen renders `Battle style` with `Turn-style`, `Easy Agent`, `Medium Agent`, and `Hard Agent`.
- Live microphone/Agent websocket verification is still pending real credentials and a spoken test.
