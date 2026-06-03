import { and, eq } from 'drizzle-orm';
import { InvalidArgumentError } from '../common/errors';
import type { AuthUser } from '../auth/auth.types';
import type { Database } from '../db/db.types';
import { audits } from '../db/schema';
import { AuditRepository } from './audit.repository';

/** A non-admin principal: ownership-scoped reads must restrict to their id. */
const USER: AuthUser = {
  id: 'user-1',
  email: 'user@example.com',
  role: 'user',
  tokenVersion: 0,
};
/** An admin principal: ownership-scoped reads must BYPASS the owner predicate. */
const ADMIN: AuthUser = {
  id: 'admin-1',
  email: 'admin@example.com',
  role: 'admin',
  tokenVersion: 0,
};

describe('AuditRepository', () => {
  describe('findById', () => {
    function mockSelectDb(rows: unknown[]) {
      const limit = jest.fn().mockResolvedValue(rows);
      const where = jest.fn().mockReturnValue({ limit });
      const from = jest.fn().mockReturnValue({ where });
      const select = jest.fn().mockReturnValue({ from });
      const db = { select } as unknown as Database;
      return { db, select, from, where, limit };
    }

    it('returns the first matching audit row', async () => {
      const audit = { id: 'abc', startUrl: 'https://example.com/' };
      const { db } = mockSelectDb([audit]);
      const repo = new AuditRepository(db);

      await expect(repo.findById('abc')).resolves.toBe(audit);
    });

    it('returns undefined when no row matches', async () => {
      const { db } = mockSelectDb([]);
      const repo = new AuditRepository(db);

      await expect(repo.findById('missing')).resolves.toBeUndefined();
    });
  });

  // Shared select-chain mock that also CAPTURES the WHERE predicate, so the
  // ownership-aware lookups can be checked against the exact drizzle condition
  // they build (admin: id-only; user: id AND ownerId).
  function mockSelectDb(rows: unknown[]) {
    const limit = jest.fn().mockResolvedValue(rows);
    const where = jest.fn().mockReturnValue({ limit });
    const from = jest.fn().mockReturnValue({ where });
    const select = jest.fn().mockReturnValue({ from });
    const db = { select } as unknown as Database;
    return { db, where };
  }

  describe('findByIdForUser (Phase A3)', () => {
    it('scopes a non-admin to id AND ownerId, returning the row when owned', async () => {
      const audit = { id: 'abc', ownerId: USER.id };
      const { db, where } = mockSelectDb([audit]);
      const repo = new AuditRepository(db);

      await expect(repo.findByIdForUser('abc', USER)).resolves.toBe(audit);
      // Predicate is `id = abc AND owner_id = user.id` (owner cannot see others').
      expect(where).toHaveBeenCalledTimes(1);
      expect(where.mock.calls[0][0]).toEqual(
        and(eq(audits.id, 'abc'), eq(audits.ownerId, USER.id)),
      );
    });

    it('returns undefined for a non-admin when the row is owned by someone else', async () => {
      // The owner predicate excludes the row, so the driver returns no rows.
      const { db } = mockSelectDb([]);
      const repo = new AuditRepository(db);

      await expect(repo.findByIdForUser('abc', USER)).resolves.toBeUndefined();
    });

    it('bypasses the owner predicate for an admin (id-only), returning any row', async () => {
      const audit = { id: 'abc', ownerId: 'somebody-else' };
      const { db, where } = mockSelectDb([audit]);
      const repo = new AuditRepository(db);

      await expect(repo.findByIdForUser('abc', ADMIN)).resolves.toBe(audit);
      // Admin predicate is id-only — no owner restriction.
      expect(where.mock.calls[0][0]).toEqual(eq(audits.id, 'abc'));
    });

    it('returns undefined when the id does not exist at all', async () => {
      const { db } = mockSelectDb([]);
      const repo = new AuditRepository(db);

      await expect(repo.findByIdForUser('missing', ADMIN)).resolves.toBeUndefined();
    });
  });

  describe('assertOwnedBy (Phase A3)', () => {
    it('returns the audit when the non-admin owns it', async () => {
      const audit = { id: 'abc', ownerId: USER.id };
      const { db } = mockSelectDb([audit]);
      const repo = new AuditRepository(db);

      await expect(repo.assertOwnedBy('abc', USER)).resolves.toBe(audit);
    });

    it('returns the audit for an admin regardless of owner', async () => {
      const audit = { id: 'abc', ownerId: 'somebody-else' };
      const { db } = mockSelectDb([audit]);
      const repo = new AuditRepository(db);

      await expect(repo.assertOwnedBy('abc', ADMIN)).resolves.toBe(audit);
    });

    it('throws (not-found, NOT forbidden) for a non-owner so existence is not leaked', async () => {
      // §8: cross-user case is indistinguishable from missing — funnels through
      // the same not-found error (A4 maps it to 404), never a ForbiddenError.
      const { db } = mockSelectDb([]);
      const repo = new AuditRepository(db);

      await expect(repo.assertOwnedBy('abc', USER)).rejects.toBeInstanceOf(InvalidArgumentError);
    });
  });

  describe('setStatus', () => {
    function mockUpdateDb() {
      const where = jest.fn().mockResolvedValue(undefined);
      const set = jest.fn().mockReturnValue({ where });
      const update = jest.fn().mockReturnValue({ set });
      const db = { update } as unknown as Database;
      return { db, update, set, where };
    }

    it('sets the status and bumps updatedAt', async () => {
      const { db, set } = mockUpdateDb();
      const repo = new AuditRepository(db);

      await repo.setStatus('abc', 'crawling');

      expect(set).toHaveBeenCalledTimes(1);
      const arg = set.mock.calls[0][0] as { status: string; updatedAt: Date };
      expect(arg.status).toBe('crawling');
      expect(arg.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('markFailed', () => {
    function mockUpdateDb() {
      const where = jest.fn().mockResolvedValue(undefined);
      const set = jest.fn().mockReturnValue({ where });
      const update = jest.fn().mockReturnValue({ set });
      const db = { update } as unknown as Database;
      return { db, update, set, where };
    }

    it("sets status='failed', failedStage and updatedAt", async () => {
      const { db, set } = mockUpdateDb();
      const repo = new AuditRepository(db);

      await repo.markFailed('abc', 'crawl');

      const arg = set.mock.calls[0][0] as {
        status: string;
        failedStage: string;
        updatedAt: Date;
      };
      expect(arg.status).toBe('failed');
      expect(arg.failedStage).toBe('crawl');
      expect(arg.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('assertExists', () => {
    function mockSelectDb(rows: unknown[]) {
      const limit = jest.fn().mockResolvedValue(rows);
      const where = jest.fn().mockReturnValue({ limit });
      const from = jest.fn().mockReturnValue({ where });
      const select = jest.fn().mockReturnValue({ from });
      const db = { select } as unknown as Database;
      return { db };
    }

    it('returns the audit when it exists', async () => {
      const audit = { id: 'abc' };
      const { db } = mockSelectDb([audit]);
      const repo = new AuditRepository(db);

      await expect(repo.assertExists('abc')).resolves.toBe(audit);
    });

    it('throws InvalidArgumentError with an actionable message when missing', async () => {
      const { db } = mockSelectDb([]);
      const repo = new AuditRepository(db);

      await expect(repo.assertExists('missing')).rejects.toBeInstanceOf(InvalidArgumentError);
      await expect(repo.assertExists('missing')).rejects.toThrow(/audit:create/);
    });
  });
});
