/**
 * generate-voiceover.ts
 * Generates per-scene MP3 voiceovers using ElevenLabs TTS.
 *
 * Usage:
 *   ELEVENLABS_API_KEY=sk_xxx npx tsx generate-voiceover.ts
 *
 * Outputs: public/voiceover/scene-01.mp3 … scene-09.mp3
 *
 * Recommended voices (calm, professional):
 *   Adam    — pNInz6obpgDQGcFmaJgB  (male, authoritative)
 *   Rachel  — 21m00Tcm4TlvDq8ikWAM  (female, clear)
 *   Daniel  — onwK4e9ZLuTAKqWW03F9  (male, deep, enterprise-ready)
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const API_KEY  = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? "onwK4e9ZLuTAKqWW03F9"; // Daniel
const MODEL_ID = "eleven_multilingual_v2";

if (!API_KEY) {
  console.error("ERROR: ELEVENLABS_API_KEY is not set.");
  console.error("  Export it first:  export ELEVENLABS_API_KEY=sk_your_key_here");
  process.exit(1);
}

const VOICE_SETTINGS = {
  stability:       0.60,
  similarity_boost: 0.80,
  style:           0.20,   // subtle expressiveness — keeps it professional
  use_speaker_boost: true,
};

// ─── Per-scene voiceover scripts ──────────────────────────────────────────────
const SCENES = [
  {
    id: "scene-01",
    text: "Most teams track time in scattered tools — or not at all. Work goes unrecorded. Projects drift. Reporting guesswork replaces real data.",
  },
  {
    id: "scene-02",
    text: "Web Forx Time Tracker gives your organization a single, secure platform for tracking every hour — across every project, every team, every role.",
  },
  {
    id: "scene-03",
    text: "Employees log in securely and immediately see their active timer, today's logged hours, and recent task history — all in one clean dashboard.",
  },
  {
    id: "scene-04",
    text: "Select a project, enter a task description, and start the timer. Work is captured in real time and persisted server-side — even across device refreshes.",
  },
  {
    id: "scene-05",
    text: "The Timeline shows each day as a block-by-block record of what was worked and when. The Weekly Timesheet aggregates hours by day and project — ready for review or approval.",
  },
  {
    id: "scene-06",
    text: "Managers see the full picture — project allocations, employee activity, and productivity trends — with exports in CSV or PDF, available on demand.",
  },
  {
    id: "scene-07",
    text: "Team leads monitor workload and utilization in real time. Admins manage users, configure projects, and review full audit logs — all from one control panel.",
  },
  {
    id: "scene-08",
    text: "Web Forx Time Tracker connects to Google Calendar and Taiga — linking your time data to your project tasks and schedule, without double entry.",
  },
  {
    id: "scene-09",
    text: "Built for agencies, engineering teams, and operations-driven organizations. Better accountability. Cleaner reporting. Complete visibility. Sign in today at timer dot dev dot webforxtech dot com.",
  },
] as const;

// ─── Generate ─────────────────────────────────────────────────────────────────
const OUTPUT_DIR = join(process.cwd(), "public", "voiceover");
mkdirSync(OUTPUT_DIR, { recursive: true });

async function generateScene(id: string, text: string): Promise<void> {
  console.log(`  Generating ${id}…`);

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
    {
      method: "POST",
      headers: {
        "xi-api-key":   API_KEY!,
        "Content-Type": "application/json",
        Accept:         "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        voice_settings: VOICE_SETTINGS,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs ${res.status} for ${id}: ${err}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const outPath = join(OUTPUT_DIR, `${id}.mp3`);
  writeFileSync(outPath, buffer);
  console.log(`  ✓ ${outPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
}

console.log(`\nWeb Forx Time Tracker — Voiceover Generator`);
console.log(`Voice: ${VOICE_ID}  Model: ${MODEL_ID}`);
console.log(`Output: ${OUTPUT_DIR}\n`);

(async () => {
  for (const scene of SCENES) {
    await generateScene(scene.id, scene.text);
    // Brief pause to respect ElevenLabs rate limits
    await new Promise((r) => setTimeout(r, 400));
  }
  console.log("\n✅ All voiceovers generated. Run `npm start` to preview in Remotion Studio.");
})();
