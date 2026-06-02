/**
 * Integration test env bootstrap (loaded via jest `setupFiles`). Ensures
 * `DATABASE_URL` is set before any harness pool is created. Mirrors
 * drizzle.config.ts: real process.env wins; otherwise read ./.env; otherwise
 * fall back to the local compose default.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FALLBACK_URL = 'postgres://seo:seo@localhost:5432/seo_audit';

if (!process.env.DATABASE_URL) {
  const envPath = resolve(process.cwd(), '.env');
  if (existsSync(envPath)) {
    for (const rawLine of readFileSync(envPath, 'utf8').split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      if (line.slice(0, eq).trim() !== 'DATABASE_URL') continue;
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env.DATABASE_URL = value;
      break;
    }
  }
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = FALLBACK_URL;
}
