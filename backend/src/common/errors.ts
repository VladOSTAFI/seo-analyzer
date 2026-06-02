/**
 * Base class for errors that represent an actionable, user-facing failure.
 * The top-level handler in main.ts prints `message` (no stack noise) and exits
 * non-zero for these.
 */
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Configuration / environment is invalid or incomplete. */
export class ConfigError extends AppError {}

/** The database could not be reached or a DB operation failed fatally. */
export class DatabaseError extends AppError {}

/** A CLI argument failed validation (e.g. malformed URL). */
export class InvalidArgumentError extends AppError {}
