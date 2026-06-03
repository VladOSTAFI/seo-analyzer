import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { EmailTakenError, InvalidCredentialsError } from '../common/errors';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env.validation';
import { DB, type Database } from '../db/db.types';
import { type User, refreshTokens, users } from '../db/schema';
import { JwtService } from './jwt.service';
import { parseDuration } from './jwt.service';
import { PasswordService } from './password.service';

/** What the register/login flows hand back to the controller. */
export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Identity service (Phase A1). The single entry point for credential-based
 * register/login and token issuance, so swapping in an external IdP later only
 * touches issuance, not enforcement (§3.1). See docs/AUTHORIZATION_PLAN.md §A1.
 *
 * Tokens:
 *  - access  → stateless HS256 JWT from {@link JwtService} (verified with zero DB
 *    round-trips on the hot path).
 *  - refresh → an opaque random string returned to the caller; only its sha-256
 *    digest is persisted (`refresh_tokens.tokenHash`) so a DB leak yields no
 *    usable token. The refresh ENDPOINT (rotation) is A5 — A1 only issues + stores.
 *
 * Security (§8): login uses ONE generic {@link InvalidCredentialsError} for both
 * unknown-email and wrong-password to avoid account enumeration.
 */
@Injectable()
export class AuthService {
  private readonly refreshTtlSeconds: number;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) env: Env,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
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
   */
  async login(email: string, password: string): Promise<IssuedTokens> {
    const normalizedEmail = normalizeEmail(email);

    const user = await this.findByEmail(normalizedEmail);
    if (!user) {
      throw new InvalidCredentialsError('Invalid email or password.');
    }

    const ok = await this.passwords.verify(user.passwordHash, password);
    if (!ok) {
      throw new InvalidCredentialsError('Invalid email or password.');
    }

    return this.issueTokens(user);
  }

  /**
   * Mint an access JWT for the user and a stored, opaque refresh token. The raw
   * refresh token is returned to the caller exactly once; only its sha-256 digest
   * is persisted. Expiry is computed from JWT_REFRESH_TTL.
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

  /** Look up a user by an already-normalized email, or `undefined` if none. */
  private async findByEmail(normalizedEmail: string): Promise<User | undefined> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);
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
