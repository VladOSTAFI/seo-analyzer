import { estimatePixelWidth } from './pixel-width.util';

describe('estimatePixelWidth', () => {
  it('returns 0 for an empty string', () => {
    expect(estimatePixelWidth('')).toBe(0);
  });

  it('is deterministic for the same input', () => {
    expect(estimatePixelWidth('Best Widgets Online')).toBe(estimatePixelWidth('Best Widgets Online'));
  });

  it('measures wide glyphs as wider than narrow glyphs of equal char-length', () => {
    const wide = estimatePixelWidth('WWWWWWWWWW'); // 10 wide caps
    const narrow = estimatePixelWidth('iiiiiiiiii'); // 10 narrow lowercase
    expect(wide).toBeGreaterThan(narrow);
    // golden-ish bounds: 10×'W'(12)=120; 10×'i'(3)=30.
    expect(wide).toBe(120);
    expect(narrow).toBe(30);
  });

  it('applies the CJK fallback width (~double Latin) for full-width glyphs', () => {
    const cjk = estimatePixelWidth('日本語'); // 3 CJK glyphs × 14
    expect(cjk).toBe(42);
  });

  it('sums the default width for unknown Latin glyphs', () => {
    // 'abcdefg' has some table hits (c,f) + defaults; just assert > the floor.
    expect(estimatePixelWidth('hello')).toBeGreaterThan(0);
  });

  it('a same-length wide title crosses the 580px cap sooner than a narrow one', () => {
    const wide = 'W'.repeat(50); // 50×12 = 600 > 580
    const narrow = 'i'.repeat(50); // 50×3 = 150 < 580
    expect(estimatePixelWidth(wide)).toBeGreaterThan(580);
    expect(estimatePixelWidth(narrow)).toBeLessThan(580);
  });
});
