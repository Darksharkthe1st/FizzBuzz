# Fizz Buzz Hackathon Roadmap

## Project Goal

Fizz Buzz is a roommate confrontation simulator for practicing awkward shared-space conversations before having them for real. The hackathon demo should let a user describe a roommate conflict, upload a roommate photo, knock on an animated door, and practice against an AI-powered roommate that dodges responsibility with excuses, justifications, and diversions.

The intended tone is a comedy game: "Roommate Boss Battle", "Gaslight Speedrun", "The Deflection Engine", and the exploded Coca-Cola freezer incident are the creative north stars.

## Hackathon Scope

### Must Ship

- A working web app that starts reliably with `npm run dev`.
- A first-screen setup flow where the user enters the conflict scenario.
- Optional roommate photo upload used in the confrontation screen.
- A door-knock transition into the confrontation.
- A boss-battle style practice loop with:
  - roommate excuses,
  - user response/counter moments,
  - subtitles or chat-style transcript,
  - visible progress through the confrontation.
- An AI roommate dialogue integration or credible mock fallback.
- Deepgram speech-to-text input for the user's spoken response, or a clear fallback to typed input if credentials/networking block it.
- Text-to-speech output for the roommate voice, using Deepgram if available or browser speech synthesis as fallback.
- A demo-ready README with setup, environment variables, and known mock-mode behavior.

### Should Ship

- Persona controls for roommate intensity, deflection style, or accountability resistance.
- A safety layer that prevents abusive escalation loops and keeps the simulation focused on constructive confrontation practice.
- A Pika-backed or mock Pika-backed "0.5 zoom yapping roommate" video/avatar moment.
- A polished landing-to-game flow that makes the exploded Coke incident immediately legible.
- Basic observability or error visibility for sponsor/demo reliability.
- At least one canned demo scenario that works even when external APIs fail.

### Nice To Have

- Multiple named game modes such as `Cokefrontation`, `Argument Gym`, and `Roommate Boss Battle`.
- Round summaries that explain what the user did well and what to try next.
- Redis-backed memory for longer scenario state if sponsor fit and setup time allow.
- Sentry instrumentation for frontend/backend errors.
- Shareable victory or "grievance filed" result screen.

### Out Of Scope

- Textbook Buddy and educational video comparison ideas.
- Full user accounts, persistence, billing, or long-term saved history.
- Production-grade moderation beyond a lightweight hackathon safety layer.
- Real-time multiplayer.
- Training custom models.

## Current Baseline

The repository already contains an Express + Vite app with a strong visual direction and a playable demo flow:

- `server/index.js` exposes `/api/session`, `/api/argue`, `/api/media/forehead`, `/api/voice/token`, `/api/voice/speak`, `/api/media/avatar`, and `/api/health`.
- `client/src/main.js` supports scenario entry, photo upload, door knock animation, confrontation rounds, browser/Deepgram speech input, roommate TTS playback, and a victory state.
- `client/src/styles.css` establishes the comedy boss-battle visual language.
- `README` documents local startup, current API routes, environment variables, and mock-mode behavior.
- `.env.example` exists for local integration setup.
- `npm run check` and `npm run build` pass as of this roadmap update.

The remaining work is mostly clean-checkout verification, final browser smoke testing, optional sponsor integration depth, and demo-script polish.

## Milestone 1: Lock The Demo Loop

Goal: one complete run should work every time, with or without sponsor API keys.

- [ ] Confirm `npm install` and `npm run dev` work from a clean checkout.
- [ ] Add a default exploded Coke scenario button or prefilled sample.
  - Partially done: visible first-screen copy, placeholder text, and fallback topic make the Coke scenario legible. A one-click sample button or actual prefill is still remaining.
- [x] Ensure every user path has a useful fallback when an API key is missing.
  - Done for Gemini text, Gemini image, Deepgram STT, Deepgram TTS, and Pika avatar mock mode.
- [x] Make the confrontation loop feel complete: setup, knock, argue, resolution.
- [x] Add a final outcome screen or clear victory state.
  - Done as `Victory: Accountability Located` / `Grievance filed` state when boss health reaches zero.
- [ ] Smoke test desktop and mobile widths.

Acceptance criteria:

- A judge can run the app locally and complete a confrontation in under 2 minutes.
- Missing API keys do not break the demo.
- The core joke and value proposition are obvious within the first screen.

## Milestone 2: AI Roommate Dialogue

Goal: replace canned roommate responses with scenario-aware AI dialogue while preserving demo reliability.

- [x] Choose the LLM provider available to the team during the hackathon.
  - Current provider path is Gemini text, controlled by `GEMINI_API_KEY`, `GEMINI_TEXT_MODEL`, and `USE_GEMINI_TEXT`.
- [x] Add server-side environment variables for the LLM key and model.
- [ ] Create prompt templates for roommate personas:
  - deflective,
  - defensive,
  - oblivious,
  - fake-apologetic,
  - over-explainer.
- [ ] Send scenario, evidence level, aggro level, and conversation history to the model.
  - Partially done: scenario, evidence, aggro, round, and current user transcript are sent. Full multi-turn transcript history is still remaining.
- [ ] Return structured JSON for each round: roommate line, tactic label, coaching hint, and completion state.
  - Partially done: Gemini returns compact JSON with attack name, attack line, and roommate line. Coaching hint and model-provided completion state remain.
