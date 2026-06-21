# Fizz Buzz — Roommate Confrontation Simulator

> Drop this file at the repo root. Claude Code auto-loads `CLAUDE.md` as context.
> It encodes decisions already made — follow them, don't re-litigate them. When a tradeoff
> appears, the rule is always: **fake smart, ship the demo, don't gold-plate.**

---

## What this is

A web app where you rehearse a hard conversation with your roommate. You describe your
situation and upload a photo of the roommate. The app animates knocking on their door; the
door opens to reveal the roommate as a **0.5-zoom "tiny body, huge head" meme**, who then
**yaps at you** with AI-generated dialogue, real voice, and subtitles. You talk back (mic or
typing); the conversation continues, with the roommate staying defensive and a little
delusional.

It's a comedy app with a real angle: **conflict rehearsal** — people avoid hard conversations,
this lets you practice one. Say that sentence in the demo; it converts a joke into a "joke with
a point" and protects our weakest judging axis (Application).

**Based on a true story:** new roommate put Coca-Cola bottles + cans in the freezer, they
exploded, leaked all over the floor, we cleaned it up, and are confronting him. The whole brand
is a parody of Coca-Cola — hence **Fizz Buzz** (fizz = exploded soda, buzz = doorbell +
confrontation tension; bonus that "FizzBuzz" is the classic baby coding problem, a funny flex
at an AI hackathon).

---

## The single most important architectural rule

**Pika is NEVER in the runtime critical path.** Pika video generation takes ~10s–60s+ per clip;
calling it live would put dead air after every roommate line and kill the demo.

Instead: **pre-generate a small set of "yapping" video loops offline, store them as static
assets, and at runtime just play the loop whose mood matches the roommate's reply while
Deepgram TTS speaks the actual line over it.** The audio carries the meaning. The video is
b-roll of a guy yapping. The mouth not matching the words exactly is *funnier*, not a bug — do
not attempt real lip-sync.

If you (the agent) ever find yourself writing a Pika API call inside the runtime conversation
loop, **stop** — that's the one mistake that breaks this project.

---

## Tech stack

- **Frontend:** Vite + React + plain CSS (CSS custom properties for tokens). Single-page, scene
  state machine via `useState`/`useReducer`. No router needed.
- **Backend:** thin Node/Express server in `server/`. Exists only to (a) call the LLM and (b)
  mint short-lived Deepgram keys / proxy TTS so no secret keys hit the client.
- **Speech:** **Deepgram** — streaming STT (you talking) + Aura TTS (roommate voice).
- **Video:** **Pika** — used **offline only** to pre-render yapping loops into `public/clips/`.
- **LLM:** any fast model (use whatever sponsor credits you have). Returns the roommate's reply
  + a mood tag as JSON.

### Env (`.env`, never commit — provide `.env.example`)
```
DEEPGRAM_API_KEY=
LLM_API_KEY=
LLM_MODEL=            # e.g. a fast chat model
PORT=3001
```
Pika needs no runtime key — clips are baked before the demo.

---

## Runtime loop (the per-turn sequence)

```
[user holds mic button]  (typing is the fallback path, build it first)
        │
        ▼
Deepgram streaming STT ──► transcript
        │
        ▼
POST /api/roommate { situation, history, userText }
        │
        ▼
LLM ──► { "reply": "...", "mood": "defensive" }   (strict JSON)
        │
        ├──► clips.js maps mood → public/clips/<mood>.mp4   (fallback: idle_yap.mp4)
        │
        ▼
Deepgram Aura TTS(reply) ──► audio
        │
        ▼
play <video loop> + audio together, show subtitles (full line on audio start)
        │
        ▼
on audio end ──► freeze to static first frame, re-enable mic
```

Keep replies to **1–2 sentences**: snappier demo, cheaper/faster TTS, tighter subtitles.

---

## Data contracts

**LLM output — strict JSON, nothing else (no prose, no markdown fences):**
```json
{ "reply": "Okay but those cans were already kind of warm, so honestly this is on the freezer.", "mood": "deflecting" }
```

**Mood tags (fixed set — one clip per mood):**
`defensive` · `dismissive` · `fake_apologetic` · `deflecting` · `escalating` · `gaslighting`
plus `idle_yap` as the always-present fallback clip.

