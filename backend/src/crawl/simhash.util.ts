import { createHash } from 'node:crypto';

/**
 * 64-bit SimHash over word-shingles (feature 08, near-duplicate detection).
 *
 * SimHash maps similar token sets to bit-strings a small Hamming distance apart,
 * so near-duplicate bodies (boilerplate-heavy templates differing by a few words)
 * — which an exact content hash never catches — become a cheap set-based
 * Hamming-distance self-join in SQL (`dupe.near-content`).
 *
 * Pure + deterministic: the same normalized text always yields the same 64-char
 * bit string. Returns null for text with no shingles (empty / shorter than the
 * shingle window) so a body with no comparable content is excluded from the
 * self-join rather than colliding with every other empty body.
 */

/** Shingle size (token window). k=4 per the plan's near-dup recommendation. */
const SHINGLE_K = 4;

const BITS = 64;

/**
 * Stable 64-bit hash of one shingle, returned as a BigInt. Derived from the
 * first 8 bytes of a sha1 digest — deterministic and well-distributed; the
 * cryptographic strength is irrelevant here, only the spread of bits.
 */
function hash64(token: string): bigint {
  const digest = createHash('sha1').update(token, 'utf8').digest();
  let h = 0n;
  for (let i = 0; i < 8; i++) {
    h = (h << 8n) | BigInt(digest[i]!);
  }
  return h;
}

/**
 * Compute the 64-bit SimHash of `normalizedText` (already whitespace-collapsed,
 * lowercased — the same text {@link import('./extract.service').ExtractService}
 * feeds the content hash). Returns a 64-char '0'/'1' string (MSB first) so it
 * casts cleanly to Postgres `bit(64)` for the XOR/popcount Hamming self-join, or
 * null when there are fewer than one shingle's worth of tokens.
 */
export function computeSimhash(normalizedText: string): string | null {
  const tokens = normalizedText.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  // Build k-word shingles (fall back to single tokens for short bodies so a
  // 1–3 word page still produces a signature).
  const shingles: string[] = [];
  if (tokens.length < SHINGLE_K) {
    shingles.push(tokens.join(' '));
  } else {
    for (let i = 0; i + SHINGLE_K <= tokens.length; i++) {
      shingles.push(tokens.slice(i, i + SHINGLE_K).join(' '));
    }
  }
  if (shingles.length === 0) return null;

  // Per-bit accumulator: +1 when the shingle's hash has the bit set, -1 otherwise.
  const acc = new Array<number>(BITS).fill(0);
  for (const shingle of shingles) {
    const h = hash64(shingle);
    for (let b = 0; b < BITS; b++) {
      const bitSet = (h >> BigInt(BITS - 1 - b)) & 1n;
      acc[b]! += bitSet === 1n ? 1 : -1;
    }
  }

  // Collapse to a bit string: positive accumulator → '1', else '0'.
  let out = '';
  for (let b = 0; b < BITS; b++) {
    out += acc[b]! > 0 ? '1' : '0';
  }
  return out;
}
