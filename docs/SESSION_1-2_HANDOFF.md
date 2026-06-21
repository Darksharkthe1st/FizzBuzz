# Session 1→2 Handoff

This file is the single source of truth for "what does the next session need to
know before touching code." It is replaced at the end of every working
session by a new file for the next pair of sessions — not appended to
forever. Read this whole file before reading the plan or touching any code.

## Handoff protocol (read this part every time)

- **Naming convention**: this file is named `SESSION_<from>-<to>_HANDOFF.md`,
  written at the end of session `<from>` to brief session `<to>`. When you
  finish your session, write a new file named for your session number and the
  next one (e.g. if you are session 2, write
  `docs/SESSION_2-3_HANDOFF.md`) with fully rewritten content reflecting
  current reality — don't edit this file in place once your session is the
  "to" side of it, and don't leave more than one handoff file describing the
  current state lying around (delete or clearly mark the previous one as
  superseded once the new one exists).
- **At the start of a session**: read the most recent handoff file in full,
  then re-read `DEEPGRAM_SPONSOR_PLAN.md` for the session you're about to do.
  Do not trust the plan's wording at face value — it was written before any
  code was verified against the real Deepgram API. Treat every concrete claim
  in it (event names, query param names, field shapes) as a hypothesis to
  confirm, not a spec to implement blindly. Session 1 found several places
  where the plan's literal wording was already wrong by the time it was
  tested against the live API.
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

## Where we are

Session 1 ("Flux Foundation") is complete and verified — server-side, client-side,
and live in a real browser, in both Nova and Flux modes. Specifically shipped:

- `DEEPGRAM_STT_MODE`, `DEEPGRAM_STT_MODEL`, `DEEPGRAM_EOT_THRESHOLD`,
  `DEEPGRAM_EAGER_EOT_THRESHOLD`, `DEEPGRAM_EOT_TIMEOUT_MS` added to `.env` and
  `.env.example`, with comments documenting the fail-soft behavior.
- `server/index.js`: `resolveSttMode()`, `resolveNumericEnv()`, and
  `buildListenUrl()` added. `createDeepgramToken()` now builds `/v1/listen`
  (Nova, unchanged from before this session) or `/v2/listen` (Flux)
  dynamically, and every response branch (mock, error, success) returns
  `sttMode` so the caller always knows which mode was resolved.
- `client/src/main.js`: `state.voice.sttMode` / `sttModel` are tracked. The
  websocket message handler safely no-ops on Flux's `TurnInfo` messages
  (logged via `console.debug` when `sttMode === "flux"`) instead of crashing
  or silently dropping them with no visibility. `JSON.parse` on incoming
  messages is now wrapped in try/catch.
- `/api/health` reports `deepgramSttMode` / `deepgramSttModel` under
  `integrations`, computed via the same helpers `createDeepgramToken` uses (no
  duplicated logic), and reported even when `USE_DEEPGRAM=false` so a bad mode
  value is visible without needing voice to be live.

Nothing in Session 1 touches turn-taking gameplay logic. The game still
advances on the Nova `speech_final` flag and the manual "Stop arguing" button
only. Flux events are observed and logged, not acted on.

## Verified facts to carry forward

These were confirmed against the **live** Deepgram API on 2026-06-21 using a
real API key, not inferred from documentation or training data. Re-verify
before relying on them if a meaningful amount of time has passed or Deepgram
ships a Flux update.

1. **Audio format is not a concern.** Flux's `/v2/listen` accepts the exact
   same `audio/webm;codecs=opus` container the browser's `MediaRecorder`
   already produces for Nova, with no `encoding`/`sample_rate` params needed.
   Verified by sending real speech audio and getting back live transcripts.
   This means the audio capture/send pipeline in `main.js` needs **no
   changes** for Flux — confirmed, not assumed.
2. **Flux access works on the existing `DEEPGRAM_API_KEY`.** No separate
   entitlement issue.
3. **The real Flux message schema is NOT what the original plan assumed.**
   The plan's Session 2 section (`docs/DEEPGRAM_SPONSOR_PLAN.md`) talks about
   `EndOfTurn`, `EagerEndOfTurn`, `TurnResumed`, and `UserStartedSpeaking` as
   if they are `data.type` values analogous to Nova's `Results`. They are not.
   What was actually observed:
   ```json
   {"type":"Connected","request_id":"...","sequence_id":0}
   {"type":"TurnInfo","event":"Update","turn_index":0,
    "audio_window_start":0.0,"audio_window_end":0.96,
    "transcript":"Please stop","words":[{"word":"Please","confidence":1.0}],
    "end_of_turn_confidence":0.0062,"sequence_id":4}
   {"type":"TurnInfo","event":"StartOfTurn", ...}
   ```
   So `data.type` is consistently `"TurnInfo"` (or `"Connected"` once at
   connect time), and the turn-phase information the plan calls
   `EndOfTurn`/`EagerEndOfTurn`/`TurnResumed` likely lives in `data.event`
   instead — **but `EndOfTurn` and `TurnResumed` were never actually observed**
   in Session 1's test (only `"Update"` and `"StartOfTurn"` appeared,
   because the test audio's `end_of_turn_confidence` never crossed the
   configured threshold before the test ended). **Session 2 must confirm the
   actual `event` value Deepgram uses for end-of-turn before writing any
   logic that branches on it** — do not assume it's literally the string
   `"EndOfTurn"`.
