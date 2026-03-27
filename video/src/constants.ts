export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

// ─── Scene durations (frames) ────────────────────────────────────────────────
export const SCENE = {
  HOOK: 8 * FPS,          // 240  — problem hook
  SOLUTION: 7 * FPS,      // 210  — product reveal
  DASHBOARD: 10 * FPS,    // 300  — login + dashboard
  TIMER: 10 * FPS,        // 300  — live timer workflow
  TIMELINE: 9 * FPS,      // 270  — timeline + timesheet
  REPORTS: 10 * FPS,      // 300  — reports + export
  TEAM_ADMIN: 9 * FPS,    // 270  — team + admin panel
  INTEGRATIONS: 8 * FPS,  // 240  — integrations hub
  CTA: 9 * FPS,           // 270  — value close + CTA
} as const;

// 8 cross-fade transitions × 15 frames each = 120 frames removed
// Net total = 2400 - 120 = 2280 frames = 76 seconds
export const TRANSITION_FRAMES = 15;
export const TOTAL_FRAMES = 2280;

// ─── Absolute scene start frames in the final video ───────────────────────────
// Used to place voiceover Audio at the correct global position.
const T = TRANSITION_FRAMES;
const _order = [240, 210, 300, 300, 270, 300, 270, 240, 270] as const; // matches SCENE values
export const SCENE_STARTS: number[] = _order.reduce<number[]>((acc, dur, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1] + _order[i - 1] - T);
  return acc;
}, []);
// Result: [0, 225, 420, 705, 990, 1245, 1530, 1785, 2010]

// Delay (frames) before VO starts within each scene — clears the fade transition
export const VO_DELAY = Math.round(0.5 * FPS); // 15 frames = 0.5s

// ─── Brand palette ────────────────────────────────────────────────────────────
export const C = {
  // Backgrounds
  bg:          '#070C1A',
  bgCard:      '#0C1426',
  bgCardAlt:   '#101B33',
  bgOverlay:   'rgba(7,12,26,0.85)',

  // Accent — enterprise blue
  accent:      '#2563EB',
  accentLt:    '#3B82F6',
  accentGlow:  'rgba(37,99,235,0.18)',
  accentBorder:'rgba(59,130,246,0.35)',

  // Purple secondary
  purple:      '#7C3AED',
  purpleLt:    '#8B5CF6',

  // Borders
  border:      '#1B2B48',
  borderLt:    '#223358',

  // Text
  text:        '#F1F5F9',
  textSub:     '#94A3B8',
  textMuted:   '#475569',

  // Status
  success:     '#10B981',
  successLt:   '#34D399',
  successBg:   'rgba(16,185,129,0.15)',
  warning:     '#F59E0B',
  danger:      '#EF4444',

  // Project tag colours
  proj: ['#3B82F6','#8B5CF6','#10B981','#F59E0B','#EC4899','#06B6D4','#F97316'],
} as const;

// ─── Typography ───────────────────────────────────────────────────────────────
export const FONT      = "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif";
export const FONT_MONO = "'JetBrains Mono', 'Fira Code', 'Courier New', monospace";

// ─── Seeded project names (from actual app) ───────────────────────────────────
export const PROJECTS = [
  'Platform Engineering',
  'EDUSUC',
  'Yemba',
  'LAFABAH',
  'Webforx Website',
  'BA',
  'Web Forx Technology',
] as const;

// ─── Short cut (6 scenes: Hook, Solution, Dashboard, Timer, Reports, CTA) ─────
const _shortOrder = [240, 210, 300, 300, 300, 270] as const;
export const SCENE_STARTS_SHORT: number[] = _shortOrder.reduce<number[]>((acc, dur, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1] + _shortOrder[i - 1] - TRANSITION_FRAMES);
  return acc;
}, []);
// 5 transitions: 240+210+300+300+300+270 - 5*15 = 1620 - 75 = 1545 frames = 51.5s
export const TOTAL_FRAMES_SHORT = 1545;

// ─── Demo team members ────────────────────────────────────────────────────────
export const TEAM = [
  { name: 'Alex Chen',       role: 'Admin',    hours: '41h 20m', status: 'Active'  },
  { name: 'Sarah Osei',      role: 'Manager',  hours: '38h 05m', status: 'Active'  },
  { name: 'Marcus Adeyemi',  role: 'Engineer', hours: '43h 15m', status: 'Active'  },
  { name: 'Priya Nair',      role: 'Engineer', hours: '37h 50m', status: 'Active'  },
  { name: 'Luca Ferreira',   role: 'Engineer', hours: '40h 30m', status: 'On Leave'},
] as const;
