import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigError, UnauthorizedError } from '../common/errors';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env.validation';
import type { AccessTokenClaims } from './auth.types';

/**
 * HS256 access-token signer/verifier (Phase A1). See docs/AUTHORIZATION_PLAN.md
 * §3.2 (JWT decision) and §8 (minimal claims).
 *
 * DEPENDENCY DECISION — hand-rolled, not @nestjs/jwt / jsonwebtoken.
 * A JWS with a single fixed algorithm (HS256) and a fixed claim set is ~40 lines
 * of `node:crypto`. This project deliberately avoids unnecessary dependencies
 * (it hand-rolls env validation rather than pulling in dotenv/class-validator —
 * see config.module.ts and zod-validation.pipe.ts), so adding a JWT library for
 * one HMAC + base64url round-trip would not earn its keep. The ENTIRE library
 * choice is isolated behind this class: callers (AuthService, the A2 guard) only
 * see `sign(claims)` / `verify(token)`, so swapping in @nestjs/jwt or moving to
 * RS256 later (§3.2) touches only this file.
 *
 * SECURITY POSTURE for the hand-rolled verifier:
 *  - The header `alg` is asserted to be exactly `HS256` BEFORE verifying — this
 *    closes the classic `alg: none` / algorithm-confusion downgrade. We never
 *    trust the token's self-declared algorithm to pick the verification path.
 *  - Signature comparison is constant-time (`timingSafeEqual`).
 *  - `exp` is enforced; an expired or malformed token throws UnauthorizedError
 *    (→ 401 via AppErrorFilter), never returns partial claims.
 */
@Injectable()
export class JwtService {
  private readonly secret: Buffer;
  private readonly accessTtlSeconds: number;

  constructor(@Inject(ENV) env: Env) {
    // The API entrypoint (src/api.main.ts) fails fast if JWT_SECRET is unset, but
    // this service may also be constructed under the CLI/test DI graph, so guard
    // here too: signing/verifying without a secret is a configuration error.
    if (!env.JWT_SECRET) {
      throw new ConfigError(
        'JWT_SECRET is not set; the JWT signer cannot operate. Set JWT_SECRET ' +
          '(min 32 chars) before issuing or verifying access tokens.',
      );
    }
    this.secret = Buffer.from(env.JWT_SECRET, 'utf8');
    this.accessTtlSeconds = parseDuration(env.JWT_ACCESS_TTL);
  }

  /** The configured access-token lifetime, in seconds (derived from JWT_ACCESS_TTL). */
  get accessTokenTtlSeconds(): number {
    return this.accessTtlSeconds;
  }

  /**
   * Sign an access token. The caller supplies the identity claims (`sub`,
   * `email`, `role`, `tv`); this method stamps `iat`/`exp` from JWT_ACCESS_TTL.
   * Any `iat`/`exp` passed in are ignored — issuance owns the clock.
   */
  sign(claims: AccessTokenClaims): string {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const payload: Required<Pick<AccessTokenClaims, 'sub' | 'email' | 'role' | 'tv'>> &
      Pick<AccessTokenClaims, 'iat' | 'exp'> = {
      sub: claims.sub,
      email: claims.email,
      role: claims.role,
      tv: claims.tv,
      iat: nowSeconds,
      exp: nowSeconds + this.accessTtlSeconds,
    };

    const headerSegment = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payloadSegment = base64UrlEncode(JSON.stringify(payload));
    const signingInput = `${headerSegment}.${payloadSegment}`;
    const signature = this.hmac(signingInput);
    return `${signingInput}.${signature}`;
  }

  /**
   * Verify a token's signature, algorithm, and expiry, returning the typed
   * claims. Throws {@link UnauthorizedError} for any defect (wrong shape, wrong
   * alg, bad signature, expired) so the guard/filter can map a single 401 — never
   * leaking which check failed.
   */
  verify(token: string): AccessTokenClaims {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedError('Malformed access token.');
    }
    const [headerSegment, payloadSegment, signatureSegment] = parts;

    // Pin the algorithm BEFORE checking the signature — never trust the token's
    // own `alg` to choose the verification path (defeats alg-confusion/none).
    const header = decodeJsonSegment(headerSegment, 'header');
    if (header.alg !== 'HS256') {
      throw new UnauthorizedError('Unsupported token algorithm.');
    }

    const expected = this.hmac(`${headerSegment}.${payloadSegment}`);
    if (!constantTimeEquals(signatureSegment, expected)) {
      throw new UnauthorizedError('Invalid access-token signature.');
    }

    const payload = decodeJsonSegment(payloadSegment, 'payload');
    if (typeof payload.exp === 'number' && Math.floor(Date.now() / 1000) >= payload.exp) {
      throw new UnauthorizedError('Access token has expired.');
    }

    if (
      typeof payload.sub !== 'string' ||
      typeof payload.email !== 'string' ||
      (payload.role !== 'user' && payload.role !== 'admin') ||
      typeof payload.tv !== 'number'
    ) {
      throw new UnauthorizedError('Access token is missing required claims.');
    }

    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      tv: payload.tv,
      iat: typeof payload.iat === 'number' ? payload.iat : undefined,
      exp: typeof payload.exp === 'number' ? payload.exp : undefined,
    };
  }

  /** Base64url HMAC-SHA256 of the signing input, using the configured secret. */
  private hmac(signingInput: string): string {
    return createHmac('sha256', this.secret).update(signingInput).digest('base64url');
  }
}

/** Base64url-encode a UTF-8 string (no padding), per the JWS spec. */
function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

/**
 * Decode a base64url JWT segment into a JSON object. Throws UnauthorizedError on
 * any decode/parse failure so callers surface a uniform 401.
 */
function decodeJsonSegment(segment: string, which: 'header' | 'payload'): Record<string, unknown> {
  try {
    const json = Buffer.from(segment, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as unknown;
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('not an object');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new UnauthorizedError(`Malformed access-token ${which}.`);
  }
}

/**
 * Constant-time string comparison via timingSafeEqual. Length differences are
 * handled without an early return that would leak timing: unequal lengths return
 * false only after a same-length dummy compare.
 */
function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still run a compare to keep timing flat, then return false.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Parse a duration string like `15m`, `30d`, `3600s`, `2h`, or a bare number of
 * seconds (`900`) into seconds. Mirrors the small subset of the jsonwebtoken/ms
 * grammar we actually use for JWT_ACCESS_TTL. Throws ConfigError on a value we
 * cannot interpret so a typo fails fast at boot.
 */
export function parseDuration(value: string): number {
  const trimmed = value.trim();
  const match = /^(\d+)\s*(s|m|h|d)?$/i.exec(trimmed);
  if (!match) {
    throw new ConfigError(
      `Invalid duration "${value}". Use a number of seconds (e.g. 900) or a ` +
        `number with a unit suffix: s, m, h, d (e.g. 15m, 30d).`,
    );
  }
  const amount = Number(match[1]);
  const unit = (match[2] ?? 's').toLowerCase();
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return amount * multipliers[unit];
}
