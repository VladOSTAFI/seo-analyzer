import { ConfigError } from '../common/errors';
import { validateEnv } from './env.validation';

const VALID_DB_URL = 'postgres://seo:seo@localhost:5432/seo_audit';

describe('validateEnv', () => {
  it('accepts a minimal valid env and applies defaults', () => {
    const env = validateEnv({ DATABASE_URL: VALID_DB_URL });
    expect(env.DATABASE_URL).toBe(VALID_DB_URL);
    expect(env.DB_POOL_SIZE).toBe(10);
    expect(env.CRAWL_MAX_PAGES).toBe(500);
    expect(env.CRAWL_CONCURRENCY).toBe(5);
    expect(env.CRAWL_RATE_LIMIT).toBe(5);
    expect(env.PSI_MAX_SAMPLES).toBe(20);
    expect(env.OUTPUT_DIR).toBe('./output');
    expect(env.PSI_API_KEY).toBe('');
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => validateEnv({})).toThrow(ConfigError);
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it('rejects a malformed DATABASE_URL', () => {
    expect(() => validateEnv({ DATABASE_URL: 'not-a-url' })).toThrow(ConfigError);
    expect(() => validateEnv({ DATABASE_URL: 'not-a-url' })).toThrow(/valid connection URL/);
  });

  it('rejects an empty DATABASE_URL', () => {
    expect(() => validateEnv({ DATABASE_URL: '' })).toThrow(ConfigError);
  });

  it('coerces numeric env vars and rejects non-numeric ones', () => {
    const env = validateEnv({ DATABASE_URL: VALID_DB_URL, DB_POOL_SIZE: '25' });
    expect(env.DB_POOL_SIZE).toBe(25);

    expect(() => validateEnv({ DATABASE_URL: VALID_DB_URL, DB_POOL_SIZE: 'abc' })).toThrow(
      ConfigError,
    );
  });

  it('passes through PSI_API_KEY when provided', () => {
    const env = validateEnv({ DATABASE_URL: VALID_DB_URL, PSI_API_KEY: 'secret-key' });
    expect(env.PSI_API_KEY).toBe('secret-key');
  });
});
