import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UnauthorizedError } from '../common/errors';
import type { Env } from '../config/env.validation';
import type { AccessTokenClaims } from './auth.types';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtService } from './jwt.service';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * Unit tests for {@link JwtAuthGuard}. We drive a real {@link JwtService} (the
 * verify path is the contract under test) and a real {@link Reflector}, and feed a
 * hand-rolled {@link ExecutionContext} whose request exposes a mutable
 * `headers`/`user` slice — so we assert `canActivate` AND the attached principal
 * without an HTTP server, matching app-error.filter.spec.ts's approach.
 */
const SECRET = 'x'.repeat(32);
const env = { JWT_SECRET: SECRET, JWT_ACCESS_TTL: '15m' } as Env;
const jwt = new JwtService(env);

const CLAIMS: AccessTokenClaims = {
  sub: '11111111-2222-3333-4444-555555555555',
  email: 'user@example.com',
  role: 'user',
  tv: 0,
};

interface FakeRequest {
  headers: Record<string, string | undefined>;
  user?: unknown;
}

/** Build an ExecutionContext over a request and optional handler/class metadata. */
function contextWith(
  request: FakeRequest,
  meta: { handler?: object; class?: object } = {},
): ExecutionContext {
  const handler = meta.handler ?? function handlerFn() {};
  const cls = meta.class ?? class ControllerCls {};
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => cls,
  } as unknown as ExecutionContext;
}

function guard(): JwtAuthGuard {
  return new JwtAuthGuard(new Reflector(), jwt);
}

describe('JwtAuthGuard', () => {
  it('allows a request bearing a valid token and attaches the principal to req.user', () => {
    const token = jwt.sign(CLAIMS);
    const request: FakeRequest = { headers: { authorization: `Bearer ${token}` } };

    expect(guard().canActivate(contextWith(request))).toBe(true);
    expect(request.user).toEqual({
      id: CLAIMS.sub,
      email: CLAIMS.email,
      role: CLAIMS.role,
      tokenVersion: CLAIMS.tv,
    });
  });

  it('rejects a request with no Authorization header', () => {
    const request: FakeRequest = { headers: {} };
    expect(() => guard().canActivate(contextWith(request))).toThrow(UnauthorizedError);
    expect(request.user).toBeUndefined();
  });

  it('rejects a malformed Authorization header (wrong scheme / no token)', () => {
    expect(() =>
      guard().canActivate(contextWith({ headers: { authorization: 'Basic abc123' } })),
    ).toThrow(UnauthorizedError);
    expect(() =>
      guard().canActivate(contextWith({ headers: { authorization: 'Bearer' } })),
    ).toThrow(UnauthorizedError);
    expect(() =>
      guard().canActivate(contextWith({ headers: { authorization: 'Bearer ' } })),
    ).toThrow(UnauthorizedError);
  });

  it('rejects a garbage token', () => {
    const request: FakeRequest = { headers: { authorization: 'Bearer not.a.jwt' } };
    expect(() => guard().canActivate(contextWith(request))).toThrow(UnauthorizedError);
  });

  it('rejects an expired token', () => {
    const shortLived = new JwtService({ ...env, JWT_ACCESS_TTL: '1s' } as Env);
    const token = shortLived.sign(CLAIMS);
    const expiredGuard = new JwtAuthGuard(new Reflector(), shortLived);
    const request: FakeRequest = { headers: { authorization: `Bearer ${token}` } };

    const realNow = Date.now;
    try {
      Date.now = () => realNow() + 5_000;
      expect(() => expiredGuard.canActivate(contextWith(request))).toThrow(UnauthorizedError);
    } finally {
      Date.now = realNow;
    }
  });

  it('skips verification for a @Public()-marked handler (no token required)', () => {
    // Tag the handler the way SetMetadata(IS_PUBLIC_KEY, true) would.
    const publicHandler = function publicHandlerFn() {};
    Reflect.defineMetadata(IS_PUBLIC_KEY, true, publicHandler);

    const request: FakeRequest = { headers: {} };
    const ctx = contextWith(request, { handler: publicHandler });

    expect(guard().canActivate(ctx)).toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('skips verification when the controller CLASS is marked @Public()', () => {
    class PublicController {}
    Reflect.defineMetadata(IS_PUBLIC_KEY, true, PublicController);

    const request: FakeRequest = { headers: {} };
    const ctx = contextWith(request, { class: PublicController });

    expect(guard().canActivate(ctx)).toBe(true);
    expect(request.user).toBeUndefined();
  });
});
