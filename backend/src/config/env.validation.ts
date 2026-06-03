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
