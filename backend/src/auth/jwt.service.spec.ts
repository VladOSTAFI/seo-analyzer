import { ConfigError, UnauthorizedError } from '../common/errors';
import type { Env } from '../config/env.validation';
import type { AccessTokenClaims } from './auth.types';
import { JwtService, parseDuration } from './jwt.service';

/**
 * Minimal Env stub — JwtService reads only JWT_SECRET + JWT_ACCESS_TTL. A 32+
 * char secret keeps the constructor happy (the real schema floor is 32).
 */
const SECRET = 'x'.repeat(32);
const envWith = (overrides: Partial<Env> = {}): Env =>
  ({ JWT_SECRET: SECRET, JWT_ACCESS_TTL: '15m', ...overrides }) as Env;

const CLAIMS: AccessTokenClaims = {
  sub: '11111111-2222-3333-4444-555555555555',
  email: 'user@example.com',
  role: 'user',
  tv: 0,
};

describe('JwtService', () => {
  describe('construction', () => {
    it('throws ConfigError when JWT_SECRET is unset', () => {
      expect(() => new JwtService(envWith({ JWT_SECRET: undefined }))).toThrow(ConfigError);
    });
  });

  describe('sign + verify round-trip', () => {
    const service = new JwtService(envWith());

    it('verifies a freshly-signed token and returns the original claims', () => {
      const token = service.sign(CLAIMS);
      const claims = service.verify(token);
      expect(claims.sub).toBe(CLAIMS.sub);
      expect(claims.email).toBe(CLAIMS.email);
      expect(claims.role).toBe(CLAIMS.role);
      expect(claims.tv).toBe(CLAIMS.tv);
    });

    it('stamps iat/exp from JWT_ACCESS_TTL (exp = iat + 900s for 15m)', () => {
      const token = service.sign(CLAIMS);
      const claims = service.verify(token);
      expect(claims.iat).toBeDefined();
      expect(claims.exp).toBeDefined();
      expect((claims.exp as number) - (claims.iat as number)).toBe(15 * 60);
    });

    it('produces a three-segment JWS', () => {
      expect(service.sign(CLAIMS).split('.')).toHaveLength(3);
    });
  });

  describe('verify rejects bad tokens', () => {
    const service = new JwtService(envWith());

    it('rejects a malformed (non-3-part) token', () => {
      expect(() => service.verify('not.a.jwt.token')).toThrow(UnauthorizedError);
      expect(() => service.verify('onlyonepart')).toThrow(UnauthorizedError);
    });

    it('rejects a token whose payload was tampered with (signature mismatch)', () => {
      const token = service.sign(CLAIMS);
      const [header, , signature] = token.split('.');
      const forgedPayload = Buffer.from(
        JSON.stringify({ ...CLAIMS, role: 'admin', iat: 1, exp: 9_999_999_999 }),
      ).toString('base64url');
      const forged = `${header}.${forgedPayload}.${signature}`;
      expect(() => service.verify(forged)).toThrow(UnauthorizedError);
    });

    it('rejects a token signed with a different secret', () => {
      const other = new JwtService(envWith({ JWT_SECRET: 'y'.repeat(32) }));
      const token = other.sign(CLAIMS);
      expect(() => service.verify(token)).toThrow(UnauthorizedError);
    });

    it('rejects a token with alg!=HS256 (alg-confusion / none guard)', () => {
      const token = service.sign(CLAIMS);
      const [, payload, signature] = token.split('.');
      const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
        'base64url',
      );
      const downgraded = `${noneHeader}.${payload}.${signature}`;
      expect(() => service.verify(downgraded)).toThrow(UnauthorizedError);
    });

    it('rejects an expired token', () => {
      // 1s TTL, then jump the clock past expiry.
      const shortLived = new JwtService(envWith({ JWT_ACCESS_TTL: '1s' }));
      const token = shortLived.sign(CLAIMS);
      const realNow = Date.now;
      try {
        Date.now = () => realNow() + 5_000;
        expect(() => shortLived.verify(token)).toThrow(UnauthorizedError);
      } finally {
        Date.now = realNow;
      }
    });
  });
});

describe('parseDuration', () => {
  it('parses unit suffixes into seconds', () => {
    expect(parseDuration('30s')).toBe(30);
    expect(parseDuration('15m')).toBe(900);
    expect(parseDuration('2h')).toBe(7200);
    expect(parseDuration('30d')).toBe(2_592_000);
  });

  it('treats a bare number as seconds', () => {
    expect(parseDuration('900')).toBe(900);
  });

  it('throws ConfigError on an uninterpretable value', () => {
    expect(() => parseDuration('soon')).toThrow(ConfigError);
    expect(() => parseDuration('15x')).toThrow(ConfigError);
  });
});
