import { z } from 'zod';
import { ConfigError } from '../common/errors';

/**
 * Coerce a string env var into a positive integer, with a default. Empty/unset
 * falls back to the default; non-numeric values fail validation.
 */
const intWithDefault = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? String(def) : v))
    .pipe(z.coerce.number().int().positive());

const floatWithDefault = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? String(def) : v))
    .pipe(z.coerce.number().positive());

/**
 * Authoritative env schema. Mirrors the Configuration Reference (§10 of the
 * implementation plan). Vars unused until later phases are still defined now so
 * the contract is stable.
 */
export const envSchema = z.object({
  // Required. Reachability is checked separately at boot (see ConfigModule).
  DATABASE_URL: z
    .string({ required_error: 'DATABASE_URL is required' })
    .min(1, 'DATABASE_URL must not be empty')
    .url('DATABASE_URL must be a valid connection URL (e.g. postgres://user:pass@host:5432/db)'),

  DB_POOL_SIZE: intWithDefault(10),

  // Optional in Phase 0; required for Phase 4 (PageSpeed Insights).
  PSI_API_KEY: z.string().optional().default(''),

  // Crawl limits (Phase 1+).
  CRAWL_MAX_PAGES: intWithDefault(500),
  CRAWL_CONCURRENCY: intWithDefault(5),
  CRAWL_RATE_LIMIT: floatWithDefault(5),

  // PSI sampling cap (Phase 4).
  PSI_MAX_SAMPLES: intWithDefault(20),

  // Report output directory (Phase 5).
  OUTPUT_DIR: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? './output' : v)),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validate a raw env record (defaults to process.env). Throws a ConfigError
 * with an aggregated, human-readable message on failure. No side effects.
 */
export function validateEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new ConfigError(`Invalid environment configuration:\n${details}`);
  }
  return result.data;
}
