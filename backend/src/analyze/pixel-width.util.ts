/**
 * Estimated SERP pixel-width of a string (feature 08).
 *
 * SERP truncation is *pixel*-based (~580px title, ~920px description on desktop),
 * not character-based, so the meta-template rules misfire on wide glyphs
 * ("WWW Mortgage Marketing") or narrow ones ("illillill"). This module provides a
 * pure, table-driven advance-width estimate that is far closer to what Google
 * actually truncates than `char_length`.
 *
 * The table is an APPROXIMATION (an avg advance-width per glyph at the SERP font
 * normalized so the average Latin lowercase letter is ~7px), NOT Google's exact
 * renderer — which is why the rules that consume it stay `info` severity. It is
 * the single source of truth and is trivially refinable later.
 *
 * Pure + deterministic: same input always yields the same width. Never throws.
 */

/**
 * Per-glyph advance widths (px), normalized to roughly the Arial/Roboto metrics
 * Google uses for desktop SERP titles. Only glyphs that deviate meaningfully
 * from the {@link DEFAULT_WIDTH} are listed; everything else (and any unknown
 * Latin glyph) falls back to the default.
 */
const GLYPH_WIDTH: Record<string, number> = {
  // very narrow
  i: 3,
  j: 3,
  l: 3,
  I: 4,
  '.': 3,
  ',': 3,
  ':': 3,
  ';': 3,
  "'": 3,
  '`': 3,
  '|': 3,
  '!': 4,
  ' ': 3.5,
  f: 4,
  t: 4,
  r: 4.5,
  '(': 4,
  ')': 4,
  '[': 4,
  ']': 4,
  '{': 4,
  '}': 4,
  '/': 4,
  '\\': 4,
  // narrow
  '"': 5,
  '-': 5,
  J: 5,
  // narrowish lowercase
  s: 6,
  c: 6,
  z: 6,
  k: 6,
  v: 6,
  x: 6,
  y: 6,
  // wide lowercase
  m: 11,
  w: 10,
  // wide uppercase
  M: 11,
  W: 12,
  // moderate uppercase (slightly wider than lowercase default)
  A: 9,
  B: 8.5,
  C: 9,
  D: 9,
  E: 8,
  F: 7.5,
  G: 9.5,
  H: 9,
  K: 8.5,
  L: 7,
  N: 9,
  O: 9.5,
  P: 8,
  Q: 9.5,
  R: 8.5,
  S: 8,
  T: 8,
  U: 9,
  V: 8.5,
  X: 8.5,
  Y: 8,
  Z: 8,
};

/** Fallback advance width for an unknown narrow/Latin glyph (avg lowercase). */
const DEFAULT_WIDTH = 7;

/**
 * Fallback advance width for a CJK / full-width glyph (Hangul, Han, Kana,
 * full-width forms) — roughly double a Latin glyph at the same point size.
 */
const CJK_WIDTH = 14;

/** True for code points in the common CJK / full-width / Kana ranges. */
function isWideCodePoint(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) || // Hangul Jamo
    (cp >= 0x2e80 && cp <= 0x303e) || // CJK Radicals .. Kangxi
    (cp >= 0x3041 && cp <= 0x33ff) || // Hiragana .. CJK symbols
    (cp >= 0x3400 && cp <= 0x4dbf) || // CJK Ext A
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK Unified
    (cp >= 0xa000 && cp <= 0xa4cf) || // Yi
    (cp >= 0xac00 && cp <= 0xd7a3) || // Hangul Syllables
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK Compatibility
    (cp >= 0xfe30 && cp <= 0xfe4f) || // CJK Compatibility Forms
    (cp >= 0xff00 && cp <= 0xff60) || // Full-width forms
    (cp >= 0xffe0 && cp <= 0xffe6) // Full-width signs
  );
}

/**
 * Estimate the rendered pixel width of a string at the SERP font. Sums the
 * per-glyph advance widths (table → default → CJK fallback) and rounds to an
 * integer. Iterates by code point so astral / CJK characters are measured once.
 * Returns 0 for an empty string. Never throws.
 */
export function estimatePixelWidth(s: string): number {
  if (!s) return 0;
  let total = 0;
  for (const ch of s) {
    const known = GLYPH_WIDTH[ch];
    if (known !== undefined) {
      total += known;
      continue;
    }
    const cp = ch.codePointAt(0) ?? 0;
    total += isWideCodePoint(cp) ? CJK_WIDTH : DEFAULT_WIDTH;
  }
  return Math.round(total);
}
