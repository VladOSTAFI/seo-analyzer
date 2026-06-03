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

/**
 * Authentication failed: the request carries no identity or an invalid/expired
 * one. Maps to HTTP 401 in AppErrorFilter (Phase A1+).
 */
export class UnauthorizedError extends AppError {}

/**
 * The caller is authenticated but not allowed to perform the action (e.g. role
 * or ownership check failed). Maps to HTTP 403 in AppErrorFilter (Phase A1+).
 */
export class ForbiddenError extends AppError {}

/**
 * Login credentials did not match (unknown email or wrong password). Deliberately
 * generic — same error for both cases to avoid account enumeration (§8). Maps to
 * HTTP 401 in AppErrorFilter (Phase A1+).
 */
export class InvalidCredentialsError extends AppError {}

/** Registration was attempted with an already-registered email. Maps to HTTP 409. */
export class EmailTakenError extends AppError {}

/**
 * Rate limit / brute-force lockout tripped (too many recent failed logins for the
 * targeted email — Phase A6). Deliberately generic — the message never reveals
 * whether the email exists (§8). Maps to HTTP 429 in AppErrorFilter.
 */
export class TooManyRequestsError extends AppError {}
