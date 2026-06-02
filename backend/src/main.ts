import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { CommandFactory } from 'nest-commander';
import { AppModule } from './app.module';
import { AppError } from './common/errors';

const logger = new Logger('Bootstrap');

/**
 * CLI entrypoint. Bootstraps the Nest app via CommandFactory (no HTTP server).
 *
 * All bootstrap + command errors funnel through the catch below:
 *  - AppError subclasses (config/db/argument) print just their actionable
 *    message — no stack noise.
 *  - Anything else prints the full error for debugging.
 * Either way we exit non-zero so callers/scripts can detect failure.
 */
async function bootstrap(): Promise<void> {
  await CommandFactory.run(AppModule, {
    logger: ['error', 'warn', 'log'],
    // We handle errors ourselves to control exit codes and messaging.
    errorHandler: (err) => {
      throw err;
    },
    serviceErrorHandler: (err) => {
      throw err;
    },
  });
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
  // Ensure the process actually terminates even if a pool/handle lingers.
  process.exit(1);
});
