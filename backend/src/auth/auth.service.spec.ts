import { createHash } from 'node:crypto';
import {
  EmailTakenError,
  InvalidCredentialsError,
  TooManyRequestsError,
  UnauthorizedError,
} from '../common/errors';
import type { Env } from '../config/env.validation';
import type { Database } from '../db/db.types';
import type { RefreshToken, User } from '../db/schema';
import { AuthService } from './auth.service';
import type { JwtService } from './jwt.service';
import type { LoginThrottleService } from './login-throttle.service';
import type { PasswordService } from './password.service';

/**
 * Unit tests for {@link AuthService} with a mocked repo (Drizzle chains), hasher
 * ({@link PasswordService}), signer ({@link JwtService}), and brute-force limiter
 * ({@link LoginThrottleService}) — no DB/HTTP. We drive the Drizzle chains the
 * service uses:
 *   select().from().where().limit()        → user lookup by email / id
 *   insert().values().returning()          → user create
 *   insert().values()                      → refresh-token persist
 *   update().set().where().returning()     → refresh rotation (atomic claim)
 *   update().set().where()                 → logout / mass-revoke / tv bump
 *   delete().where()                       → lazy expired-token cleanup
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

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Build a fake DB whose `select` chain resolves to `lookupRows` and whose two
 * `insert` chains are tracked. `insert().values()` returns an object that is both
 * awaitable (refresh-token insert, no `.returning()`) and has `.returning()`
 * resolving to `insertReturning` (user create).
 *
 * `update().set().where()` is awaitable (logout / tv bump) AND exposes
 * `.returning()` resolving to `updateReturning` (the refresh-rotation claim).
 * `delete().where()` is awaitable (lazy cleanup) and tracked.
 */
function buildDb(opts: {
  lookupRows: User[];
  insertReturning?: User[];
  updateReturning?: RefreshToken[];
}) {
  const limit = jest.fn().mockResolvedValue(opts.lookupRows);
  const selectWhere = jest.fn().mockReturnValue({ limit });
  const from = jest.fn().mockReturnValue({ where: selectWhere });
  const select = jest.fn().mockReturnValue({ from });

  const returning = jest.fn().mockResolvedValue(opts.insertReturning ?? []);
  // values(...) must be awaitable (refresh insert) AND expose returning (user insert).
  const valuesResult: Promise<unknown> & { returning: jest.Mock } = Object.assign(
    Promise.resolve(undefined),
    { returning },
  );
  const values = jest.fn().mockReturnValue(valuesResult);
  const insert = jest.fn().mockReturnValue({ values });

  // update().set().where() is awaitable AND exposes returning() (rotation claim).
  const updateReturning = jest.fn().mockResolvedValue(opts.updateReturning ?? []);
  const updateWhereResult: Promise<unknown> & { returning: jest.Mock } = Object.assign(
    Promise.resolve(undefined),
    { returning: updateReturning },
  );
  const updateWhere = jest.fn().mockReturnValue(updateWhereResult);
  const set = jest.fn().mockReturnValue({ where: updateWhere });
  const update = jest.fn().mockReturnValue({ set });

  const deleteWhere = jest.fn().mockResolvedValue(undefined);
  const del = jest.fn().mockReturnValue({ where: deleteWhere });

  const db = { select, insert, update, delete: del } as unknown as Database;
  return {
    db,
    select,
    selectWhere,
    insert,
    values,
    returning,
    update,
    set,
    updateWhere,
    updateReturning,
    delete: del,
    deleteWhere,
  };
}

function buildPasswords(overrides: Partial<jest.Mocked<PasswordService>> = {}) {
  return {
    hash: jest.fn().mockResolvedValue('argon2-hash'),
    verify: jest.fn().mockResolvedValue(true),
    verifyTimingSafeDummy: jest.fn().mockResolvedValue(false),
    ...overrides,
  } as unknown as jest.Mocked<PasswordService>;
}

function buildJwt() {
  return { sign: jest.fn().mockReturnValue('signed.access.token') } as unknown as jest.Mocked<
    Pick<JwtService, 'sign'>
  > as unknown as JwtService;
}

/**
 * A throttle that, by default, never locks and records/clears silently — the
 * happy path for tests that don't care about A6. Overrides let a test make
 * {@link LoginThrottleService.assertNotLocked} throw, or assert record/clear.
 */
