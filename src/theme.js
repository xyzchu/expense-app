export const MONO = '"DM Sans", sans-serif';

// ── Font scale ────────────────────────────────────────────────────
// Change these values here and they apply everywhere across all pages.
//   lg      (16px) — standard for all body text, buttons, inputs, chips, amounts.
//                    16px is also the iOS minimum to prevent keyboard auto-zoom.
//   compact (13px) — secondary/dense contexts: bottom nav labels, tight table sub-text.
//   heading (24px) — page headings (used via SHELL_HEADING_STYLE).
export const FS = { lg: 16, compact: 13, heading: 24 };

// ── Font weights (2 only) ─────────────────────────────────────────
export const FW = { normal: 400, semibold: 600, black: 900 };

// ── Clay design tokens ────────────────────────────────────────────
export const CLAY = {
  bg:       '#F5F5F5',
  surface:  '#FFFFFF',
  surf2:    '#F3F4F6',
  shadow:   '0 4px 20px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)',
  shadowSm: '0 2px 10px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.04)',
  inset:    'inset 0 1px 4px rgba(0,0,0,0.06)',
  btn:      '0 2px 8px rgba(0,0,0,0.08)',
  peach:    '#F4C4A8', peachDk:  '#D9845A',
  blue:     '#A8C8DC', blueDk:   '#4A8EA8',
  sage:     '#B4D4B8', sageDk:   '#4A8A54',
  sand:     '#E8D8C0', sandDk:   '#A0845C',
  lilac:    '#C8B8DC', lilacDk:  '#7A5AA8',
  text:     '#2C2420',
  textMid:  '#7C6E68',
  textLt:   '#B0A09A',
  green:    '#16a34a',
  red:      '#dc2626',
};
