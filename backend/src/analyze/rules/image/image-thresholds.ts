/**
 * Image-rule tuning thresholds (feature 09). Read directly from the environment
 * at module-load with safe defaults — the same idiom the extractor and the other
 * env-driven rules use — so the image rules stay pure functions of the DB + a
 * couple of static knobs and do not depend on the validated `Env` type carrying
 * these vars yet. Positive int only; empty/unset/non-int falls back to the default.
 */
function readIntEnv(name: string, def: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : def;
}

/** `image.oversized` threshold — bytes at/above which an image is "oversized". */
export const IMAGE_MAX_BYTES = readIntEnv('IMAGE_MAX_BYTES', 200_000);
/** `image.legacy-format` byte floor — tiny legacy icons below this are not flagged. */
export const IMAGE_LEGACY_MIN_BYTES = readIntEnv('IMAGE_LEGACY_MIN_BYTES', 50_000);
/** `image.responsive` width floor — only large non-responsive images are flagged. */
export const IMAGE_RESPONSIVE_MIN_WIDTH = readIntEnv('IMAGE_RESPONSIVE_MIN_WIDTH', 640);
/** `image.alt-quality` over-long alt threshold (characters). */
export const IMAGE_ALT_MAX_LEN = readIntEnv('IMAGE_ALT_MAX_LEN', 125);
/** `image.alt-quality` comma-list keyword-stuffing threshold. */
export const IMAGE_ALT_MAX_COMMAS = readIntEnv('IMAGE_ALT_MAX_COMMAS', 4);
