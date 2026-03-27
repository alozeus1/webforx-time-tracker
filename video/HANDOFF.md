# Web Forx Time Tracker — Demo Video Handoff
Last updated: 2026-03-27

## Project location
`time-tracker/video/` — standalone Remotion 4 project, fully scaffolded.

---

## Current status: COMPLETE AND READY TO RUN

### What is built
A fully animated 76-second product demo video (1920×1080, 30fps) with:
- 9 scenes with fade transitions
- Animated mock UI screens for every app route
- Per-scene lower-third captions
- Callout rings on key UI elements
- ElevenLabs voiceover generation script
- Background music layer (looping, faded)

### 9 Scenes
| # | Scene | Duration | File |
|---|-------|----------|------|
| 1 | Problem hook — scattered time, weak visibility | 8s | Scene01Hook |
| 2 | Product reveal — Web Forx Time Tracker | 7s | Scene02Solution |
| 3 | Login → Dashboard (with live timer counter) | 10s | Scene03Dashboard |
| 4 | Live Timer — project select, task type, start | 10s | Scene04Timer |
| 5 | Timeline (day blocks) → Weekly Timesheet | 9s | Scene05Timeline |
| 6 | Reports — bar chart, filters, Export callout | 10s | Scene06Reports |
| 7 | Team table → Admin panel (users/projects/audit) | 9s | Scene07TeamAdmin |
| 8 | Integrations — Google Calendar, Taiga, Mattermost | 8s | Scene08Integrations |
| 9 | Value pillars — CTA + URL | 9s | Scene09CTA |

---

## Immediate next steps

### Step 1 — Generate voiceovers
```bash
cd time-tracker/video
npm run voiceover
# reads ELEVENLABS_API_KEY from .env automatically
# writes public/voiceover/scene-01.mp3 … scene-09.mp3
```
ElevenLabs key is already stored in `video/.env` (gitignored).
Voice used: **Daniel** (`onwK4e9ZLuTAKqWW03F9`) — enterprise/authoritative.

### Step 2 — Add background music
Drop any royalty-free ambient MP3 at:
```
video/public/music/background.mp3
```
Recommended: Pixabay → search "inspiring corporate ambient" (free, no attribution).
Volume is pre-set at 12% with 2s fade-in / 3s fade-out.

### Step 3 — Preview
```bash
npm start
# Opens Remotion Studio at localhost:3000
# Full audio (VO + music) + visuals play together
```

### Step 4 — Render final MP4
```bash
npm run render        # standard quality → out/demo-video.mp4
npm run render:hq     # high quality CRF 16 → out/demo-video-hq.mp4
```

---

## Known issue fixed (in this session)
`generate-voiceover.ts` had top-level `await` which broke under tsx CJS mode.
Fixed by: wrapping execution in `(async () => { ... })()` and replacing
`import.meta.dirname` with `process.cwd()`.

---

## File structure
```
video/
├── .env                        ← ElevenLabs key (gitignored)
├── .gitignore
├── .env.example
├── generate-voiceover.ts       ← Run: npm run voiceover
├── package.json
├── tsconfig.json
├── remotion.config.ts
├── public/
│   ├── voiceover/              ← MP3s go here after generation
│   └── music/                  ← Drop background.mp3 here
└── src/
    ├── index.ts
    ├── Root.tsx                ← 1920×1080, 30fps, 2280 frames
    ├── DemoVideo.tsx           ← TransitionSeries + all Audio wiring
    ├── constants.ts            ← Colors, timing, SCENE_STARTS[], PROJECTS[]
    ├── components/
    │   ├── GradientBg.tsx
    │   ├── LowerThird.tsx
    │   └── CalloutRing.tsx
    └── scenes/
        ├── Scene01Hook.tsx … Scene09CTA.tsx
```

---

## Optional future work
- Replace mock UI screens with real screen recordings (drop `.mp4` into `public/` and use `<Video>` in each scene)
- Add `calculateMetadata` to dynamically size scene durations to match actual VO audio length
- Add a Mattermost integration card to Scene08 (placeholder card already shows "Configure")
- Export a thumbnail still: `npm run still`

---

## TypeScript status
`npx tsc --noEmit` passes with zero errors as of 2026-03-27.
