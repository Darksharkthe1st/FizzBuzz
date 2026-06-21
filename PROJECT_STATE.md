# FizzBuzz — Project State Brief

> Paste this into a new Claude Code session and say "read this and let's continue."

---

## What It Is

**FizzBuzz: Roommate Boss Battle** — A comedy web app where you practice confronting your roommate before doing it for real. You describe the incident (e.g. exploding Coke in the freezer), upload their photo, knock on an animated door, then go round-for-round against an AI-powered roommate that deflects, gaslights, and never admits fault.

Tone: boss-battle RPG parody. Visual language: thick-bordered comic pop-art on a yellow grid. The roommate is the villain. You are the Lease-Holding Prosecutor.

---

## Stack

| Layer | Tech |
|---|---|
| Server | Node 24 + Express (ESM, `"type":"module"`) |
| Frontend | Vanilla JS + Vite (root = `client/`) |
| Voice in | Deepgram STT (WebSocket) → browser SpeechRecognition fallback |
| Voice out | Deepgram TTS (`aura-2-thalia-en`) → browser speechSynthesis fallback |
| LLM | Gemini (`gemini-3.5-flash` text, `gemini-3.1-flash-image` image edit) |
| Video | Pika REST API (image → 7 mood loops) |
| Dev server | Single process: Express serves Vite as middleware (`vite.middlewareMode`) |

---

## How To Run

```bash
# requires Node 20+ (project uses v24.17.0 via nvm)
npm install
npm run dev
# → http://127.0.0.1:5175
```

Other scripts: `npm run build` (Vite prod build to `dist/client/`), `npm run check` (syntax check).

---

## Environment Variables (`.env`)

```ini
PORT=5175
HOST=127.0.0.1

GEMINI_API_KEY=<key>          # used for LLM responses + image forehead edit
DEEPGRAM_API_KEY=<key>        # used for STT + TTS
PIKA_API_KEY=                 # MISSING — needs Pika REST API key from api.pika.art

USE_OPENAI=false
USE_GEMINI_IMAGE=true         # forehead portrait edit — working
USE_DEEPGRAM=true             # STT + TTS — working
USE_PIKA=true                 # video gen — wired but no key yet

# Optional model overrides
GEMINI_TEXT_MODEL=gemini-3.5-flash
GEMINI_IMAGE_MODEL=gemini-3.1-flash-image
DEEPGRAM_TTS_MODEL=aura-2-thalia-en
```

---

## File Structure

```
FizzBuzz/
├── server/
│   └── index.js          ← Express API + all backend logic
├── client/
│   ├── index.html        ← Single page, two sections: prep-screen + battle-screen
│   └── src/
│       ├── main.js       ← All client JS (state, voice, video, battle loop)
│       └── styles.css    ← Full CSS (pop-art boss battle + fridge/door/avatar)
├── public/
│   ├── clips/            ← (empty) pre-generated video clips could go here
│   └── sfx/              ← (empty) sound effects could go here
├── .env                  ← keys (gitignored)
├── .mcp.json             ← Pika MCP server config (https://mcp.pika.me/api/mcp)
├── .agents/skills/       ← 14 Pika skills installed via npx skills add Pika-Labs/Pika-Plugins
├── vite.config.js        ← root: "client", outDir: "../dist/client"
└── package.json          ← dev = node server/index.js (Vite runs as middleware)
```

---

## Server API Routes

| Method | Path | What it does |
|---|---|---|
| GET | `/api/health` | Integration status check |
| POST | `/api/session` | Creates session; returns opener line, titles, health |
| POST | `/api/argue` | Advances argument round; returns `roommateLine`, `mood`, `attack`, health |
| POST | `/api/voice/token` | Returns short-lived Deepgram token + WebSocket URL |
| POST | `/api/voice/speak` | Proxies Deepgram TTS; returns audio/mpeg stream |
| POST | `/api/media/forehead` | Gemini image edit → comically wide forehead portrait |
| POST | `/api/videos/generate` | Uploads photo to Pika, queues 7 mood videos in parallel |
| GET | `/api/videos/status/:batchId` | Returns `{ done, readyCount, total, clips: { mood: url } }` |

---

## Client Flow (main.js)

```
prep-screen
  └─ upload photo → readFileAsDataUrl → state.photoDataUrl
  └─ forehead button → POST /api/media/forehead (optional)
  └─ submit → POST /api/session
             → POST /api/videos/generate  ← starts Pika batch
             → showScreen("battle")

battle-screen
  door button → knock animation → "is-open" class → speakButton enabled
               → playMoodVideo("idle_yap")  ← swaps to Pika video if ready

  speakButton ("Argue live") → startVoiceArgument()
    → POST /api/voice/token
    → Deepgram WebSocket OR browser SpeechRecognition
    → on speech_final → resolveLiveArgument(transcript)
      → advanceBattle(transcript)
        → POST /api/argue
        → playMoodVideo(next.mood)  ← swap video loop
        → speakRoommateLine()       → POST /api/voice/speak

  video polling → fetch /api/videos/status/:batchId every 5s
                → bossPhotoWrap.classList.add("has-video") when first URL arrives
                → img hidden, <video> shown with looping clip
```

---

## Pika Video Integration (current state)

