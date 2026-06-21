# Deepgram Sponsor Track Plan

## Goal

Make FizzBuzz feel like a voice-native confrontation trainer, not a typed game with a microphone bolted on.

The sponsor story should be:

> Deepgram powers the live confrontation: it detects when the user is done speaking, transcribes the argument, helps score delivery, lets the user interrupt the roommate, and gives the AI roommate a voice.

## Current Baseline

- `/api/voice/token` can mint a Deepgram token or return mock mode.
- The frontend can request microphone access and stream user audio.
- The current Deepgram STT path uses the general Listen WebSocket style with `nova-3`.
- `/api/voice/speak` can call Deepgram Aura TTS and falls back to browser speech synthesis.
- The battle screen already has live transcript, voice status, subtitles, and roommate audio playback.

## Tier 1: Make Voice Essential

These are the highest-value Deepgram improvements for the hackathon demo.

### 1. Move Live STT To Flux

Goal: use Deepgram's conversational STT model so the game reacts to natural spoken turns.

Steps:

- [ ] Add environment variables:
  - `DEEPGRAM_STT_MODE=flux`
  - `DEEPGRAM_STT_MODEL=flux-general-en`
  - `DEEPGRAM_EOT_THRESHOLD=0.7`
  - `DEEPGRAM_EAGER_EOT_THRESHOLD=0.6`
  - `DEEPGRAM_EOT_TIMEOUT_MS=5000`
- [ ] Update `.env.example` with those values.
- [ ] Update `/api/voice/token` to return a Flux URL when `DEEPGRAM_STT_MODE=flux`.
- [ ] Use `/v2/listen`, not `/v1/listen`, for Flux.
- [ ] Keep the current `nova-3` path as fallback with `DEEPGRAM_STT_MODE=nova`.
- [ ] Log the chosen STT mode and model in `/api/health`.

Acceptance criteria:

- The app can connect to Flux with real credentials.
- The UI still works in mock mode and `nova-3` fallback mode.
- The demo can truthfully say it uses Deepgram's conversational STT.

### 2. Build A Deepgram Referee Panel

Goal: make Deepgram visibly central to the experience.

Steps:

- [ ] Rename the current transcript panel to something like `Deepgram Referee`.
- [ ] Show the active mode:
  - `Flux live`
  - `Nova fallback`
  - `Browser mock`
  - `Typed fallback`
- [ ] Show live turn state:
  - `Listening`
  - `User started speaking`
  - `Still talking`
  - `End of turn detected`
  - `Roommate preparing deflection`
- [ ] Show confidence when Deepgram provides it.
- [ ] Show the final user turn as a stamped transcript card.
- [ ] Add a tiny latency readout if easy:
  - mic start to first transcript
  - end-of-turn to roommate response

Acceptance criteria:

- A judge can see Deepgram working without opening DevTools.
- Transcript and turn state are understandable during a live demo.

### 3. Use End-Of-Turn As The Game Trigger

Goal: spoken turns should drive the fight rhythm.

Steps:

- [ ] In Flux mode, advance the battle on `EndOfTurn`.
- [ ] If using `EagerEndOfTurn`, start preparing the roommate response early.
- [ ] If a `TurnResumed` event arrives, cancel or ignore the speculative response.
- [ ] Keep the manual `Stop arguing` button as a fallback.
- [ ] Prevent duplicate battle advances when the same transcript arrives twice.

Acceptance criteria:

- The user speaks naturally, pauses, and the roommate responds without pressing another button.
- If the user continues speaking after a pause, the app does not cut them off in a confusing way.

### 4. Upgrade Aura TTS Into A Comedy Mechanic

Goal: roommate voice should feel designed, not default.

Steps:

- [ ] Add a `speed` option to `/api/voice/speak`.
- [ ] Map battle state to TTS speed:
  - normal deflection: `1.0`
  - high aggro: `1.18`
  - panic excuse: `1.3`
  - fake apology: `0.85`
  - defeated: `0.75`
- [ ] Return and log Deepgram TTS response headers:
  - `dg-request-id`
  - `dg-model-name`
  - `dg-char-count`
  - `dg-speed-used`
