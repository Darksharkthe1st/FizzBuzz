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
show turn state in the UI. **That framing is incomplete.** A deep review of
this plan against the actual code in `client/src/main.js` found an
architectural gap underneath it that has to be resolved first, or the session
can burn its whole budget on event-name discovery and ship something that
still requires a button press per turn — i.e. the headline acceptance
criterion never actually gets met.

### Step -1 (do this before Step 0): make the connection-lifecycle decision

**The current voice loop is reconnect-per-turn, not a persistent conversation.**
Verified by reading the code, not assumed:

- [`resolveLiveArgument`](../client/src/main.js#L477) calls `stopVoiceArgument(false)`
  ([main.js:483](../client/src/main.js#L483)) every time a turn resolves.
- `stopVoiceArgument` calls `cleanupDeepgramVoice` ([main.js:458](../client/src/main.js#L458)),
  which tears down the websocket, the `MediaRecorder`, and the mic `stream`
  completely ([main.js:467-470](../client/src/main.js#L467)).
- After the round finishes, the button resets to "Argue live"
  ([main.js:493](../client/src/main.js#L493)) — the next turn requires a fresh
  click, fresh `getUserMedia`, fresh `/api/voice/token`, and a brand-new
  `/v2/listen` connection.

Tier 1 #3's acceptance criterion is *"the user speaks naturally, pauses, and
the roommate responds without pressing another button."* That cannot happen
under reconnect-per-turn — each turn already ends in a full teardown, so
adding an `EndOfTurn` handler on top of it does not produce a multi-turn,
button-free conversation. To actually deliver the stated criterion, the
session must change the architecture so the socket and mic stream survive
across multiple turns within one "Argue live" session, and the EndOfTurn
handler calls `advanceBattle` directly without tearing down voice state.

**Decide this explicitly, in writing, before Step 0** — don't let it get
decided implicitly by what happens to be easiest once the discovery test is
underway. If a true persistent-connection rework is too large for this
session's time budget, that's a legitimate call, but say so up front and
scope Session 2 down to "EndOfTurn replaces the Nova `speech_final` trigger
within the existing reconnect-per-turn loop" — which is real, demoable
progress, just not the multi-turn experience the sponsor plan describes.
Whichever way this goes, write the decision and its reasoning into
`docs/SESSION_2-3_HANDOFF.md` so Session 3 isn't left to reverse-engineer it.

> **Decision made (2026-06-21, confirmed with the user): persistent
> connection.** Session 2 will rework `stopVoiceArgument`/`resolveLiveArgument`
> so the Flux socket and mic stream survive across multiple turns within one
> "Argue live" session, and the EndOfTurn handler calls `advanceBattle`
> directly without tearing down voice state. This means the TTS-playback
> audio-gating mitigation below is in scope for this session, not deferred,
> and `turn_index` is expected to be a meaningful per-connection signal once
> built (confirm live in Step 0 rather than assuming).

This decision changes what later steps even need to test:

- **If persistent-connection**: `turn_index` becomes a meaningful signal, and
  the real dedupe question is "does Deepgram ever re-emit the same
  `turn_index` with a duplicate EndOfTurn" (reconnection/retry), not whether
  `turn_index` increments at all.
- **If reconnect-per-turn stays**: `turn_index` will almost always be `0` or
  very low per connection — not useful as a dedupe key — and the
  duplicate-advance risk is already mostly handled by existing guards (the
  `state.voice.processing` check in
  [resolveLiveArgument:479](../client/src/main.js#L479) and the stale-socket
  check `state.voice.socket !== socket` in the message handler). Don't spend
  time building new dedupe machinery this path doesn't need.

**If persistent-connection is chosen, mic feedback is in scope for this
session, not a deferred Tier 3 concern.** Verified fact #8 (mic picking up
roommate TTS played through speakers) was written as a future barge-in
problem, but it is a direct, immediate consequence of keeping the mic hot
across turns: the roommate's own Aura TTS audio can get transcribed as the
start of a new user turn, firing a spurious EndOfTurn and an unwanted battle
advance — live, in front of judges. Scope an explicit mitigation (gate/pause
outbound audio frames during TTS playback — don't close the socket, just
stop transmitting) into this session rather than discovering it during a demo
run.

### Step 0 results (confirmed live against `/v2/listen`, 2026-06-21)

Tested with `model=flux-general-en`, `eot_threshold=0.7`, `eager_eot_threshold=0.6`,
two synthesized utterances streamed back-to-back on **one persistent
connection** (matching the Step -1 decision).

1. **`data.event === "EndOfTurn"` is the literal string.** Confirmed live —
   happened to match the plan's original wording, but this is now verified,
   not assumed.
2. **`EagerEndOfTurn` fires, but not meaningfully earlier than `EndOfTurn`.**
   Observed gaps: 0ms apart (turn 0), ~109ms apart (turn 1) — well under the
   ≥300ms bar set above. **Decision: drop Eager EOT from this session's
   scope.** There is nothing worth preparing early, so the `TurnResumed`
   cancellation mechanism is also out of scope for this session — don't
   build `AbortController` plumbing for a feature that isn't being used.
3. **The `transcript` field on `TurnInfo` is cumulative per turn, not
   incremental.** Successive `Update`/`EndOfTurn` messages for the same
   `turn_index` carry the full sentence-so-far ("Hey," → "Hey" → "Hey. Can"
   → ... → full sentence). The Flux handler must **replace**
   `state.voice.finalTranscript` with each message's `transcript` field
   verbatim — do not reuse Nova's concatenation pattern
   ([main.js:310-311](../client/src/main.js#L310)), it would double up words.
4. **`turn_index` increments cleanly per turn on a persistent connection**
   (`0 → 1 → 2`, confirmed across two real turns) — it is a meaningful
   per-connection signal as hypothesized. No duplicate `EndOfTurn` for the
   same `turn_index` was observed, but only the clean case was tested — a
   network blip/reconnect-mid-turn scenario was not, so don't treat dedupe
   as fully proven, just proven for the happy path.
5. **`StartOfTurn` fires mid-turn, once real speech is detected** — not at
   the moment a new `turn_index` opens (which starts with one or more
   empty-transcript `Update` events first, e.g. silence/lead-in audio). This
   maps directly to the sponsor plan's "User started speaking" UI state
   (Tier 1 #2) — use `StartOfTurn`, not the `turn_index` boundary, to drive
   that indicator.
6. **`TurnResumed` confirmed in a follow-up live-mic test (2026-06-21).** Real
   speech with a genuine mid-sentence pause ("Okay, here's the thing... I
   really did mean to clean it up, I just lost track of time... [pause]
   what?") produced `EagerEndOfTurn → TurnResumed → Update → EagerEndOfTurn →
   Update → EndOfTurn`, all under the **same** `turn_index` — confirming
   `turn_index` only increments after a genuine `EndOfTurn`, never after a
   false-alarm `EagerEndOfTurn`/`TurnResumed` cycle. This is strong
   confirmation that `turn_index` is the correct per-turn dedupe/boundary
   key for the persistent-connection design. Also note: a single turn_index
   can cycle through `EagerEndOfTurn`/`TurnResumed` more than once before
   actually closing — don't assume exactly one `EagerEndOfTurn` precedes one
   `EndOfTurn`. (Real hesitant speech triggered a ~1.06s Eager→Resumed→Final
   span here, vs. near-zero in the earlier clean synthetic-speech test — the
   mechanism is real, it just wasn't worth building against this session's
   clean-speech-only test. Eager EOT/TurnResumed handling remains out of
   scope for this session per the decision above; this is recorded for
   whichever future session revisits it.)

### Step 0 original plan (for reference — superseded by results above)

Run a live discovery test against `/v2/listen` with audio that actually
triggers a high `end_of_turn_confidence` (the Session 1 test never did —
pause naturally after a full sentence, or send a longer clip with trailing
silence) and capture what `data.event` actually says at that moment. Do not
write `if (data.event === "EndOfTurn")` (or whatever the plan implies)
without having seen that exact string come back from the live API first.
Same goes for whatever `TurnResumed` turns out to look like.

Add to this test, beyond what Session 1 covered:

- **Transcript accumulation shape.** Confirm whether a `TurnInfo`/`Update`
  event's `transcript` field is cumulative for the whole turn so far, or just
  the latest incremental words. This determines whether Nova's existing
  accumulation pattern (concatenate `finalTranscript` across messages,
  [main.js:310-311](../client/src/main.js#L310)) can be reused as-is for Flux,
  or whether the handler needs to replace rather than append on each
  `Update`. Test by speaking a multi-word sentence and diffing successive
  `Update` transcripts.
- **Duplicate-EndOfTurn behavior**, scoped per the Step -1 decision above —
  either "does the same `turn_index` ever get a second EndOfTurn" (persistent
  connection) or confirm the existing guards already cover the
  reconnect-per-turn case (no new test needed if so — just confirm, don't
  build).

Also scrutinize these specific plan claims against live behavior:

- That `EagerEndOfTurn` is a literal value worth branching on for "start
  preparing the roommate response early" — confirm the field/value, and set a
  concrete bar before testing (e.g. "only worth using if it reliably fires
  ≥300ms before final EndOfTurn across several utterances") so this doesn't
  become an open-ended judgment call mid-session. If it doesn't clear the
  bar, explicitly drop Eager EOT from this session's scope rather than
  half-implementing it.
- If Eager EOT is kept: there is currently **no cancellation mechanism**
  anywhere in `advanceBattle` or the server-side roommate-response call — it's
  a plain `await postJson(...)` ([main.js:739](../client/src/main.js#L739)).
  "Cancel the speculative response on `TurnResumed`" needs a concrete
  mechanism (e.g. `AbortController` on the fetch) decided and built, not left
  as an implied detail. If building real cancellation is out of budget, the
  documented fallback is "let the early response land and discard its
  result" — name that as the fallback, don't let it happen by accident.

### Implementation, once the above is settled

- Replace the Session-1 placeholder `if (state.voice.sttMode === "flux")
  console.debug(...)` branch in `main.js`'s websocket message handler with
  real handling, while leaving the Nova `Results` path completely untouched
  (same pattern as Session 1: two parallel paths, not a rewrite of the
  working one).
- Keep the manual "Stop arguing" button working as a fallback in both modes —
  the plan's acceptance criteria for this session require it.
- Build the duplicate-advance guard (if the Step -1 decision says one is
  actually needed — see above) before wiring the battle-advance call, not
  after.
- If persistent-connection was chosen, build the TTS-playback audio gating
  before doing any live multi-turn testing — testing multi-turn flow without
  it risks the feedback loop described above corrupting every test run.

## How to use this document going forward

Every handoff file should leave the next session able to open it cold with
zero memory of any prior conversation, understand exactly where the project
stands, know what's been verified vs. assumed, and know precisely what to
test first before writing code. When session 2 finishes, it should produce
`docs/SESSION_2-3_HANDOFF.md` in this same shape and remove or clearly
supersede this file — if a session ends without a new handoff file existing,
the handoff has failed.
