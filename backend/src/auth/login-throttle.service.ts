import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, gte } from 'drizzle-orm';
import { TooManyRequestsError } from '../common/errors';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env.validation';
import { DB, type Database } from '../db/db.types';
import { authAttempts } from '../db/schema';

/**
 * Per-email brute-force limiter (Phase A6). The DB-backed limiter we chose over
 * `@nestjs/throttler`: it counts recent FAILED login attempts for an email in a
 * sliding window and locks the email out once they reach
 * `AUTH_LOGIN_MAX_ATTEMPTS` within `AUTH_LOGIN_WINDOW_SEC`. See
 * docs/AUTHORIZATION_PLAN.md §A6 / §5.
 *
 * Why DB-backed, not in-memory throttling: per-email counting is precise for
 * credential brute-force (an attacker can't dodge it by rotating source IPs), it
 * survives a restart, and it works across instances with no shared in-memory
 * state — at the price of a few writes ONLY on the login path. Login is not a hot
 * path (unlike the audit status poll), so the extra `auth_attempts` writes are
 * acceptable; no new runtime dependency is pulled in (matching the project's
 * "no unnecessary dependencies" posture — cf. {@link PasswordService}).
 *
 * No-enumeration contract (§8): the limiter is keyed only on the (already
 * -normalized) email and records both unknown-email and wrong-password attempts
 * identically, so neither the lockout nor its 429 message reveals whether an
 * email is registered.
 *
 * Backed by the {@link authAttempts} table (composite `(email, createdAt)` index
 * serves the window count).
 */
@Injectable()
export class LoginThrottleService {
  private readonly maxAttempts: number;
  private readonly windowSeconds: number;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) env: Env,
  ) {
    this.maxAttempts = env.AUTH_LOGIN_MAX_ATTEMPTS;
    this.windowSeconds = env.AUTH_LOGIN_WINDOW_SEC;
  }

  /**
   * Throw {@link TooManyRequestsError} (→ 429) if the email has accumulated at
   * least `AUTH_LOGIN_MAX_ATTEMPTS` FAILED attempts within the last
   * `AUTH_LOGIN_WINDOW_SEC` seconds; otherwise resolve. Call this BEFORE any
   * credential work so a locked email is rejected cheaply and the lockout can't
   * be bypassed (§A6). The email is assumed already-normalized by the caller.
   *
   * Only `succeeded = false` rows newer than the window cutoff count — older
   * failures age out (the window slides) and successes never count.
   */
  async assertNotLocked(email: string): Promise<void> {
    const cutoff = new Date(Date.now() - this.windowSeconds * 1000);
    const [row] = await this.db
      .select({ failures: count() })
      .from(authAttempts)
      .where(
        and(
          eq(authAttempts.email, email),
          eq(authAttempts.succeeded, false),
          gte(authAttempts.createdAt, cutoff),
        ),
      );

    if (row && row.failures >= this.maxAttempts) {
      throw new TooManyRequestsError('Too many failed login attempts. Try again later.');
    }
  }

  /**
   * Record a single login attempt for (email, ip). `succeeded` distinguishes the
   * failures that count toward the lockout from the successes that don't; `ip` is
   * best-effort (nullable) forensics. The email is assumed already-normalized.
   */
  async record(email: string, ip: string | undefined, succeeded: boolean): Promise<void> {
    await this.db.insert(authAttempts).values({ email, ip: ip ?? null, succeeded });
  }

  /**
   * Delete the email's FAILED attempt rows, called on a successful login so a
   * legitimate user who finally types the right password isn't held under lockout
   * by their own earlier typos — the lockout is meant to stop sustained failure,
   * not to punish a user who then succeeds. Successful rows are left in place as a
   * lightweight audit trail. The email is assumed already-normalized.
   */
  async clearFailures(email: string): Promise<void> {
    await this.db
      .delete(authAttempts)
      .where(and(eq(authAttempts.email, email), eq(authAttempts.succeeded, false)));
  }
}