- [ ] Add a small UI label while the roommate speaks:
  - `Aura TTS: panic speed`
  - `Aura TTS: fake apology speed`
- [ ] Keep browser speech synthesis fallback.

Acceptance criteria:

- The roommate voice changes in a way the audience can hear.
- The UI explicitly attributes the roommate voice to Deepgram Aura.

## Tier 2: Make Deepgram The Coach

These features turn the transcript into gameplay and judging evidence.

### 5. Add A Calm Boundary Meter

Goal: score spoken delivery, not just button presses.

Steps:

- [ ] Create a server helper that evaluates each final transcript.
- [ ] Score:
  - specificity: did the user name the problem?
  - clear ask: did the user request a concrete action?
  - boundary: did the user state a limit or expectation?
  - escalation risk: insults, threats, or spiraling language.
- [ ] Use Deepgram transcript metadata where available:
  - confidence
  - final transcript
  - word timings
  - filler words if enabled
- [ ] Feed the score into battle damage.
- [ ] Show labels like:
  - `Boundary clarity +18`
  - `Specific ask bonus`
  - `Mumbled evidence penalty`
  - `Escalation warning`

Acceptance criteria:

- Speaking a clear, calm sentence does more damage than vague rambling.
- The scoring is visible and funny, but still useful.

### 6. Use Deepgram Intelligence For Round Analysis

Goal: make the post-round feedback feel powered by speech understanding.

Steps:

- [ ] Add an optional `/api/voice/analyze` endpoint.
- [ ] Send the user's transcript or recorded audio when credentials are available.
- [ ] Request any practical combination of:
  - sentiment
  - intents
  - topics
  - summary
- [ ] Map analysis into game copy:
  - intent: `setting_boundary`, `requesting_cleanup`, `seeking_apology`
  - sentiment: `calm`, `heated`, `defeated`, `petty but valid`
  - topic: `chores`, `money`, `noise`, `food crime`
- [ ] Cache analysis on the session so repeated UI renders do not re-call Deepgram.
- [ ] Fall back to a lightweight local heuristic if the request fails.

Acceptance criteria:

- The game can explain what the user did well after each round.
- The analysis degrades gracefully when Deepgram Intelligence is unavailable.

### 7. Add A Post-Fight Deepgram Fight Card

Goal: end the demo with a sponsor-visible summary.

Steps:

- [ ] Add a result screen after victory.
- [ ] Show:
  - best spoken line
  - number of turns
  - transcript confidence average
  - boundary clarity score
  - deflections resisted
  - final coaching note
- [ ] Include a visible badge: `Powered by Deepgram STT + Aura TTS`.
- [ ] Add a copyable/demo-friendly one-sentence summary.

Acceptance criteria:

- The final screen proves that voice mattered.
- The judge can understand the Deepgram contribution in five seconds.

## Tier 3: Big Swing Features

These are great if the core demo is stable.

### 8. Add Barge-In: Interrupt The Roommate

Goal: let the user cut off a yapping roommate with spoken interruption.

Steps:

- [ ] While Aura TTS is playing, continue listening for user speech if the browser allows it.
- [ ] On `UserStartedSpeaking` or equivalent speech-start signal, stop roommate audio playback.
- [ ] Show `Interruption Counter`.
- [ ] Reward the user only when the interruption contains a useful boundary, not just noise.
- [ ] Guard against speaker echo causing false interruptions.

Acceptance criteria:

- The user can interrupt a long roommate excuse.
- The feature feels like a deliberate mechanic, not an audio bug.

### 9. Try A Voice Agent Mode

Goal: explore Deepgram's full Voice Agent API as a special mode.

Steps:

- [ ] Create a branch or isolated endpoint for `Voice Agent Mode`.
- [ ] Use a single Deepgram Agent WebSocket for STT, LLM, and TTS.
- [ ] Configure the agent prompt as a deflective roommate.
- [ ] Compare quality and latency against the existing custom pipeline.
- [ ] Keep the custom pipeline as the primary demo unless Voice Agent mode is clearly better.

