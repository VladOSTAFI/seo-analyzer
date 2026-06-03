import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppError, ConfigError } from './common/errors';
import { ENV } from './config/config.module';
import type { Env } from './config/env.validation';

const logger = new Logger('ApiBootstrap');

/**
 * HTTP entrypoint for the Phase 7 REST API. Distinct from the CLI entrypoint
 * (src/main.ts, which boots via nest-commander's CommandFactory). Both share the
 * same AppModule; this one stands up an Express HTTP server via NestFactory and
 * listens on API_PORT.
 *
 * The CLI commands are still registered as providers in AppModule but stay inert
 * here (CommandFactory is never invoked), and conversely the controllers stay
 * inert under the CLI (no HTTP adapter). One module, two entrypoints.
 *
 * Errors funnel through the same handler shape as the CLI: AppError subclasses
 * print just their actionable message; anything else prints the full error. We
 * exit non-zero so a supervisor/script can detect a failed boot.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  // Flush in-flight requests + close the DB pool (DbModule.onModuleDestroy) on
  // SIGTERM/SIGINT so `docker stop` / Ctrl-C shut down cleanly.
  app.enableShutdownHooks();

  const env = app.get<Env>(ENV);

  // API-only fail-fast: a signed token surface is meaningless without a secret.
  // JWT_SECRET is optional in the shared envSchema so the CLI (unauthenticated)
  // boots without it; here, the HTTP surface that issues/verifies tokens must
  // refuse to start unsigned. See docs/AUTHORIZATION_PLAN.md §6.
  if (!env.JWT_SECRET) {
    throw new ConfigError(
      'JWT_SECRET is required to run the REST API but is not set.\n' +
        '  Set a strong secret (>= 32 chars) in your environment or .env, e.g.\n' +
        '    JWT_SECRET=$(openssl rand -hex 32)\n' +
        '  The CLI entrypoint (npm run cli) does not require it.',
    );
  }

  await app.listen(env.API_PORT);
  logger.log(`REST API listening on http://localhost:${env.API_PORT}`);
}

bootstrap().catch((err: unknown) => {
  if (err instanceof AppError) {
    logger.error(err.message);
  } else if (err instanceof Error) {
    logger.error(err.message, err.stack);
  } else {
    logger.error(`Unexpected failure: ${String(err)}`);
  }
  process.exitCode = 1;
  process.exit(1);
});
