# Session 2→3 Handoff

This file is the single source of truth for "what does the next session need to
know before touching code." It is replaced at the end of every working
session by a new file for the next pair of sessions — not appended to
forever. Read this whole file before reading the plan or touching any code.

`docs/SESSION_1-2_HANDOFF.md` is superseded by this file — delete it once
this file is trusted, don't leave both lying around.

## Handoff protocol (read this part every time)

- **Naming convention**: this file is named `SESSION_<from>-<to>_HANDOFF.md`,
  written at the end of session `<from>` to brief session `<to>`. When you
  finish your session, write a new file named for your session number and
  the next one (e.g. if you are session 3, write
  `docs/SESSION_3-4_HANDOFF.md`) with fully rewritten content reflecting
  current reality — don't edit this file in place once your session is the
  "to" side of it, and don't leave more than one handoff file describing the
  current state lying around (delete or clearly mark the previous one as
  superseded once the new one exists).
- **At the start of a session**: read the most recent handoff file in full,
  then re-read `DEEPGRAM_SPONSOR_PLAN.md` for the tier/feature you're about
  to build. Do not trust the plan's wording at face value — treat every
  concrete claim in it (event names, query param names, field shapes) as a
  hypothesis to confirm against the live API, not a spec to implement
  blindly. Sessions 1 and 2 both found places where the plan's literal
  wording didn't match live behavior.
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
- **Architectural decisions are scope/risk calls, not implementation
  details — surface them explicitly before coding, don't let them get
  decided implicitly by what's easiest mid-implementation.** Session 2 hit
  two of these (persistent-connection vs. reconnect-per-turn; barge-in vs.
  wait-then-listen) and both turned out to matter a lot. If a future session
  finds itself making a similar call without having said so out loud first,
  stop and say it out loud first.

## Where we are

Session 2 ("Turn Detection Gameplay") is complete and verified — server-side,
client-side, and live in the browser with real mic input, in Flux mode.
Session 1 ("Flux Foundation") shipped the env config, `/v2/listen` URL
building, and `sttMode` plumbing; nothing about that layer changed this
session except what's noted below.

What shipped, in `client/src/main.js`:

- **Persistent Flux connection.** The socket, `MediaRecorder`, and mic
  `stream` now survive across multiple turns within one "Argue live" click —
  previously (and still, in Nova mode) every turn fully tore down and
  required a fresh click. `resolveLiveArgument(transcript, { teardownVoice
  })` is the switch: Nova and the manual "Stop arguing" button pass the
  default `true` (full teardown, unchanged); Flux's in-conversation
  `EndOfTurn` advance passes `false`.
- **`handleFluxTurnInfo`** (new function) is the real Flux event handler,
  replacing Session 1's placeholder `console.debug`. It updates UI text on
  `StartOfTurn`, replaces (not appends) `state.voice.finalTranscript` with
  each `TurnInfo` message's `transcript` field (confirmed cumulative per
  turn via live testing), and on `EndOfTurn` calls `advanceBattle` without
  tearing down the connection.
- **Duplicate-advance guard**: `state.voice.lastAdvancedTurnIndex` tracks the
  last `turn_index` that triggered an advance; a repeat `EndOfTurn` for the
  same index is dropped and logged, not acted on twice.
