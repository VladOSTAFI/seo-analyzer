import { computeSimhash } from './simhash.util';

/** Hamming distance between two 64-char bit strings. */
function hamming(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

describe('computeSimhash', () => {
  it('returns null for empty text', () => {
    expect(computeSimhash('')).toBeNull();
    expect(computeSimhash('   ')).toBeNull();
  });

  it('produces a deterministic 64-bit signature', () => {
    const text = 'the quick brown fox jumps over the lazy dog every single morning';
    const a = computeSimhash(text);
    const b = computeSimhash(text);
    expect(a).toMatch(/^[01]{64}$/);
    expect(a).toBe(b);
  });

  it('near-identical bodies (boilerplate + a tiny edit) are a small Hamming distance apart', () => {
    // Realistic near-duplicate: a long boilerplate body differing by one word.
    const base =
      Array(25)
        .fill('our company provides excellent widgets and reliable service to every customer')
        .join(' ') + ' located in the central region downtown';
    const near = base.replace('downtown', 'uptown');
    const a = computeSimhash(base)!;
    const b = computeSimhash(near)!;
    expect(hamming(a, b)).toBeLessThanOrEqual(3);
  });

  it('unrelated bodies are a large Hamming distance apart', () => {
    const a = computeSimhash(
      'welcome to our store we sell the finest widgets gadgets and gizmos in the region',
    )!;
    const b = computeSimhash(
      'completely different prose about astronomy galaxies nebulae and distant quasars tonight',
    )!;
    expect(hamming(a, b)).toBeGreaterThan(3);
  });

  it('handles short (sub-shingle) bodies by falling back to a single shingle', () => {
    expect(computeSimhash('one two')).toMatch(/^[01]{64}$/);
  });
});