**What's wired:**
- `POST /api/videos/generate` uploads the photo (base64→Buffer→multipart) to `https://api.pika.art/v2/upload`, then fires `POST /api/pika.art/v2/generate` for each of 7 moods in parallel.
- Server polls Pika every 6s in background (max 80 polls / ~8 min).
- Client polls `/api/videos/status` every 5s; swaps `<img>` for `<video autoplay loop muted>` as clips arrive.
- Each argue response now returns a `mood` field; client calls `playMoodVideo(mood)`.

**What's missing:**
- `PIKA_API_KEY` in `.env` — get from `https://api.pika.art` (or pika.art dashboard).
- The Pika REST API endpoints (`/v2/upload`, `/v2/generate`, `/v2/generate/:id`) are best-effort based on Pika's public API pattern. May need verification/adjustment once a key is available.

**7 moods generated:**
`idle_yap`, `defensive`, `dismissive`, `escalating`, `deflecting`, `gaslighting`, `fake_apologetic`

Each: 4s, 9:16, 24fps, starting frame = uploaded photo, prompt describes the emotion/body language.

**Pika MCP is also configured** (`.mcp.json` → `https://mcp.pika.me/api/mcp`). 14 Pika skills installed to `.agents/skills/`. These are Claude Code agent tools, not server-side. The MCP OAuth token ≠ the REST API key.

---

## CSS Design Language

- **Font**: Impact / Arial Narrow Bold (system stack) — thick uppercase everything
- **Colors**: `--ink #17120d`, `--paper #fff3cf`, `--mustard #f4c430`, `--tomato #e33d2f`, `--teal #15a3a6`, `--pickle #5c8f2d`, `--purple #6535b7`, `--blue #1855b4`, `--cream #fff8e7`
- **Motif**: thick borders (`4-8px solid var(--ink)`), bold box-shadows (`7px 7px 0 var(--ink)`), transforms (`rotate(-1.2deg)`, `skewX(-4deg)`), `steps(2)` animations for comic-book feel
- **Layout**: CSS grid, `min-height: 100vh`, no frameworks

Key visual elements:
- `.fridge` (rotated, `overflow: hidden`) with `.cola-blast` animation and `.photo-evidence` label — prep screen
- `.door` (`transform-origin: left center`, CSS knock + open animations) — battle screen
- `.roommate-avatar-wrap` (`clip-path: polygon(...)`, `skewX`) with `<video>` overlaying `<img>` — avatar
- `.rage-aura` (spinning `conic-gradient`) behind avatar
- `.fallback-face` (CSS face) shown when no photo uploaded

---

## Known Issues / Bugs Fixed This Session

- **Photo upload not clickable**: `<label for="roommatePhoto">` wrapping `<input id="roommatePhoto">` caused double-fire → file picker opened and immediately closed. Fixed: removed `for` attribute (input is already inside the label).
- **Cola-blast blocking clicks**: `.cola-blast` animated element intercepted pointer events over the photo label. Fixed: `pointer-events: none` on `.cola-blast`.
- **Photo evidence z-index**: Added `z-index: 2` to `.photo-evidence` so it paints above animated siblings.

---

## What's Working End-to-End

- Full prep → battle → resolution game loop (no API keys needed; mock fallback on everything)
- Gemini LLM responses for the roommate (returns `attackName`, `attackLine`, `roommateLine`, `mood` as JSON)
- Deepgram STT via WebSocket (nova-3, smart_format, interim results)
- Deepgram TTS (aura-2-thalia-en) with browser speechSynthesis fallback
- Gemini image edit for "forehead mode" portrait
- Pika video generation code (needs API key to actually fire)
- Mood-driven video swapping during conversation

---

## What Needs Doing

1. **Pika API key** — add to `.env`, verify REST endpoints work, adjust if needed
2. **Victory/resolution screen** — game ends when boss HP hits 0 but there's no celebratory screen
3. **Demo scenario prefill** — "Try the Coke incident" button that pre-populates the textarea
4. **Mobile layout** — untested below 860px, some elements need `min-height` tuning
5. **Pika video polish** — once key is in, test that the 9:16 ratio looks right in the avatar wrap; may want `1:1` instead
6. **Error state UI** — Pika failures are console-logged but not surfaced to user
7. **README update** — needs current API list, mock-mode documentation, demo script

---

## Demo Script (60 seconds)

1. Open `http://127.0.0.1:5175`
2. Click the fridge label → upload a photo of someone
3. Textarea: *"You put 12 Coke cans in the freezer. They exploded at 2am and I cleaned it alone."*
4. Hit **"Knock with confidence"** → battle screen loads + Pika starts generating in background
5. Click **Knock** on the door → door swings open, roommate appears, opener line plays via TTS
6. Click **"Argue live"** → speak your accusation → Deepgram transcribes → roommate deflects (Gemini)
7. Repeat 2-3 rounds → boss HP drains → roommate capitulates
8. Point to: Deepgram mic indicator, Gemini-powered responses, Pika video loops (if key is in)

---

## Session Context (what happened in prior Claude Code sessions)

- Built the entire UI from a spec in `Downloads/CLAUDE.md`
- Rewrote door animation to stay in-page (no scene transition)
- Fixed photo upload double-click bug (label `for` + wrapping = double fire)
- Fixed cola-blast pointer-events blocking photo label
- Added voice input (Deepgram STT + browser fallback)
- Added TTS output (Deepgram + browser speechSynthesis fallback)
- Added Gemini LLM responses with mood tagging
- Added Pika video generation pipeline (7 moods, parallel, background polling)
- Installed 14 Pika skills + configured Pika MCP server
