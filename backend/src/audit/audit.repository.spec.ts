import { InvalidArgumentError } from '../common/errors';
import type { Database } from '../db/db.types';
import { AuditRepository } from './audit.repository';

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