**Roommate persona (system prompt) — defaults:**
- Defensive, a little delusional, never fully concedes. **Eternally unhinged**, no win-state
  tracking. This is less code and funnier for a 60-second demo. Only add a "you can win the
  argument" state machine later if there's time to spare (there won't be).
- Incorporates the user's `situation` text verbatim as the grievance.
- 1–2 sentences per reply. Casual, college-roommate register. Always emits a valid `mood`.

---

## Suggested file structure

```
fizz-buzz/
  public/
    clips/            # pre-rendered Pika loops (mood-named), the long-lead asset
      defensive.mp4  dismissive.mp4  fake_apologetic.mp4
      deflecting.mp4  escalating.mp4  gaslighting.mp4  idle_yap.mp4
    sfx/  knock.mp3  door-open.mp3  fizz.mp3
  src/
    App.jsx               # state machine root
    state/machine.js      # states + transitions (single source of truth)
    scenes/
      Landing.jsx         # exploding-soda hero + "Fizz Buzz" wordmark, scroll down
      Setup.jsx           # situation textarea + roommate image upload + submit
      Knocking.jsx        # door + knocking animation transition
      Confrontation.jsx   # roommate video loop + subtitles + mic/talk button
    lib/
      deepgram.js         # STT stream + TTS wrappers
      roommate.js         # LLM call + conversation history
      clips.js            # mood -> clip URL map (+ fallback)
    styles/tokens.css
  server/index.js         # /api/roommate, /api/deepgram-token
  .env.example
  README.md               # Devpost-facing: what/why/how-to-run
```

### State machine
States: `landing → setup → knocking → confrontation`.
`confrontation` has internal sub-states: `idle (your turn)` ↔ `listening (mic on)` ↔
`thinking (LLM)` ↔ `talking (clip+audio)`. Keep this in `state/machine.js` so all three of you
share one definition of truth.

---

## Design system (Coca-Cola parody — this is the signature, spend boldness here)

Earned by the brief: it's literally about exploded Coke. Parody the iconic identity — Spencerian
script wordmark, the specific red, the white "dynamic ribbon" curve, the contour-bottle
silhouette. Keep everything *else* quiet so the wordmark + exploding hero are the one memorable
thing.