- [x] Keep the current canned response system as fallback.
- [ ] Add guardrails for non-abusive, constructive practice.
  - Partially done in the Gemini prompt tone constraints. Server-side safety checks are still remaining.

Acceptance criteria:

- The roommate responds specifically to the user's situation.
- The simulation stays funny without becoming cruel or unsafe.
- The app can recover gracefully if the LLM request fails.

## Milestone 3: Voice Layer With Deepgram

Goal: make the confrontation feel semi-real-time through spoken user input and roommate audio.

- [x] Implement `/api/voice/token` so the frontend can request a short-lived Deepgram token.
- [x] Add microphone permission flow in the battle screen.
- [x] Stream or record user speech and transcribe it with Deepgram STT.
- [x] Feed transcribed user responses into the argument engine.
- [x] Add roommate text-to-speech playback.
  - Done through `/api/voice/speak` with Deepgram audio and browser speech synthesis fallback.
- [x] Show subtitles for all spoken roommate lines.
- [ ] Provide typed input and/or mock transcript fallback.
  - Partially done: browser speech captions and mock-mode status exist. A typed text box fallback is still missing.

Acceptance criteria:

- A user can speak at least one response and see it affect the next roommate line.
- Roommate lines are audible or have a reliable browser/fallback voice.
- Audio failures degrade into typed/subtitle mode.

## Milestone 4: Roommate Media Layer

Goal: turn the uploaded photo into a memorable "0.5 zoom yapping roommate" demo moment.

- [x] Decide final media path:
  - Pika video generation,
  - Gemini/Nano Banana image edit,
  - CSS animation over uploaded image,
  - or a hybrid fallback.
  - Current path is Gemini/Nano Banana forehead image edit plus CSS yapping animation; Pika remains a mock hook.
- [ ] Wire `/api/media/avatar` to the selected provider if credentials are available.
- [x] Keep `/api/media/forehead` as a fast fallback for image-based comedy.
- [x] Animate the avatar while the roommate speaks.
  - Done as CSS yapping/defensive animations over uploaded or fallback face media.
- [x] Show media generation status without blocking the main confrontation.
- [ ] Cache or reuse generated media for the session.

Acceptance criteria:

- Uploaded roommate media appears in the confrontation.
- The avatar has a visible "yapping" state during roommate dialogue.
- The demo still works if external video generation is slow or unavailable.

## Milestone 5: Sponsor Polish

Goal: make sponsor technology visible without overbuilding.

- [ ] Deepgram: label STT/TTS usage in the demo narrative and README.
  - Partially done in README and UI copy. The final demo narrative/script still needs an explicit Deepgram beat.
- [ ] Pika: include generated or mock generated yapping-roommate media.
  - Partially done as a mock `/api/media/avatar` hook and CSS yapping-roommate fallback. A visible Pika-labeled demo beat remains optional polish.
- [ ] Sentry: optionally add frontend/backend error reporting if the team wants the implementation-practices angle.
- [ ] Redis: only add if using memory/vector state; otherwise avoid scope creep.
- [ ] Token router/compression sponsors: only add if the LLM provider path makes it trivial.

Acceptance criteria:

- Sponsor integrations are real where claimed.
- Mocked integrations are clearly described as mock mode.
- The final demo story explains why each integration improves the product.

## Milestone 6: Final Demo Readiness

Goal: prepare the project for judging.

- [ ] Update `README` with:
  - project description,
  - setup commands,
  - environment variables,
  - API integrations,
  - mock-mode behavior,
  - demo script.
  - Mostly done. The README has setup, env vars, routes, integrations, and mock-mode behavior; a tighter 60-90 second script is still remaining.
- [x] Add `.env.example` if missing.
- [x] Run `npm run check`.
- [x] Run `npm run build`.
- [ ] Verify the app in a browser.
- [ ] Prepare a 60-90 second live demo script:
  - introduce the exploded Coke incident,
  - upload a roommate image,
  - knock on the door,
  - speak/type a response,
  - show the roommate deflecting,
  - win by setting a calm boundary.

Acceptance criteria:

- The team can demo from a clean machine or deployed URL.
- The live flow has a backup path for every external service.
- Judges understand the project in one sentence: "It is a funny AI practice arena for confronting your roommate without losing your mind."

## Suggested Build Order

1. Stabilize the current mock game loop.
2. Add one excellent canned demo scenario.
3. Integrate LLM dialogue with fallback.
4. Add Deepgram STT/TTS.
5. Add Pika/media polish.
6. Update docs and rehearse the demo.

## Risk Register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| External API keys are unavailable | Demo breaks | Keep mock mode for LLM, voice, and media |
| Pika generation is too slow | User waits during demo | Treat video as optional and use animated uploaded image fallback |
| Voice permissions fail | Core loop blocked | Keep typed response input |
| AI dialogue gets too mean | Bad user experience | Use prompt constraints and server-side safety checks |
| Scope drifts into alternate projects | Team loses focus | Keep Textbook Buddy and other ideas out of hackathon scope |

## Definition Of Done

The hackathon version is done when a user can enter a roommate conflict, confront a funny AI roommate through a door-knock boss battle, hear or read the roommate's deflections, practice a response, and reach a satisfying resolution. The app should be polished enough to demo, resilient enough to survive missing API keys, and documented enough that another teammate can run it without explanation.
