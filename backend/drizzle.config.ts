import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'drizzle-kit';

/**
 * Load DATABASE_URL for drizzle-kit (generate/push). drizzle-kit runs outside
 * the Nest context, so we read .env here directly rather than via ConfigModule.
 * Real process.env wins over the file.
 */
function loadDatabaseUrl(): string {
  if (!process.env.DATABASE_URL) {
    const envPath = resolve(process.cwd(), '.env');
    if (existsSync(envPath)) {
      for (const rawLine of readFileSync(envPath, 'utf8').split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        if (key !== 'DATABASE_URL') continue;
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
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set (checked process.env and ./.env). Cannot run drizzle-kit.');
  }
  return url;
}

export default defineConfig({
  schema: './src/db/schema/*',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: loadDatabaseUrl(),
  },
  verbose: true,
});