- **Mic gated off during roommate TTS playback** (`state.tts.speaking`
  check in the recorder's `dataavailable` handler, Flux mode only) — this is
  the final, kept design. A true barge-in variant (mic transmitting
  continuously through TTS, interrupting the roommate on a new `EndOfTurn`)
  was built and then **deliberately reverted** after live testing — see
  "Barge-in: tried and reverted" below. Don't re-attempt it without reading
  that section first.
- **Real bug fix, independent of the barge-in decision**: `speakRoommateLine`
  now returns a promise that resolves when TTS playback actually *ends*, not
  when it merely *starts* (`audio.play()` resolving on playback start was
  the original bug). `advanceBattle` awaits it before returning, while still
  updating health bars/damage-pop/round text synchronously and instantly —
  only the "are we still busy" signal (`state.voice.processing`) is
  extended, not the visible UI feedback. Without this, `processing` cleared
  as soon as the `/api/argue` fetch resolved, well before the *separate*
  `/api/voice/speak` network call even started, leaving a window where a
  fast follow-up turn could advance the battle again and cut the roommate
  off mid-sentence — this was the first thing the user caught in manual
  testing and it was a real architectural gap, not a flaky mic issue.
- **Trade-off accepted, confirmed with the user**: the "Stop arguing" button
  now stays disabled for the entire duration the roommate is talking
  (previously it re-enabled the moment the LLM call returned, while TTS was
  still loading/playing). This was a deliberate, named trade-off, not an
  accident — "let them finish their sentence" was the explicit goal.

`.env`: `DEEPGRAM_STT_MODE` is now set to `flux` (was `nova` at the start of
this session) — this is the intended live mode going forward, not a leftover
test value. Leave it unless a future session has a specific reason to flip
back to Nova for comparison.

## Barge-in: tried and reverted

This is worth a dedicated section because it's the kind of thing a future
session might be tempted to re-build without re-reading why it didn't stick.

**What was built**: mic left transmitting continuously through the
roommate's TTS playback (no gating), relying on the `echoCancellation: true`
getUserMedia constraint (already present, unchanged) to keep the roommate's
own voice out of what Deepgram hears. A real `EndOfTurn` arriving while a
previous turn was still resolving/speaking was treated as the user talking
over the roommate: `stopRoommateSpeech()` cut the audio immediately and a
new turn resolution started right away, instead of being dropped.

**The hard part** was the handoff between an interrupted turn's
continuation and the new one — both touch the same shared state
(`processing`, `finalTranscript`, button state), and the interrupted one
resumes asynchronously after being unblocked. This was solved with a
generation counter (`state.voice.turnGeneration`): each turn claims a token,
and only the call still holding the current token is allowed to apply
cleanup side effects in its `finally` block. That mechanism worked
correctly in testing — the revert was not because the code was broken.

**Why it was reverted**: the user tested it directly and found it too
trigger-happy — small noises in a quiet room were enough to register as an
interruption. The actual demo venue will be *noisier* than the test room,
which would make this strictly worse, not better. The user made the call
explicitly: revert to wait-then-listen for demo reliability over the more
impressive-looking barge-in behavior.

**If a future session revisits this** (e.g. with a better mic, a
push-to-talk-style explicit interrupt gesture instead of ambient detection,
or a louder confidence threshold tuned specifically for interruption
detection rather than reusing the normal `eot_threshold`), the reverted code
is in git history on this branch (search for `turnGeneration` /
`handleFluxTurnInfo` barge-in commit) — don't redo the generation-counter
design from scratch, it worked. The thing to fix is the *trigger
sensitivity*, not the state-handoff mechanism.

The `state.tts.resolveSpeaking` mechanism in `stopRoommateSpeech()` (calls a
stored resolve callback so cutting off audio doesn't leave a "wait for
roommate to finish" promise hanging forever) was kept even after the revert
— it's cheap, harmless hygiene against a promise-hang edge case, not
barge-in-specific machinery.

## Verified facts to carry forward

These were confirmed against the **live** Deepgram API and/or real
client-server testing. Re-verify before relying on them if a meaningful
amount of time has passed or Deepgram ships a Flux update. (Session 1's
verified facts about audio format, API key entitlement, query param
strictness, and the stale-`npm run dev`-process trap still apply and aren't
repeated here — see git history for `SESSION_1-2_HANDOFF.md` if needed.)

1. **`data.event` literal values, confirmed live**: `"StartOfTurn"`,
   `"Update"`, `"EagerEndOfTurn"`, `"TurnResumed"`, `"EndOfTurn"` are all
   real, exact strings observed from `/v2/listen`.
2. **`transcript` on `TurnInfo` is cumulative per turn, not incremental.**
   Each message replaces the whole sentence-so-far; concatenating (Nova's
   pattern) would duplicate words. `handleFluxTurnInfo` assigns it directly.
3. **`turn_index` only increments after a genuine `EndOfTurn`.** It does
   NOT increment after `EagerEndOfTurn`/`TurnResumed` — a turn can cycle
   through `EagerEndOfTurn → TurnResumed → ... → EndOfTurn` more than once
   on the same `turn_index` before actually closing. Confirmed via two
   separate live tests (clean synthetic speech, and real hesitant speech
   with an actual pause-and-resume). This makes `turn_index` the correct
   per-turn dedupe/boundary key on a persistent connection.
4. **`EagerEndOfTurn` does not fire meaningfully earlier than `EndOfTurn`
   in practice** — observed gaps of 0ms and ~109ms in clean speech, well
   under any threshold that would justify speculative-response handling.
   Real hesitant speech *did* produce a ~1.06s Eager→Resumed→Final span in
   one live test, so the mechanism is real and situational, but Eager
   EOT/TurnResumed handling remains unbuilt and out of scope unless a
   future session has a specific reason to revisit it (note: if so, also
   revisit the now-removed `interrupt`/`turnGeneration` pattern from the
   barge-in attempt above, since Eager-EOT-driven speculative responses
   have the same "two things in flight, shared state" shape).
5. **Echo cancellation alone is not reliable enough for ambient barge-in
   detection in this environment**, confirmed by direct user testing in a
   quiet room — and the demo venue is expected to be noisier, not quieter.
   Don't re-litigate this without a concrete change to the detection
   approach (see "Barge-in: tried and reverted" above).
6. **A second, separate network call sits between "the LLM responded" and
   "the roommate is actually talking."** `/api/argue` and `/api/voice/speak`
   are sequential, not combined — any future change to the response timing
   model (e.g. starting TTS generation before `/api/argue` fully resolves)
   needs to account for this gap explicitly, the same way the
   `speakRoommateLine`-awaiting fix in this session had to.

## Next session brief

Turn-detection gameplay (Tier 1 #3 in `docs/DEEPGRAM_SPONSOR_PLAN.md`) is
done. Remaining and unstarted, in roughly the plan's own ordering:

- **Tier 1 #2 — Deepgram Referee Panel.** Currently turn state is shown via
  plain text through the existing `setVoiceUi` status line, not a dedicated
  panel. The plan wants a visibly Deepgram-branded UI surface (mode badge,
  turn-state labels, confidence, latency readout). Nothing built for this
  yet beyond what `handleFluxTurnInfo`'s status-text calls already produce
  incidentally.
- **Tier 1 #4 — Aura TTS as a comedy mechanic.** `speakRoommateLine`/`
  /api/voice/speak` have no `speed` parameter or battle-state-driven voice
  mapping yet. This is independent of everything Session 2 touched and
  could be picked up without re-reading the turn-detection internals in
  depth.
- **Tier 2 (5, 6, 7)** — boundary-clarity scoring, Deepgram Intelligence
  round analysis, post-fight fight card — entirely unstarted.

No single one of these is clearly "next" by necessity — that's a product
priority call for whoever starts the next session to make with the user up
front, the same way the persistent-connection and barge-in decisions were
made explicitly in this session rather than assumed.

## How to use this document going forward

Every handoff file should leave the next session able to open it cold with
zero memory of any prior conversation, understand exactly where the project
stands, know what's been verified vs. assumed, and know precisely what to
test first before writing code. When session 3 finishes, it should produce
`docs/SESSION_3-4_HANDOFF.md` in this same shape and remove or clearly
supersede this file — if a session ends without a new handoff file existing,
the handoff has failed.
