import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import { EmailTakenError, InvalidCredentialsError, UnauthorizedError } from '../common/errors';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env.validation';
import { DB, type Database } from '../db/db.types';
import { type User, refreshTokens, users } from '../db/schema';
import { JwtService } from './jwt.service';
import { parseDuration } from './jwt.service';
import { LoginThrottleService } from './login-throttle.service';
import { PasswordService } from './password.service';

/** What the register/login flows hand back to the controller. */
export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Identity service (Phase A1 + A5 + A6). The single entry point for credential
 * -based register/login, token issuance, and the session lifecycle (refresh
 * rotation, logout, mass-revoke), so swapping in an external IdP later only
 * touches issuance, not enforcement (§3.1). See docs/AUTHORIZATION_PLAN.md
 * §A1 / §A5 / §A6.
 *
 * Tokens:
 *  - access  → stateless HS256 JWT from {@link JwtService} (verified with zero DB
 *    round-trips on the hot path).
 *  - refresh → an opaque random string returned to the caller; only its sha-256
 *    digest is persisted (`refresh_tokens.tokenHash`) so a DB leak yields no
 *    usable token. {@link refresh} rotates it: the presented token is revoked and
 *    a brand-new pair is minted, so a leaked-then-reused token fails (A5).
 *
 * Security (§8): login uses ONE generic {@link InvalidCredentialsError} for both
 * unknown-email and wrong-password; refresh/logout failures use ONE generic
 * {@link UnauthorizedError} (missing vs expired vs revoked vs inactive-owner are
 * all indistinguishable) — no account/session enumeration. Brute-force is fenced
 * by {@link LoginThrottleService} (A6): per-email lockout checked BEFORE any
 * credential work, and the unknown-email branch still burns an argon2 verify
 * (see {@link PasswordService.verifyTimingSafeDummy}) so timing, error, AND the
 * recorded attempt are indistinguishable from a wrong password.
 */
