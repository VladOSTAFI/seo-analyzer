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
    .transform((v) =>
      v === undefined || v === '' ? (def ? 'true' : 'false') : v.trim().toLowerCase(),
    )
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

  // --- External-link & image health verification (enrich, item 9). The crawl
  // only resolves link targets that match a crawled page, so external links and
  // image src are never probed and `links.broken-external` / `image.broken` are
  // dead rules. These passes fix that — gated OFF by default (outbound volume)
  // and best-effort (never fail enrich). Reuse the LINK_VERIFY_* pool/UA/timeout.
  //
  // Probe a sample of external link hrefs (HEAD, GET fallback) for liveness.
  EXTERNAL_VERIFY_ENABLED: boolWithDefault(false),
  // Probe image src (HEAD, GET fallback) to populate images.status_code.
  IMAGE_VERIFY_ENABLED: boolWithDefault(false),
  // Hard cap on distinct external/image URLs probed per audit.
  EXTERNAL_VERIFY_MAX: intWithDefault(200),
  // Per-host budget so one host can't dominate the probe set.
  EXTERNAL_VERIFY_PER_HOST: intWithDefault(20),

  // --- Analysis rule tuning ---
  // `links.external-flag` fires for every external link missing rel=nofollow,
  // which is rarely actionable (135 low findings on the reference audit). OFF by
  // default; when on, the rule narrows to monetized-looking links (item 6).
  RULE_EXTERNAL_FLAG_ENABLED: boolWithDefault(false),
  // Prevalence threshold (0..1) for the perf flag rollup (item 5): when a PSI
  // flag appears on ≥ this fraction of sampled pages for a strategy, emit ONE
  // site-level finding instead of one per page.
  PERF_FLAG_ROLLUP_PCT: floatWithDefault(0.6),
  // `perf.lab-score` (item 11) flags pages whose Lighthouse performance score is
  // below this (0..100). The only genuinely per-page perf signal.
  PERF_LAB_SCORE_MIN: intWithDefault(90),

  // --- Phase 1 rules-bundle tuning ---
  // `index.click-depth` flags live HTML pages buried deeper than this many clicks
  // (BFS depth from the crawl seed). Default 3.
  SEO_MAX_DEPTH: intWithDefault(3),
  // Master gate for the heuristic `index.soft-404` rule. Allows disabling on
  // multilingual sites with high false-positive rates. Default ON.
  SEO_SOFT404_ENABLED: boolWithDefault(true),
  // Word-count ceiling for the soft-404 heuristic. RESERVED — wired in once
  // feature 08 adds the `word_count` column; unused by the vocabulary-only phase.
  SEO_SOFT404_MAX_WORDS: intWithDefault(50),
  // `links.anchor-quality` generic-anchor phrase list. Optional comma-separated
  // override of the built-in multilingual default; whole-string (not substring)
  // match. Empty/unset uses the rule's built-in list.
  LINK_GENERIC_ANCHORS: strWithDefault(''),

  // --- Phase 2: structured data (feature 06) ---
  // Cap JSON-LD <script> blocks parsed per page (bounds memory on pages with
  // huge embedded markup).
  SCHEMA_MAX_BLOCKS_PER_PAGE: intWithDefault(50),
  // Truncate the stored raw JSON-LD text per block to this many bytes.
  SCHEMA_RAW_MAX_BYTES: intWithDefault(8192),

  // --- Phase 2: Open Graph / social (feature 07) ---
  // When true, a missing og:image is graded medium instead of low.
  SEO_OG_IMAGE_REQUIRED: boolWithDefault(false),

  // --- Phase 2: robots.txt audit (feature 02). Best-effort discovery sub-step. ---
  ROBOTS_AUDIT_ENABLED: boolWithDefault(true),
  ROBOTS_FETCH_TIMEOUT_MS: intWithDefault(10000),
  // Comma-separated extra "important" path prefixes whose disallow escalates to
  // high. Empty by default: severity is driven by disallows that actually hit
  // crawled content pages. (A bare '/' would mark the whole site important and
  // flag every normal hygiene disallow — it is ignored.)
  ROBOTS_IMPORTANT_PATHS: strWithDefault(''),

  // --- Phase 2: XML sitemap validation (feature 03). Best-effort discovery sub-step. ---
  SITEMAP_AUDIT_ENABLED: boolWithDefault(true),
  SITEMAP_MAX_URLS: intWithDefault(50000), // protocol cap, per file
  SITEMAP_MAX_BYTES: intWithDefault(52428800), // 50MB per file
  SITEMAP_MAX_FILES: intWithDefault(50), // total files per audit (index recursion bound)
  SITEMAP_FETCH_TIMEOUT_MS: intWithDefault(15000),

  // --- Phase 2: image weight / format / probe (feature 09) ---
  // Stream-count cap (bytes) when the origin sends no Content-Length on the
  // image probe GET fallback.
  IMAGE_FETCH_MAX_BYTES: intWithDefault(5_000_000),
  // image.oversized threshold (bytes at/above which an image is flagged).
  IMAGE_MAX_BYTES: intWithDefault(200_000),
  // image.legacy-format min bytes (tiny legacy icons below this are not flagged).
  IMAGE_LEGACY_MIN_BYTES: intWithDefault(50_000),
  // image.responsive min intrinsic width before a non-srcset image is flagged.
  IMAGE_RESPONSIVE_MIN_WIDTH: intWithDefault(640),
  // image.alt-quality over-long alt threshold (characters).
  IMAGE_ALT_MAX_LEN: intWithDefault(125),
  // image.alt-quality comma-list keyword-stuffing threshold.
  IMAGE_ALT_MAX_COMMAS: intWithDefault(4),
  // Distinct image srcs probed per audit (forward-compat; probe currently reuses
  // EXTERNAL_VERIFY_MAX for the budget).
  IMAGE_FETCH_MAX: intWithDefault(200),

  // --- Phase 2: content semantics (feature 08) ---
  SEO_THIN_WORDS: intWithDefault(200),
  SEO_THIN_RATIO: floatWithDefault(0.1),
  SEO_NEARDUP_MAX_HAMMING: intWithDefault(3),
  SEO_TITLE_PX_MIN: intWithDefault(200),
  SEO_TITLE_PX_MAX: intWithDefault(580),
  SEO_DESC_PX_MIN: intWithDefault(430),
  SEO_DESC_PX_MAX: intWithDefault(920),

  // --- Phase 2: HTTPS / security / mobile (feature 11) ---
  // Gate for the best-effort TLS cert probe (the only network-touching part); OFF by default.
  SECURITY_VERIFY_ENABLED: boolWithDefault(false),
  CERT_MIN_DAYS: intWithDefault(14),
  PAGE_WEIGHT_MAX_BYTES: intWithDefault(3_000_000),
  PAGE_REQUEST_MAX: intWithDefault(80),

  // --- Report layer: score + action plan (plans 12/13) ---
  // Exponential-decay constant for the SEO health score normalization (plan 12
  // §3.5): score = round(100 × exp(−K × penaltyDensity)). Tunable so calibration
  // can shift without a code change; changing it shifts historical comparisons.
  SCORE_DECAY_K: floatWithDefault(0.35),
  // Size of the report's "Top fixes" list and the API `topActions` array.
  REPORT_TOP_ACTIONS: intWithDefault(10),
  // Cap on the "By Page" sheet rows for very large sites (logged on truncation).
  REPORT_BY_PAGE_MAX_ROWS: intWithDefault(5000),
  // Per-action affected-URL sample retained for the Action Plan sheet.
  REPORT_AFFECTED_URLS_SAMPLE: intWithDefault(50),

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
