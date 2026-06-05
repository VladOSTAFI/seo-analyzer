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

/** Coerce a string env var into a non-empty string, with a default. */
const strWithDefault = (def: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : v));

/**
 * Coerce a string env var into a boolean, with a default. Accepts the usual
 * truthy/falsy spellings case-insensitively (`true/1/yes/on` ⇒ true,
 * `false/0/no/off` ⇒ false); empty/unset falls back to the default. Anything
 * else fails validation so a typo (`LINK_VERIFY_ENABLED=ture`) is loud, not
 * silently coerced.
 */
const boolWithDefault = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? (def ? 'true' : 'false') : v.trim().toLowerCase()))
    .pipe(z.enum(['true', '1', 'yes', 'on', 'false', '0', 'no', 'off']))
    .transform((v) => v === 'true' || v === '1' || v === 'yes' || v === 'on');

/**
 * Authoritative env schema. Mirrors the Configuration Reference (§10 of the
 * implementation plan; §6 of the authorization plan). Vars unused until later
 * phases are still defined now so the contract is stable.
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

  // --- Broken-link verification pass (Phase 2 enrich). Re-checks links the
  // crawl flagged `is_broken` with a fresh, browser-like request to clear
  // false positives (a page that momentarily 5xx'd under crawl load, or that
  // blocks the bot UA). See EnrichService / LinkVerifierService.
  //
  // Master gate for the whole pass. When false the enrich stage skips
  // verification entirely and reports zero verify counts.
  LINK_VERIFY_ENABLED: boolWithDefault(true),
  // Max simultaneous in-flight verification requests. Kept small on purpose —
  // the original false 5xx came from crawl-time load, so we must NOT hammer the
  // origin while re-checking.
  LINK_VERIFY_CONCURRENCY: intWithDefault(5),
  // Per-request timeout (ms), applied via AbortSignal.timeout.
  LINK_VERIFY_TIMEOUT_MS: intWithDefault(10000),
  // Retries for transient network errors (per distinct URL), with small backoff.
  LINK_VERIFY_RETRIES: intWithDefault(2),
  // Browser-like User-Agent used for verification. Deliberately NOT the crawl
  // bot UA (CRAWL_USER_AGENT) — UA-based blocking is part of the root cause.
  LINK_VERIFY_USER_AGENT: strWithDefault(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  ),
  // Hard cap on distinct URLs verified per audit, so a pathological audit can't
  // fire unbounded requests. Truncation is logged.
  LINK_VERIFY_MAX: intWithDefault(500),

  // Report output directory (Phase 5).
  OUTPUT_DIR: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? './output' : v)),

  // HTTP port for the REST API (Phase 7). Only used by the `api` entrypoint
  // (src/api.main.ts); the CLI never binds a port.
  API_PORT: intWithDefault(3000),

  // --- Auth (Phase A0+). Used only by the API entrypoint; the CLI is
  // unauthenticated. JWT_SECRET is OPTIONAL here (so the CLI boots without it)
  // but the API bootstrap (src/api.main.ts) fails fast if it is unset — an
  // unsigned/empty-secret API is worse than no API. See §6.
  //
  // HS256 signing secret for access tokens. When present it must be at least 32
  // chars; absence is enforced by the API entrypoint, not the schema.
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters').optional(),

  // Access-token lifetime (e.g. `15m`), passed to the JWT signer.
  JWT_ACCESS_TTL: strWithDefault('15m'),

  // Refresh-token lifetime (e.g. `30d`).
  JWT_REFRESH_TTL: strWithDefault('30d'),

  // Password hashing algorithm selector. argon2id is the default; the
  // PasswordService keeps it swappable behind an injectable.
  AUTH_BCRYPT_OR_ARGON: z
    .enum(['argon2id', 'bcrypt'])
    .optional()
    .transform((v) => v ?? 'argon2id'),

  // Failed logins before the lockout window kicks in (Phase A6).
  AUTH_LOGIN_MAX_ATTEMPTS: intWithDefault(5),

  // Lockout window, seconds (Phase A6).
  AUTH_LOGIN_WINDOW_SEC: intWithDefault(900),

  // Bootstrap admin (first run / backfill owner — §10). Optional.
  AUTH_SEED_ADMIN_EMAIL: z
    .string()
    .email('AUTH_SEED_ADMIN_EMAIL must be a valid email address')
    .optional(),
  AUTH_SEED_ADMIN_PASSWORD: z
    .string()
    .min(12, 'AUTH_SEED_ADMIN_PASSWORD must be at least 12 characters')
    .optional(),
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