**Tokens (`styles/tokens.css`):**
```css
:root{
  --coke-red:    #E3122B;   /* primary */
  --coke-red-dk: #B00E22;   /* shadows / pressed */
  --ribbon:      #FFFFFF;
  --cream:       #F7F3EC;   /* light scene bg */
  --ink:         #15100F;   /* confrontation scene bg / text on light */
  --foam:        #FBE9D0;   /* fizz highlight */
}
```
- **Wordmark / display:** a Spencerian-script web font as a Coke-logo stand-in (the real Coke
  font isn't free) — e.g. *Allura* or *Pacifico* from Google Fonts. Use ONLY for "Fizz Buzz".
- **Body/UI:** a clean sans — *Inter* or *Archivo*. A condensed weight for labels/buttons.
- **Signature element:** the landing hero — a soda can/bottle *exploding* with fizz particles,
  "Fizz Buzz" in script across a white ribbon curve. ~10 min of CSS for the ribbon + a particle
  burst on load. This is what judges remember; make it the one elaborate thing.
- The **confrontation scene** is the opposite mood: dark `--ink` background, doorway frame, the
  0.5-zoom meme roommate centered. The 0.5-zoom look is pure CSS: scale the head region up,
  squish the body, drop it in a doorway. No ML.

**Copy:** sentence case, plain verbs, active voice. The button that starts it says what happens
("Knock on the door", not "Submit"). Error/empty states give direction, not mood.

**Quality floor (don't announce it, just do it):** responsive to mobile, visible keyboard focus,
`prefers-reduced-motion` respected (kill the particle burst + shaking), graceful audio fallback.

---

## Build phases (19 hours, 3 people)

**Person A — frontend/animation:** state machine + all four scenes' visuals, the exploding hero,
door knock, 0.5-zoom CSS, subtitles, video-loop swapper.
**Person B — AI/video:** *first hour:* kick off Pika clip generation (longest lead time, API gets
congested late). Then: LLM persona + strict-JSON mood tagging + `roommate.js`.
**Person C — glue:** Deepgram STT/TTS wiring, image-upload flow, server proxy, deploy, README +
demo script, integration.

| Hours | Goal |
|------|------|
| 0–1  | Scaffold Vite+React+Express, `.env`, clickable state machine with 4 placeholder scenes. **B starts Pika clips now.** |
| 1–5  | Build each scene's visuals against placeholders (placeholder looping video in Confrontation). |
| 5–10 | One full runtime loop, real: **type → LLM → TTS → mood→clip → subtitles.** Then add mic STT. |
| 10–14| Persona tuning, mood→clip mapping with real clips, door/knock + exploding-fizz hero polish. |
| 14–17| Integration hardening, deploy, write demo script. |
| 17–19| Buffer for the inevitable break + **Devpost submission.** |

**Cut list, in order (drop from the bottom if behind):** win-state logic → word-level subtitle
timing → mic input (type instead) → premium TTS voice → door animation (fade instead) → any
persistence.

---

## Rules for the agent (high-signal — re-read before each phase)

1. **Pika never runs at runtime.** Clips are static assets. (Repeating because it's the one fatal mistake.)
2. **Audio carries meaning; video is b-roll.** No real lip-sync. Mouth/word mismatch is the joke.
3. **Replies stay 1–2 sentences.** Roommate is eternally unhinged; no win-state unless explicitly asked.
4. **No secret keys in the client.** Everything secret goes through `server/`.
5. **Fake smart over building real.** Any robustness the 60-second demo won't show is wasted time.
6. **Never hard-crash the demo.** STT fails → typing works. TTS fails → silent subtitles. Missing
   clip → `idle_yap.mp4`. LLM returns bad JSON → retry once, then a canned defensive line.
7. **Verify Deepgram/Pika API params against current docs** — do not trust memorized signatures.
8. **Hit the quality floor, then stop.** Mobile, focus rings, reduced motion. No further polish.

---

## Prize strategy (so design choices serve the rubric)

Judging criteria: **Application, Functionality/Quality, Creativity, Technical Complexity.**
- **Creativity / Functionality:** Fizz Buzz wins these on concept + a clean running demo.
- **Application (our weak axis):** lead the demo with the conflict-rehearsal sentence.
- **Technical Complexity:** the real-STT + LLM-persona + TTS + mood-routed-video pipeline is a
  legit multi-model system — say so out loud in the pitch.

Target prizes, in order of fit: **Most Questionable Use of 24 Hours** (this app *is* that prize —
put it in the Devpost tagline), **Hacker's Choice** (a room of students will love the demo),
**Best UI/UX** (the meme aesthetic is an *intentional* opinion — claim it), **Best Golden Bear
Hack** (lean on the true Berkeley-dorm-story framing).

---

## Submission checklist (from the Devpost page — do not miss)

- [ ] **Submit by 6/21 11:00 AM PDT** (editable until 12:00 PM, but the project must be in by 11).
- [ ] **GitHub repo** linked (required) and **a project image** (required).
- [ ] **Table number** in the submission so judges can find you.
- [ ] Team has 2–4 confirmed members, all listed.
- [ ] **All code written during the event** — no pre-existing code (disqualifier).

## Demo definition of done (the 60-second path that must work)
Land → exploding **Fizz Buzz** hero → scroll → type the real frozen-Coke story + upload roommate
photo → "Knock on the door" → knock animation → door opens to the 0.5-zoom yapper → he delivers a
defensive line with **voice + subtitles** over a yapping loop → you reply → he **escalates**.
If that path runs without crashing, we're done. Everything else is bonus.

---

## How to drive Claude Code with this file
1. Put this at repo root as `CLAUDE.md`.
2. First message: *"Read CLAUDE.md. Do Phase 0: scaffold Vite + React + Express, the `.env.example`,
   the `state/machine.js`, and four clickable placeholder scenes. Don't build features yet."*
3. Then go phase by phase. Keep each prompt scoped to one phase so the agent doesn't run ahead.
4. Tell it which person you are so it touches the right files and leaves the others' alone.
