import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Global, Module } from '@nestjs/common';
import { Env, validateEnv } from './env.validation';

/** Injection token for the validated, typed environment config. */
export const ENV = Symbol('ENV');

/**
 * Minimal .env loader (no external dotenv dependency). Parses KEY=VALUE lines,
 * ignores comments/blank lines, and only sets vars that are not already present
 * in process.env (real env wins over the file). Best-effort: a missing file is
 * fine — validation runs against whatever is present.
 */
function loadDotEnv(path = resolve(process.cwd(), '.env')): void {
  if (!existsSync(path)) return;
  const content = readFileSync(path, 'utf8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function buildEnv(): Env {
  loadDotEnv();
  return validateEnv(process.env);
}

/**
 * Global config module. Loads + validates env at construction so the rest of
 * the app injects a typed, guaranteed-valid `Env` via the ENV token. Invalid
 * config throws a ConfigError here (caught by the top-level handler).
 */
@Global()
@Module({
  providers: [
    {
      provide: ENV,
      useFactory: buildEnv,
    },
  ],
  exports: [ENV],
})
export class ConfigModule {}