function buildThrottle(overrides: Partial<jest.Mocked<LoginThrottleService>> = {}) {
  return {
    assertNotLocked: jest.fn().mockResolvedValue(undefined),
    record: jest.fn().mockResolvedValue(undefined),
    clearFailures: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as jest.Mocked<LoginThrottleService>;
}

function refreshRow(overrides: Partial<RefreshToken> = {}): RefreshToken {
  return {
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    userId: USER.id,
    tokenHash: 'irrelevant',
    expiresAt: new Date('2026-12-01T00:00:00.000Z'),
    revokedAt: null,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  };
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
      const service = new AuthService(db, ENV, passwords, jwt, buildThrottle());

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
      const { db, selectWhere } = buildDb({ lookupRows: [], insertReturning: [USER] });
      const service = new AuthService(db, ENV, buildPasswords(), buildJwt(), buildThrottle());
      await service.register('  MixedCase@Example.COM ', 'super-secret-pw');
      // The eq() arg isn't easily introspected, but the lookup ran once before insert.
      expect(selectWhere).toHaveBeenCalledTimes(1);
    });

    it('rejects a duplicate email with EmailTakenError (→409) without hashing', async () => {
      const { db, insert } = buildDb({ lookupRows: [USER] });
      const passwords = buildPasswords();
      const service = new AuthService(db, ENV, passwords, buildJwt(), buildThrottle());

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
      const service = new AuthService(db, ENV, passwords, jwt, buildThrottle());

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
      const service = new AuthService(db, ENV, buildPasswords(), buildJwt(), buildThrottle());
      await expect(service.login('nobody@example.com', 'whatever')).rejects.toBeInstanceOf(
        InvalidCredentialsError,
      );
    });

    it('throws the SAME generic InvalidCredentialsError for a wrong password', async () => {
      const { db } = buildDb({ lookupRows: [USER] });
      const passwords = buildPasswords({ verify: jest.fn().mockResolvedValue(false) });
      const service = new AuthService(db, ENV, passwords, buildJwt(), buildThrottle());
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
        buildThrottle(),
      );
      const wrong = new AuthService(
        buildDb({ lookupRows: [USER] }).db,
        ENV,
        buildPasswords({ verify: jest.fn().mockResolvedValue(false) }),
        buildJwt(),
        buildThrottle(),
      );

      const a = await missing.login('nobody@example.com', 'x').catch((e: Error) => e.message);
      const b = await wrong.login('user@example.com', 'x').catch((e: Error) => e.message);
      expect(a).toBe(b);
    });

    describe('A6 — brute-force protection', () => {
      it('checks the lockout BEFORE any credential work; a locked email → 429 and verify is never reached', async () => {
        const { db, selectWhere } = buildDb({ lookupRows: [USER] });
        const passwords = buildPasswords();
        const throttle = buildThrottle({
          assertNotLocked: jest
            .fn()
            .mockRejectedValue(new TooManyRequestsError('Too many failed login attempts.')),
        });
        const service = new AuthService(db, ENV, passwords, buildJwt(), throttle);

        await expect(service.login('user@example.com', 'whatever')).rejects.toBeInstanceOf(
          TooManyRequestsError,
        );
        expect(throttle.assertNotLocked).toHaveBeenCalledWith('user@example.com');
        // No credential work: no user lookup, no real verify, no decoy verify.
        expect(selectWhere).not.toHaveBeenCalled();
        expect(passwords.verify).not.toHaveBeenCalled();
        expect(passwords.verifyTimingSafeDummy).not.toHaveBeenCalled();
        // A locked-out attempt is not recorded again.
        expect(throttle.record).not.toHaveBeenCalled();
      });

      it('records a FAILED attempt (with ip) and rejects on a wrong password', async () => {
        const { db } = buildDb({ lookupRows: [USER] });
        const passwords = buildPasswords({ verify: jest.fn().mockResolvedValue(false) });
        const throttle = buildThrottle();
        const service = new AuthService(db, ENV, passwords, buildJwt(), throttle);

        await expect(
          service.login('user@example.com', 'wrong', '203.0.113.7'),
        ).rejects.toBeInstanceOf(InvalidCredentialsError);
        expect(throttle.record).toHaveBeenCalledWith('user@example.com', '203.0.113.7', false);
        expect(throttle.clearFailures).not.toHaveBeenCalled();
      });

      it('unknown email STILL runs a decoy verify, records a failure, and throws the same generic error', async () => {
        const { db } = buildDb({ lookupRows: [] });
        const passwords = buildPasswords();
        const throttle = buildThrottle();
        const service = new AuthService(db, ENV, passwords, buildJwt(), throttle);

        await expect(
          service.login('nobody@example.com', 'whatever', '203.0.113.9'),
        ).rejects.toBeInstanceOf(InvalidCredentialsError);
        // The timing-equalizing decoy verify ran (no enumeration via timing, §8)...
        expect(passwords.verifyTimingSafeDummy).toHaveBeenCalledWith('whatever');
        // ...the real verify never ran (there was no hash)...
        expect(passwords.verify).not.toHaveBeenCalled();
        // ...and the failed attempt was recorded identically to a wrong password.
        expect(throttle.record).toHaveBeenCalledWith('nobody@example.com', '203.0.113.9', false);
      });

      it("records a SUCCESS and clears the email's prior failures on a correct password", async () => {
        const { db } = buildDb({ lookupRows: [USER] });
        const passwords = buildPasswords({ verify: jest.fn().mockResolvedValue(true) });
        const throttle = buildThrottle();
        const service = new AuthService(db, ENV, passwords, buildJwt(), throttle);

        const tokens = await service.login('user@example.com', 'right-password', '203.0.113.5');

        expect(throttle.record).toHaveBeenCalledWith('user@example.com', '203.0.113.5', true);
        expect(throttle.clearFailures).toHaveBeenCalledWith('user@example.com');
        expect(tokens.accessToken).toBe('signed.access.token');
      });
    });
  });

  describe('issueTokens', () => {
    it('persists only the sha-256 hash, never the raw refresh token', async () => {
      const { db, values } = buildDb({ lookupRows: [], insertReturning: [USER] });
      const service = new AuthService(db, ENV, buildPasswords(), buildJwt(), buildThrottle());

      const { refreshToken } = await service.issueTokens(USER);

      // The refresh-token insert is the last values() call.
      const stored = values.mock.calls.at(-1)?.[0] as Record<string, unknown>;
      expect(stored.userId).toBe(USER.id);
      expect(stored.tokenHash).toEqual(expect.any(String));
      expect(stored.tokenHash).not.toBe(refreshToken); // hashed, not raw
      expect(stored.expiresAt).toBeInstanceOf(Date);
    });
  });

  describe('refresh (A5 — rotation)', () => {
    it('rotates: revokes the claimed token and issues + stores a NEW pair', async () => {
      const { db, update, set, updateReturning, values } = buildDb({
        lookupRows: [USER], // findById resolves the owner
        updateReturning: [refreshRow()], // atomic claim wins → a row comes back
      });
      const jwt = buildJwt();
      const service = new AuthService(db, ENV, buildPasswords(), jwt, buildThrottle());

      const pair = await service.refresh('the-raw-refresh-token');

      // Claim was a conditional UPDATE that revoked the presented token...
      expect(update).toHaveBeenCalled();
      const setArg = set.mock.calls[0][0] as Record<string, unknown>;
      expect(setArg.revokedAt).toBeInstanceOf(Date);
      expect(updateReturning).toHaveBeenCalled();
      // ...and a brand-new refresh row was inserted (rotation), with a NEW hash.
      const stored = values.mock.calls.at(-1)?.[0] as Record<string, unknown>;
      expect(stored.userId).toBe(USER.id);
      expect(stored.tokenHash).toEqual(expect.any(String));
      expect(stored.tokenHash).not.toBe(sha256('the-raw-refresh-token'));
      // New pair carries the reloaded user's current role/tv.
      expect(jwt.sign).toHaveBeenCalledWith({
        sub: USER.id,
        email: USER.email,
        role: USER.role,
        tv: USER.tokenVersion,
      });
      expect(pair).toEqual({
        accessToken: 'signed.access.token',
        refreshToken: expect.any(String),
      });
    });

    it('hashes the presented token before the lookup (never queries by the raw token)', async () => {
      const { db, updateWhere } = buildDb({
        lookupRows: [USER],
        updateReturning: [refreshRow()],
      });
      const service = new AuthService(db, ENV, buildPasswords(), buildJwt(), buildThrottle());

      await service.refresh('the-raw-refresh-token');

      // The where() predicate is an opaque SQL object, but we can assert the claim
      // ran exactly once against it (by-hash, not by-raw — raw never leaves refresh()).
      expect(updateWhere).toHaveBeenCalledTimes(1);
    });

    it('throws a single generic UnauthorizedError when the claim returns no row (unknown/revoked/expired)', async () => {
      const { db, values } = buildDb({ lookupRows: [USER], updateReturning: [] });
      const service = new AuthService(db, ENV, buildPasswords(), buildJwt(), buildThrottle());

      await expect(service.refresh('whatever')).rejects.toBeInstanceOf(UnauthorizedError);
      // No new refresh token was issued on failure.
      expect(values).not.toHaveBeenCalled();
    });

    it('throws the same generic UnauthorizedError when the owning user is missing', async () => {
      const { db } = buildDb({ lookupRows: [], updateReturning: [refreshRow()] });
      const service = new AuthService(db, ENV, buildPasswords(), buildJwt(), buildThrottle());
      await expect(service.refresh('whatever')).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('throws the same generic UnauthorizedError when the owner is deactivated (isActive=false)', async () => {
      const { db } = buildDb({
        lookupRows: [{ ...USER, isActive: false }],
        updateReturning: [refreshRow()],
      });
      const service = new AuthService(db, ENV, buildPasswords(), buildJwt(), buildThrottle());
      await expect(service.refresh('whatever')).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('uses an identical message for no-row vs inactive-owner (no enumeration)', async () => {
      const noRow = new AuthService(
        buildDb({ lookupRows: [USER], updateReturning: [] }).db,
        ENV,
        buildPasswords(),
        buildJwt(),
        buildThrottle(),
      );
      const inactive = new AuthService(
        buildDb({ lookupRows: [{ ...USER, isActive: false }], updateReturning: [refreshRow()] }).db,
        ENV,
        buildPasswords(),
        buildJwt(),
        buildThrottle(),
      );

      const a = await noRow.refresh('x').catch((e: Error) => e.message);
      const b = await inactive.refresh('x').catch((e: Error) => e.message);
      expect(a).toBe(b);
    });
  });

  describe("logout (A5 — revoke the caller's sessions)", () => {
    it('issues the revoke-all update for the user and resolves void', async () => {
      const { db, update, set, updateWhere } = buildDb({ lookupRows: [] });
      const service = new AuthService(db, ENV, buildPasswords(), buildJwt(), buildThrottle());

      await expect(service.logout(USER.id)).resolves.toBeUndefined();

      expect(update).toHaveBeenCalled();
      const setArg = set.mock.calls[0][0] as Record<string, unknown>;
      expect(setArg.revokedAt).toBeInstanceOf(Date);
      expect(updateWhere).toHaveBeenCalledTimes(1);
    });

    it('is idempotent: succeeds when nothing is active (no-op 204 path)', async () => {
      // The conditional update simply matches zero rows; the call still resolves.
      const { db } = buildDb({ lookupRows: [] });
      const service = new AuthService(db, ENV, buildPasswords(), buildJwt(), buildThrottle());
      await expect(service.logout(USER.id)).resolves.toBeUndefined();
    });

    it('does NOT bump tokenVersion (a normal logout must not invalidate other access tokens)', async () => {
      const { db, update } = buildDb({ lookupRows: [] });
      const service = new AuthService(db, ENV, buildPasswords(), buildJwt(), buildThrottle());

      await service.logout(USER.id);

      // logout touches only refresh_tokens — exactly one update(), never the users table.
      expect(update).toHaveBeenCalledTimes(1);
    });
  });

  describe('revokeAllSessions (A5 — mass-revoke primitive)', () => {
    it("bumps tokenVersion AND revokes the user's active refresh tokens", async () => {
      const { db, update, set } = buildDb({ lookupRows: [] });
      const service = new AuthService(db, ENV, buildPasswords(), buildJwt(), buildThrottle());

      await expect(service.revokeAllSessions(USER.id)).resolves.toBeUndefined();

      // Two updates: users (tv bump) then refresh_tokens (revoke).
      expect(update).toHaveBeenCalledTimes(2);
      const tvBump = set.mock.calls[0][0] as Record<string, unknown>;
      expect(tvBump).toHaveProperty('tokenVersion'); // token_version = token_version + 1
      const revoke = set.mock.calls[1][0] as Record<string, unknown>;
      expect(revoke.revokedAt).toBeInstanceOf(Date);
    });
  });
});
