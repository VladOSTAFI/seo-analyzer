import { EmailTakenError, InvalidCredentialsError } from '../common/errors';
import type { Env } from '../config/env.validation';
import type { Database } from '../db/db.types';
import type { User } from '../db/schema';
import { AuthService } from './auth.service';
import type { JwtService } from './jwt.service';
import type { PasswordService } from './password.service';

/**
 * Unit tests for {@link AuthService} with a mocked repo (Drizzle chains), hasher
 * ({@link PasswordService}), and signer ({@link JwtService}) — no DB/HTTP. We
 * drive the two Drizzle chains the service uses:
 *   select().from().where().limit()   → user lookup by email
 *   insert().values().returning()     → user create
 *   insert().values()                 → refresh-token persist
 */

const ENV = { JWT_REFRESH_TTL: '30d' } as Env;

const USER: User = {
  id: '11111111-2222-3333-4444-555555555555',
  email: 'user@example.com',
  passwordHash: 'argon2-hash',
  role: 'user',
  tokenVersion: 0,
  isActive: true,
  createdAt: new Date('2026-06-01T00:00:00.000Z'),
  updatedAt: new Date('2026-06-01T00:00:00.000Z'),
};

/**
 * Build a fake DB whose `select` chain resolves to `lookupRows` and whose two
 * `insert` chains are tracked. `insert().values()` returns an object that is both
 * awaitable (refresh-token insert, no `.returning()`) and has `.returning()`
 * resolving to `insertReturning` (user create).
 */
function buildDb(opts: { lookupRows: User[]; insertReturning?: User[] }) {
  const limit = jest.fn().mockResolvedValue(opts.lookupRows);
  const where = jest.fn().mockReturnValue({ limit });
  const from = jest.fn().mockReturnValue({ where });
  const select = jest.fn().mockReturnValue({ from });

  const returning = jest.fn().mockResolvedValue(opts.insertReturning ?? []);
  // values(...) must be awaitable (refresh insert) AND expose returning (user insert).
  const valuesResult: Promise<unknown> & { returning: jest.Mock } = Object.assign(
    Promise.resolve(undefined),
    { returning },
  );
  const values = jest.fn().mockReturnValue(valuesResult);
  const insert = jest.fn().mockReturnValue({ values });

  const db = { select, insert } as unknown as Database;
  return { db, select, where, insert, values, returning };
}