Acceptance criteria:

- The team can decide whether Voice Agent mode is demo-ready without risking the main flow.

## Voice Casting: Match The Roommate Voice To The Uploaded Image

The UX instinct is right: a mismatched voice can make the uploaded roommate image feel tacky or accidental. The implementation should be careful, though. Avoid automatically inferring gender or identity from a face. Instead, make voice casting a playful, user-controlled part of setup.

### Recommended Approach: User-Controlled Voice Casting

Steps:

- [ ] Add a `Roommate voice` selector near the photo upload.
- [ ] Use labels based on performance style, not identity:
  - `Deadpan`
  - `Frantic`
  - `Smug`
  - `Soft-spoken`
  - `Theater kid`
  - `Deeply inconvenienced`
- [ ] Map each style to a Deepgram Aura voice model and speed.
- [ ] Add a `Preview voice` button that speaks one short line:
  - `I was literally about to clean that.`
- [ ] Store the selected voice style in session state.
- [ ] Send `voiceStyle`, `ttsModel`, and `ttsSpeed` to `/api/voice/speak`.
- [ ] Keep a `Surprise me` option that randomly chooses from safe preset voices.

Acceptance criteria:

- The user can prevent obvious image/voice mismatch.
- The app does not guess demographic attributes from the uploaded image.
- The demo can show voice casting as another Deepgram-powered creative touch.

### Optional Enhancement: Persona-Based Voice Suggestion

If there is time, suggest a voice from the scenario/persona instead of the face.

Steps:

- [ ] Infer a suggested voice style from non-sensitive setup inputs:
  - aggro level
  - deflection style
  - scenario category
  - selected game mode
- [ ] Example mappings:
  - high aggro + dishes: `Frantic`
  - low aggro + apology: `Soft-spoken`
  - high evidence + fake apology: `Smug`
- [ ] Show the suggestion as editable:
  - `Suggested voice: Smug. Change`

Acceptance criteria:

- The app feels smart without making sensitive assumptions from the uploaded image.

### Risky Approach To Avoid

- Do not auto-classify the uploaded face as male, female, young, old, race, ethnicity, or any other sensitive identity trait.
- Do not claim the app can identify who is in the image.
- Do not use face matching or identity recognition.
- Do not make the voice choice irreversible or hidden.

## Suggested Coding Sessions

### Session 1: Flux Foundation

- [ ] Add Deepgram STT env vars.
- [ ] Update `/api/voice/token`.
- [ ] Add Flux/Nova mode handling in frontend.
- [ ] Verify mock mode still works.

### Session 2: Turn Detection Gameplay

- [ ] Handle Flux turn events.
- [ ] Advance battle on end-of-turn.
- [ ] Add duplicate-turn protection.
- [ ] Show turn state in the UI.

### Session 3: Aura Personality

- [ ] Add TTS speed support.
- [ ] Add voice style presets.
- [ ] Add preview voice button.
- [ ] Store selected roommate voice in session.

### Session 4: Deepgram Referee UI

- [ ] Build the referee panel.
- [ ] Show mode, model, confidence, turn state, and latency.
- [ ] Add sponsor-visible labels.
- [ ] Polish mobile layout.

### Session 5: Speech Scoring

- [ ] Add transcript scoring helper.
- [ ] Feed score into battle damage.
- [ ] Show coaching labels after each turn.
- [ ] Keep local fallback scoring.

### Session 6: Fight Card

- [ ] Add result screen.
- [ ] Show Deepgram-powered transcript stats.
- [ ] Add final coaching note.
- [ ] Add demo-ready sponsor badge.

### Session 7: Optional Big Swing

- [ ] Prototype barge-in.
- [ ] Prototype Voice Agent mode in isolation.
- [ ] Keep only what is stable enough for judging.

## Demo Script Beat

Use this phrase during judging:

> Deepgram is the game engine for the conversation. Flux decides when I am done speaking, the transcript becomes the combat move, Aura gives the roommate a voice, and the final fight card scores how clearly I set the boundary.