4. **Deepgram validates query param names strictly.** An unrecognized query
   param name causes an immediate abnormal close (code `1006`), not a silent
   ignore. This is a feature, not a risk: a typo in a future query param will
   fail loudly and immediately. Confirmed param names so far: `model`,
   `eot_threshold`, `eager_eot_threshold`, `eot_timeout_ms`. Do not add a new
   query param without testing it against the live API first the same way
   (see "How Session 1 verified this" below).
5. **Param *value* validity (vs. name validity) was only spot-checked, not
   exhaustively tested.** Out-of-range/non-numeric values for the three EOT
   params are now clamped/defaulted client-side in `resolveNumericEnv()`
   before they ever reach Deepgram, so this matters less going forward, but
   if a new tunable is added, verify Deepgram's actual accepted range, don't
   guess.
6. **How Session 1 verified this** (reusable method for Session 2): a
   throwaway Node script using the native `WebSocket` global (Node 24+, no
   `ws` package needed), authenticating via
   `new WebSocket(url, ["token", apiKey])` (static key) — Node's native
   WebSocket does not support custom headers, so subprotocol-based auth is
   the only option from a script, same as the browser. Test audio was
   synthesized via Windows SAPI (`System.Speech.Synthesis.SpeechSynthesizer`
   in PowerShell) and converted to webm/opus and raw PCM with `ffmpeg` (both
   available in this environment). The script and generated test files were
   deleted after use — recreate them fresh rather than expecting them to
   still exist.
7. **A stale `npm run dev` process can silently serve old code.** Session 1
   lost time to a leftover Node process already bound to port 5175 from an
   earlier session, which kept answering requests with pre-edit behavior. Find
   the real owner before testing with `netstat -ano | grep ":5175" | grep
   LISTENING`, not just by assuming the most recently started `npm run dev`
   is the one on the port.
8. **Live-mic testing in this environment can produce audio feedback.**
   Speaking near a machine that's also playing roommate TTS through speakers
   can get transcribed as the user's own turn. Not a Session 1 bug — a real
   constraint to design around (mute mic during roommate playback, use
   headphones when testing) once barge-in (Tier 3) or general demo hygiene
   comes up.
9. **Design decision, confirmed with the user**: invalid/unrecognized
   `DEEPGRAM_STT_MODE` values fail soft to `"nova"` with a loud `console.warn`,
   never a hard error. This was an explicit choice (not a default I should
   silently reverse) because uptime during judging matters more than catching
   a typo at the cost of breaking voice entirely. Apply the same philosophy to
   new config surfaces in later sessions unless the user says otherwise.

## Next session brief: Session 2 — Turn Detection Gameplay

Per `docs/DEEPGRAM_SPONSOR_PLAN.md`, Session 2's stated scope is: handle Flux
turn events, advance the battle on end-of-turn, add duplicate-turn protection,
show turn state in the UI.

**Before writing any code**, do the equivalent of Session 1's Step 1: run a
live discovery test against `/v2/listen` with audio that actually triggers a
high `end_of_turn_confidence` (the Session 1 test never did — pause naturally
after a full sentence, or send a longer clip with trailing silence) and
capture what `data.event` actually says at that moment. Do not write
`if (data.event === "EndOfTurn")` (or whatever the plan implies) without
having seen that exact string come back from the live API first. Same goes
for whatever `TurnResumed` turns out to look like — the plan describes it as
a way to cancel a speculative response if the user keeps talking after a
pause, but it has not been observed yet.

Concretely, scrutinize these specific plan claims against live behavior before
trusting them:

- That `EagerEndOfTurn` is a literal value worth branching on for "start
  preparing the roommate response early" — confirm the field/value that
  signals this, and confirm it actually fires meaningfully earlier than the
  final end-of-turn signal in practice (not just in theory).
- That a `TurnResumed`-equivalent event exists and is distinguishable from a
  fresh new turn starting (`turn_index` incrementing, based on what was
  observed in Session 1, looks like the relevant signal — confirm before
  relying on `data.event` string matching alone).
- Whether `turn_index` is reliable for "duplicate-turn protection," or
  whether `sequence_id` is the better dedupe key — Session 1 only observed
  these counters under one continuous turn that never resolved to a new
  index.

Once the real event semantics are confirmed, the implementation should:

- Replace the Session-1 placeholder `if (state.voice.sttMode === "flux")
  console.debug(...)` branch in `main.js`'s websocket message handler with
  real handling, while leaving the Nova `Results` path completely untouched
  (same pattern as Session 1: two parallel paths, not a rewrite of the
  working one).
- Keep the manual "Stop arguing" button working as a fallback in both modes —
  the plan's acceptance criteria for this session require it.
- Add the duplicate-advance guard before wiring the battle-advance call, not
  after — a double-advance bug discovered after this is built and demoed once
  is much more annoying to chase down than one prevented by design.

## How to use this document going forward

Every handoff file should leave the next session able to open it cold with
zero memory of any prior conversation, understand exactly where the project
stands, know what's been verified vs. assumed, and know precisely what to
test first before writing code. When session 2 finishes, it should produce
`docs/SESSION_2-3_HANDOFF.md` in this same shape and remove or clearly
supersede this file — if a session ends without a new handoff file existing,
the handoff has failed.