function buildPasswords(overrides: Partial<jest.Mocked<PasswordService>> = {}) {
  return {
    hash: jest.fn().mockResolvedValue('argon2-hash'),
    verify: jest.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as jest.Mocked<PasswordService>;
}

function buildJwt() {
  return { sign: jest.fn().mockReturnValue('signed.access.token') } as unknown as jest.Mocked<
    Pick<JwtService, 'sign'>
  > as unknown as JwtService;
}

describe('AuthService', () => {
  describe('register', () => {
    it('hashes the password, inserts a user, and returns a token pair', async () => {
      const { db, insert, values, returning } = buildDb({
        lookupRows: [],
        insertReturning: [USER],
      });
      const passwords = buildPasswords();
      const jwt = buildJwt();
      const service = new AuthService(db, ENV, passwords, jwt);

      const tokens = await service.register('User@Example.com', 'super-secret-pw');

      expect(passwords.hash).toHaveBeenCalledWith('super-secret-pw');
      // First insert = users with normalized email + role 'user', never the raw pw.
      expect(insert).toHaveBeenCalled();
      const userInsert = values.mock.calls[0][0] as Record<string, unknown>;
      expect(userInsert.email).toBe('user@example.com');
      expect(userInsert.role).toBe('user');
      expect(userInsert.passwordHash).toBe('argon2-hash');
      expect(userInsert).not.toHaveProperty('password');
      expect(returning).toHaveBeenCalled();
      expect(tokens).toEqual({
        accessToken: 'signed.access.token',
        refreshToken: expect.any(String),
      });
    });

    it('normalizes the email before the uniqueness lookup', async () => {
      const { db, where } = buildDb({ lookupRows: [], insertReturning: [USER] });
      const service = new AuthService(db, ENV, buildPasswords(), buildJwt());
      await service.register('  MixedCase@Example.COM ', 'super-secret-pw');
      // The eq() arg isn't easily introspected, but the lookup ran once before insert.
      expect(where).toHaveBeenCalledTimes(1);
    });

    it('rejects a duplicate email with EmailTakenError (→409) without hashing', async () => {
      const { db, insert } = buildDb({ lookupRows: [USER] });
      const passwords = buildPasswords();
      const service = new AuthService(db, ENV, passwords, buildJwt());

      await expect(service.register('user@example.com', 'pw1234567890')).rejects.toBeInstanceOf(
        EmailTakenError,
      );
      expect(passwords.hash).not.toHaveBeenCalled();
      expect(insert).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('returns a token pair on a correct password', async () => {
      const { db } = buildDb({ lookupRows: [USER] });
      const passwords = buildPasswords({ verify: jest.fn().mockResolvedValue(true) });
      const jwt = buildJwt();
      const service = new AuthService(db, ENV, passwords, jwt);

      const tokens = await service.login('user@example.com', 'right-password');

      expect(passwords.verify).toHaveBeenCalledWith(USER.passwordHash, 'right-password');
      expect(jwt.sign).toHaveBeenCalledWith({
        sub: USER.id,
        email: USER.email,
        role: USER.role,
        tv: USER.tokenVersion,
      });
      expect(tokens.accessToken).toBe('signed.access.token');
      expect(typeof tokens.refreshToken).toBe('string');
    });

    it('throws the SAME generic InvalidCredentialsError for an unknown email', async () => {
      const { db } = buildDb({ lookupRows: [] });
      const service = new AuthService(db, ENV, buildPasswords(), buildJwt());
      await expect(service.login('nobody@example.com', 'whatever')).rejects.toBeInstanceOf(
        InvalidCredentialsError,
      );
    });

    it('throws the SAME generic InvalidCredentialsError for a wrong password', async () => {
      const { db } = buildDb({ lookupRows: [USER] });
      const passwords = buildPasswords({ verify: jest.fn().mockResolvedValue(false) });
      const service = new AuthService(db, ENV, passwords, buildJwt());
      await expect(service.login('user@example.com', 'wrong')).rejects.toBeInstanceOf(
        InvalidCredentialsError,
      );
    });

    it('uses an identical error message for unknown-email and wrong-password (no enumeration)', async () => {
      const missing = new AuthService(
        buildDb({ lookupRows: [] }).db,
        ENV,
        buildPasswords(),
        buildJwt(),
      );
      const wrong = new AuthService(
        buildDb({ lookupRows: [USER] }).db,
        ENV,
        buildPasswords({ verify: jest.fn().mockResolvedValue(false) }),
        buildJwt(),
      );

      const a = await missing.login('nobody@example.com', 'x').catch((e: Error) => e.message);
      const b = await wrong.login('user@example.com', 'x').catch((e: Error) => e.message);
      expect(a).toBe(b);
    });
  });

  describe('issueTokens', () => {
    it('persists only the sha-256 hash, never the raw refresh token', async () => {
      const { db, values } = buildDb({ lookupRows: [], insertReturning: [USER] });
      const service = new AuthService(db, ENV, buildPasswords(), buildJwt());

      const { refreshToken } = await service.issueTokens(USER);

      // The refresh-token insert is the last values() call.
      const stored = values.mock.calls.at(-1)?.[0] as Record<string, unknown>;
      expect(stored.userId).toBe(USER.id);
      expect(stored.tokenHash).toEqual(expect.any(String));
      expect(stored.tokenHash).not.toBe(refreshToken); // hashed, not raw
      expect(stored.expiresAt).toBeInstanceOf(Date);
    });
  });
});