@Injectable()
export class AuthService {
  private readonly refreshTtlSeconds: number;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) env: Env,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly throttle: LoginThrottleService,
  ) {
    this.refreshTtlSeconds = parseDuration(env.JWT_REFRESH_TTL);
  }

  /**
   * Register a new account and return a fresh token pair. Email is normalized
   * (lowercase + trim) before the uniqueness check and insert. A duplicate email
   * raises {@link EmailTakenError} (→ 409); the new account always gets role
   * `user` — callers cannot self-assign `admin` (the DTO is `.strict()` and we
   * never read a role from input).
   */
  async register(email: string, password: string): Promise<IssuedTokens> {
    const normalizedEmail = normalizeEmail(email);

    const existing = await this.findByEmail(normalizedEmail);
    if (existing) {
      throw new EmailTakenError(`An account with email "${normalizedEmail}" already exists.`);
    }

    const passwordHash = await this.passwords.hash(password);
    const [created] = await this.db
      .insert(users)
      .values({ email: normalizedEmail, passwordHash, role: 'user' })
      .returning();
    if (!created) {
      throw new Error('Insert returned no row; user was not created.');
    }

    return this.issueTokens(created);
  }

  /**
   * Authenticate an email/password pair and return a fresh token pair. Both a
   * missing account and a wrong password raise the SAME generic
   * {@link InvalidCredentialsError} (→ 401) so the response can't be used to
   * probe which emails are registered (§8).
   *
   * Brute-force protection (A6): the (normalized) email is checked against the
   * per-email lockout BEFORE any credential work — a locked email gets 429 with
   * no hash computed and no DB lookup, so the lockout is both cheap and
   * unbypassable. Every failed attempt (unknown-email OR wrong-password) is
   * recorded identically; on success the email's prior failures are cleared so a
   * user isn't locked by their own earlier typos.
   *
   * Constant-ish-time (§8): when the email is unknown there is no stored hash to
   * check, so we run a decoy argon2 verify ({@link PasswordService.verifyTimingSafeDummy})
   * to match the wrong-password timing — unknown-email and wrong-password are
   * indistinguishable in error, timing, AND recorded-attempt behavior.
   *
   * @param ip Best-effort client address (optional) recorded with each attempt.
   */
  async login(email: string, password: string, ip?: string): Promise<IssuedTokens> {
    const normalizedEmail = normalizeEmail(email);

    // Lockout check first: a brute-forced email is rejected (429) before any
    // credential work, so the lockout can't be bypassed and stays cheap.
    await this.throttle.assertNotLocked(normalizedEmail);

    const user = await this.findByEmail(normalizedEmail);
    if (!user) {
      // Unknown email: still burn an argon2 verify so timing matches the wrong
      // -password branch, then record + reject identically (no enumeration, §8).
      await this.passwords.verifyTimingSafeDummy(password);
      await this.throttle.record(normalizedEmail, ip, false);
      throw new InvalidCredentialsError('Invalid email or password.');
    }

    const ok = await this.passwords.verify(user.passwordHash, password);
    if (!ok) {
      await this.throttle.record(normalizedEmail, ip, false);
      throw new InvalidCredentialsError('Invalid email or password.');
    }

    // Success: record it and clear the email's prior failures so an earlier run
    // of typos can't keep a now-legitimate login under lockout.
    await this.throttle.record(normalizedEmail, ip, true);
    await this.throttle.clearFailures(normalizedEmail);

    return this.issueTokens(user);
  }

  /**
   * Mint an access JWT for the user and a stored, opaque refresh token. The raw
   * refresh token is returned to the caller exactly once; only its sha-256 digest
   * is persisted. Expiry is computed from JWT_REFRESH_TTL.
   *
   * The access JWT's `role`/`tv` claims are stamped from the `user` passed in.
   * {@link refresh} relies on this: it reloads the user before calling, so a
   * changed role or a bumped `tokenVersion` propagates into the NEXT access token
   * (the lazy-`tv` strategy — see {@link revokeAllSessions}).
   */
  async issueTokens(user: User): Promise<IssuedTokens> {
    const accessToken = this.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      tv: user.tokenVersion,
    });

    const refreshToken = randomBytes(32).toString('base64url');
    const tokenHash = sha256(refreshToken);
    const expiresAt = new Date(Date.now() + this.refreshTtlSeconds * 1000);

    await this.db.insert(refreshTokens).values({ userId: user.id, tokenHash, expiresAt });

    return { accessToken, refreshToken };
  }

  /**
   * Exchange a valid opaque refresh token for a brand-new access+refresh pair
   * (Phase A5). The presented token is **rotated**: it is revoked atomically and a
   * fresh one is issued, so refresh-token replay is defeated.
   *
   * Replay/double-spend defense — the claim is a single conditional UPDATE:
   * `revoked_at := now() WHERE token_hash = ? AND revoked_at IS NULL AND
   * expires_at > now()`. The row can be claimed exactly once; a token presented
   * twice concurrently has one winner (a row comes back) and one loser (no row →
   * 401). Missing, already-revoked, and expired tokens are ALL "no row" and yield
   * the SAME generic {@link UnauthorizedError} — never revealing which (§8).
   *
   * Because the owning user is reloaded fresh, the new access token carries the
   * user's CURRENT `role` and `tokenVersion`; this is where a role change or a
   * `tokenVersion` bump (lazy mass-revoke — {@link revokeAllSessions}) takes
   * effect. A missing or deactivated (`isActive === false`) owner is rejected with
   * the same generic error.
   */
  async refresh(rawRefreshToken: string): Promise<IssuedTokens> {
    const tokenHash = sha256(rawRefreshToken);

    // Atomic claim: succeeds for exactly one caller iff the token is active and
    // unexpired. The returned row is our proof we won the race.
    const now = new Date();
    const [claimed] = await this.db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(
        and(
          eq(refreshTokens.tokenHash, tokenHash),
          isNull(refreshTokens.revokedAt),
          gt(refreshTokens.expiresAt, now),
        ),
      )
      .returning();
    if (!claimed) {
      throw new UnauthorizedError('Invalid or expired refresh token.');
    }

    const user = await this.findById(claimed.userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedError('Invalid or expired refresh token.');
    }

    // Best-effort lazy cleanup of clearly-expired rows; off the critical path of
    // the rotation above and never fatal (a sweep failure must not fail refresh).
    void Promise.resolve(this.db.delete(refreshTokens).where(lt(refreshTokens.expiresAt, now))).catch(
      () => {},
    );

    return this.issueTokens(user);
  }

  /**
   * Log the caller out by revoking ALL of their currently-active refresh tokens
   * (`revoked_at := now() WHERE user_id = ? AND revoked_at IS NULL`) — Phase A5.
   * This ends every session's ability to refresh; subsequent {@link refresh}
   * with any of those tokens returns 401 (rotation/claim finds no active row).
   *
   * Idempotent: with no active tokens this is a successful no-op (the 204 path).
   *
   * Residual window (deliberate stateless trade-off, §3.2): already-issued access
   * JWTs are NOT invalidated here — they stay valid until their short TTL (~15m)
   * elapses, because the hot-path guard verifies tokens without a DB read. A
   * normal logout intentionally does not bump `tokenVersion`, so it does not
   * invalidate the user's other valid access tokens system-wide; use
   * {@link revokeAllSessions} for that "log out everywhere" semantics.
   */
  async logout(userId: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  }

  /**
   * Mass-revoke EVERY outstanding credential for a user (Phase A5) — the "log out
   * everywhere" / forced-logout-on-password-change primitive. It does two things:
   *  1. bumps `users.tokenVersion` (`token_version := token_version + 1`), which
   *     invalidates all outstanding access tokens under the LAZY `tv` strategy:
   *     the stateless guard never reads `tv` per-request (zero-DB hot path, §3.2),
   *     but the next {@link refresh} reloads the user and any access token signed
   *     against the old `tv` can no longer be re-minted — so access ability lapses
   *     within at most one access-token TTL.
   *  2. revokes all the user's active refresh tokens, so no session can refresh.
   *
   * No route calls this in A5 (there is no password-change/admin endpoint yet);
   * it is exposed as the public primitive those future flows will invoke. It is
   * intentionally distinct from {@link logout}, which must NOT bump `tv`.
   */
  async revokeAllSessions(userId: string): Promise<void> {
    await this.db
      .update(users)
      .set({ tokenVersion: sql`${users.tokenVersion} + 1` })
      .where(eq(users.id, userId));

    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  }

  /** Look up a user by an already-normalized email, or `undefined` if none. */
  private async findByEmail(normalizedEmail: string): Promise<User | undefined> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);
    return row;
  }

  /** Look up a user by id, or `undefined` if none. Mirrors {@link findByEmail}. */
  private async findById(id: string): Promise<User | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row;
  }
}

/** Canonicalize an email for storage/lookup: trim + lowercase. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Hex sha-256 digest of an opaque token — what we store, never the raw token. */
function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
