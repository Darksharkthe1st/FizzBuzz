# Session 3→4 Handoff

This file is the single source of truth for "what does the next session need to
know before touching code." It is replaced at the end of every working
session by a new file for the next pair of sessions — not appended to
forever. Read this whole file before reading the plan or touching any code.

`docs/SESSION_2-3_HANDOFF.md` is superseded by this file — delete it once
this file is trusted, don't leave both lying around.

## Handoff protocol (read this part every time)

- **Naming convention**: this file is named `SESSION_<from>-<to>_HANDOFF.md`,
  written at the end of session `<from>` to brief session `<to>`. When you
  finish your session, write a new file named for your session number and
  the next one (e.g. if you are session 4, write
  `docs/SESSION_4-5_HANDOFF.md`) with fully rewritten content reflecting
  current reality — don't edit this file in place once your session is the
  "to" side of it, and don't leave more than one handoff file describing the
  current state lying around (delete or clearly mark the previous one as
  superseded once the new one exists).
- **At the start of a session**: read the most recent handoff file in full,
  then re-read `DEEPGRAM_SPONSOR_PLAN.md` for the tier/feature you're about
  to build. Do not trust the plan's wording at face value — treat every
  concrete claim in it (event names, query param names, field shapes,
  response headers) as a hypothesis to confirm against the live API, not a
  spec to implement blindly. Sessions 1, 2, and 3 have all found places
  where the plan's literal wording didn't match live behavior.
- **At the end of a session**: before ending, write the next handoff file
  (per the naming convention above) with fully current "Where we are,"
  "Verified facts," and "Next session brief" sections. Replace stale content
  rather than stacking a session log — the goal is a current snapshot the
  next session can act on immediately, not a history. If something verified
  earlier turns out to be wrong later, fix the entry rather than leaving both
  versions across files.
- **Mission-critical framing carries forward**: this project favors clear,
  loud, early failure over the fastest path to something that looks done.
  Validate assumptions against the real API before writing code that depends
  on them. Prefer "log loudly and fall back to a known-good default" over
  either silent failure or a hard crash, unless a future session and the user
  explicitly agree a hard failure is better for a specific case.
- **Architectural/scope decisions are calls to surface explicitly, not let
  get decided implicitly by what's easiest mid-implementation.** Session 2
  hit this with persistent-connection vs. reconnect-per-turn and barge-in
  vs. wait-then-listen. Session 3 hit it with Aura TTS scope: the plan's
  "Session 3: Aura Personality" actually bundles two separable features —
  TTS speed mapped to battle state, and a user-facing voice-casting
  selector with its own responsible-AI guardrail (don't infer identity from
  the uploaded photo). Those were surfaced and explicitly split before
  coding; only the speed mapping shipped this session. If a future session
  finds itself making a similar scope call without saying so out loud
  first, stop and say it out loud first.
- **Commit as you go.** Session 2 left a verified, demo-critical bug fix
  sitting uncommitted in the working tree for an unknown amount of time
  with no flag anywhere that it was at risk — a stray `git checkout .` or
  crash would have silently erased it with zero trace in history. Don't
  let working-tree state be the only place finished work lives across a
  session boundary.

## Where we are

Session 3 ("Referee Panel + Aura Personality, descoped") is complete and
verified live against the real Deepgram API and in the browser via the Flux
path. Session 2 ("Turn Detection Gameplay") is unchanged underneath this
session's work — see git history (`git log --oneline`) for that detail
rather than carrying it forward stale in this file.

What shipped, across `client/index.html`, `client/src/styles.css`,
`client/src/main.js`, and `server/index.js`:

- **Deepgram Referee panel** (Tier 1 #2). The old single `#voiceStatus`
  text line is now a labeled panel (`.referee-header` / `.referee-badge` /
  `.referee-turn-state` / `.referee-confidence` / `.referee-latency`) inside
  the existing `.voice-evidence` block — same container, restructured
  contents, original element IDs (`voiceTranscript`, `voiceStatus`,
  `voiceMeter`) kept so nothing else had to change. It shows:
  - **Mode badge** (`#refereeModeBadge`): `Flux live` / `Nova fallback` /
    `Browser mock` / `Typed fallback` / `Idle`, set from `token.sttMode` on
    a successful Deepgram token, or from `startBrowserSpeechFallback`'s own
    `SpeechRecognition` availability check (there is no separate "typed
    fallback" UI in the app today — that label fires only when even
    browser captions are unavailable, meaning the player has no further way
    to argue by voice this round; it doesn't point at a hidden typed input).
  - **Turn state** (`#refereeTurnState`): `Awaiting mic` / `Listening` /
    `User started speaking` / `Still talking` / `End of turn detected` /
    `Roommate preparing deflection`, driven from Flux `TurnInfo` events,
    Nova `Results` events, and the browser `SpeechRecognition` `result`
    event — all three paths wired, not just Flux.
  - **Confidence** (`#refereeConfidence`): only set from real Deepgram
    fields (`data.confidence` on Flux TurnInfo if present — unconfirmed
    whether Flux ever actually sends it, so it gracefully shows nothing if
    absent; `data.channel.alternatives[0].confidence` on Nova). Explicitly
    cleared (not faked) on the browser-fallback path, since
    `SpeechRecognition` isn't Deepgram and showing a number there would
    misattribute it.
  - **Latency** (`#refereeLatency`): "Mic to first transcript" once per
    voice session (`markMicLatencyStart`/`markFirstTranscript`), then "End
    of turn to roommate response" once per turn
    (`markEndOfTurn`/`markRoommateResponseStart`), the second one timed to
    when audio playback actually starts (`audio.play()` resolving, or
    `speechSynthesis.speak()` being called), not when the network request
    resolves — same "actual playback, not network completion" principle as
    Session 2's `speakRoommateLine` fix.
  - `resetRefereePanel()` clears all of the above; called from the prep-form
    submit handler and `resetButton`, alongside the new `stopRoommateSpeech()`
    calls added in those same two places (previously a stale TTS style label
    could survive a reset — see below).
- **Aura TTS speed as a comedy mechanic** (Tier 1 #4, **speed mapping only
  — see "Scope cut" below**). `resolveTtsStyle(bossHealth, aggro)` in
  `client/src/main.js` maps current battle state to one of five
  `{ speed, label }` pairs and both `advanceBattle` call sites
  (session-backed and local-fallback) pass the current `state.boss`/
  `state.aggro` into it before calling `speakRoommateLine`. Priority order:
  defeated (`boss <= 0`) beats panic (`boss <= 30`) beats aggro-driven
  (`aggro >= 4` or `<= 2`) beats normal — cornered-and-losing reads better
  than "still aggressive while losing," so health takes precedence over the
  aggro slider. `speakWithBrowserVoice` also takes the resolved speed and
  applies it to `utterance.rate` for parity in the no-Deepgram fallback.
  A small label (`#ttsStyleLabel`, e.g. "Aura TTS: panic speed") shows under
  the subtitle while the roommate is talking, attributing it visibly to
  Deepgram Aura per the plan's acceptance criteria.
- **Server side** (`server/index.js`): `/api/voice/speak` now accepts
  `payload.speed`, clamped via `resolveTtsSpeed`/`clampNumber` to **0.7–1.5**
  (see "Verified facts," this is narrower than the plan's wording implied),
  forwarded as a `speed` query param to `/v1/speak`. The real
  `dg-char-count` response header is now also logged and forwarded back to
  the client (the previously-assumed `dg-speed-used` header does not exist
  on live responses — see below, not implemented, don't add code that reads
  it).

## Scope cut, decided explicitly with the user before coding

The plan's own "Session 3: Aura Personality" and the separate "Voice
Casting" section together describe a bigger feature than "Tier 1 #4" alone
suggests: voice style presets (`Deadpan`/`Frantic`/`Smug`/etc.), a preview-
voice button, multi-voice Aura model mapping, and session storage of the
chosen voice — plus an explicit responsible-AI guardrail (don't infer
gender/age/race from the uploaded roommate photo; let the user pick the
voice style themselves).

**This session shipped only the speed-mapping half.** Voice casting
(style selector, preview button, multi-voice plumbing, the guardrail
language) is entirely unbuilt — `server/index.js` still hardcodes a single
TTS model (`aura-2-thalia-en` via `DEEPGRAM_TTS_MODEL`). This was a deliberate,
named scope cut confirmed with the user up front, not an oversight. If a
future session picks this up, re-read the plan's "Voice Casting" section in
full (not just Tier 1 #4) before starting, and keep the guardrail in mind:
no face-based inference, user-controlled and editable choice, a `Surprise
me` option is fine but auto-classifying from the photo is not.

## Verified facts to carry forward

These were confirmed against the **live** Deepgram API and/or real
client-server/browser testing this session. Re-verify before relying on
them if a meaningful amount of time has passed or Deepgram ships an update.
(Session 1 and 2's verified facts about audio format, API key entitlement,
query param strictness, Flux event names/semantics, and the stale-`npm run
dev`-process trap still apply and aren't repeated here — see
`SESSION_2-3_HANDOFF.md` in git history if needed.)

1. **`/v1/speak` accepts a `speed` query param and it genuinely changes
   playback pace** — confirmed by comparing output audio byte size at a
   fixed text length across `speed=0.75/1.0/1.3` (51264 / 38016 / 25776
   bytes respectively for the same sentence). The param name and mechanism
   are real, not a guess.
2. **The accepted `speed` range is roughly 0.7–1.5, not the wider range the
   plan's wording might suggest.** Live-tested boundaries: `0.6` and `0.65`
   → 400 Bad Request; `0.7` → 200. `1.5` and `1.45` → 200; `1.6`, `1.8`,
   `2.0` → 400 Bad Request. The server clamps to `[0.7, 1.5]`
   (`resolveTtsSpeed` in `server/index.js`) based on this. All five of the
   plan's example speed values (0.75/0.85/1.0/1.18/1.3) fall safely inside
   this window, so the game's mapping didn't need to change, but don't
   widen the clamp without re-verifying live first.
3. **There is no `dg-speed-used` response header on live `/v1/speak`
   responses.** The plan's step 4 asked to "return and log" it; it doesn't
   exist. The full set of headers a real 200 response exposes (per
   `access-control-expose-headers` and direct inspection) is:
   `dg-model-name`, `dg-model-uuid`, `dg-additional-model-uuids`,
   `dg-char-count`, `dg-request-id`, `dg-project-id`, `dg-error`,
   `dg-breaks-applied`, `dg-pronunciations-applied`,
   `dg-pronunciation-warnings`. Only `dg-request-id`, `dg-model-name`, and
   `dg-char-count` are currently read/forwarded/logged — there was no need
   to read the others this session, but they do exist if a future session
   needs them (e.g. `dg-breaks-applied`/`dg-pronunciations-applied` for a
   speech-quality feature).
4. **Live in the browser via the Chrome extension, with real Deepgram
   credentials**: clicking "Argue live" successfully minted a Flux token,
   opened the `/v2/listen` websocket, and the referee panel correctly
   showed `Flux live` / `Listening`. The Aura TTS speed label
   (`Aura TTS: normal speed`) rendered correctly under the subtitle for the
   door-opening line at default battle state (boss=100, aggro=3). Did not
   verify the panel's turn-state transitions (`User started
   speaking`/`Still talking`/`End of turn detected`) against real spoken
   audio in this session — the wiring mirrors Session 2's confirmed
   `handleFluxTurnInfo` event semantics, but **a future session should
   speak into the mic and confirm the turn-state label actually advances
   through all five states before treating this as fully proven**, the
   same caution the project applies everywhere else.
5. Unconfirmed, not blocking: whether Flux `TurnInfo` messages ever actually
   include a `confidence` field. The referee panel reads
   `data.confidence` defensively (shows it if present, clears it if not)
   rather than assuming either way — if a future session confirms it's
   always absent, the dead code path can be removed, but there was no need
   to chase that down this session since the graceful-absence behavior is
   correct either way.

## Next session brief

Remaining and unstarted, in roughly the plan's own ordering:

- **Finish Tier 1 #4 — Voice Casting.** The deliberately-cut half of Aura
  Personality: style selector, preview-voice button, multi-voice Aura
  model mapping, session storage, and the responsible-AI guardrail. See
  "Scope cut" above before starting.
- **Tier 2 (5, 6, 7)** — boundary-clarity scoring, Deepgram Intelligence
  round analysis, post-fight fight card — entirely unstarted.
- **Carried over from Session 2, still unbuilt and still optional**:
  `EagerEndOfTurn`-driven speculative response preparation. Session 2 found
  the eager/final gap too small in clean speech to be worth it; nothing
  new this session changes that assessment.
- **Verification gap from this session** (see Verified Fact #4): confirm
  the referee panel's turn-state label actually advances correctly against
  real spoken audio, not just the static "Listening" state after connect.

No single one of these is clearly "next" by necessity — that's a product
priority call for whoever starts the next session to make with the user up
front, the same way previous scope/architecture decisions were made
explicitly rather than assumed.

## How to use this document going forward

Every handoff file should leave the next session able to open it cold with
zero memory of any prior conversation, understand exactly where the project
stands, know what's been verified vs. assumed, and know precisely what to
test first before writing code. When session 4 finishes, it should produce
`docs/SESSION_4-5_HANDOFF.md` in this same shape and remove or clearly
supersede this file — if a session ends without a new handoff file existing,
the handoff has failed.
