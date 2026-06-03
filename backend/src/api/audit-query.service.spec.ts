import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { AuthUser } from '../auth/auth.types';
import type { Database } from '../db/db.types';
import { AuditQueryService } from './audit-query.service';

/**
 * Unit tests for {@link AuditQueryService}'s Phase A3 owner-scoping. The service
 * only talks to Postgres via `db.execute(sql\`...\`)`, so we mock `execute`,
 * CAPTURE the `SQL` fragments it receives, and render them to text+params with
 * drizzle's {@link PgDialect}. That lets us prove — without a live DB — that:
 *   - a non-admin's queries carry `owner_id = $<their id>`, and
 *   - an admin's queries DO NOT (the predicate collapses to `true`).
 *
 * The DB-backed behavioral coverage (real rows, real scoping) lives in
 * audit-query.service.int-spec.ts; this spec pins the SQL the service emits.
 */

const DIALECT = new PgDialect();

const USER: AuthUser = {
  id: 'user-1',
  email: 'user@example.com',
  role: 'user',
  tokenVersion: 0,
};
const ADMIN: AuthUser = {
  id: 'admin-1',
  email: 'admin@example.com',
  role: 'admin',
  tokenVersion: 0,
};

/** Render every captured SQL fragment to its parameterized text + bound params. */
function renderedQueries(execute: jest.Mock): { sql: string; params: unknown[] }[] {
  return execute.mock.calls.map((call) => {
    const built = DIALECT.sqlToQuery(call[0] as SQL);
    return { sql: built.sql, params: built.params };
  });
}

/** A mocked db whose `execute` returns canned `{ rows }`, sequenced per call. */
function buildService(rowsPerCall: unknown[][]) {
  let call = 0;
  const execute = jest.fn().mockImplementation(() => {
    const rows = rowsPerCall[call] ?? [];
    call += 1;
    return Promise.resolve({ rows });
  });
  const db = { execute } as unknown as Database;
  const service = new AuditQueryService(db);
  return { service, execute };
}

describe('AuditQueryService.listAudits (owner scope, Phase A3)', () => {
  it('restricts a non-admin to their own owner_id (page AND count queries)', async () => {
    // call 0 = page rows, call 1 = count row.
    const { service, execute } = buildService([[], [{ total: '0' }]]);

    await service.listAudits({ limit: 50, offset: 0 }, USER);

    const queries = renderedQueries(execute);
    expect(queries).toHaveLength(2);
    // Both the page and the count carry the SAME owner predicate (so total is
    // consistent with the visible rows) with the caller's id bound as a param.
    for (const q of queries) {
      expect(q.sql).toContain('owner_id = $');
      expect(q.params).toContain(USER.id);
    }
  });

  it('does NOT scope by owner for an admin (predicate collapses to true)', async () => {
    const { service, execute } = buildService([[], [{ total: '0' }]]);

    await service.listAudits({ limit: 50, offset: 0 }, ADMIN);

    const queries = renderedQueries(execute);
    for (const q of queries) {
      expect(q.sql).not.toContain('owner_id =');
      expect(q.sql).toContain('true');
      expect(q.params).not.toContain(ADMIN.id);
    }
  });
});

describe('AuditQueryService.getAudit (owner scope, Phase A3)', () => {
  it('adds owner_id to the audit lookup for a non-admin', async () => {
    // call 0 = audit row (missing → short-circuits before the findings query).
    const { service, execute } = buildService([[]]);

    const result = await service.getAudit('aid', USER);

    expect(result).toBeUndefined();
    const [auditQuery] = renderedQueries(execute);
    expect(auditQuery.sql).toContain('owner_id = $');
    expect(auditQuery.params).toContain('aid');
    expect(auditQuery.params).toContain(USER.id);
  });

  it('omits the owner predicate for an admin', async () => {
    const { service, execute } = buildService([[]]);

    await service.getAudit('aid', ADMIN);

    const [auditQuery] = renderedQueries(execute);
    expect(auditQuery.sql).not.toContain('owner_id =');
    expect(auditQuery.params).not.toContain(ADMIN.id);
  });

  it('returns the detail (with zero-filled severities) when the scoped audit is visible', async () => {
    const auditRow = {
      id: 'aid',
      start_url: 'https://example.com/',
      status: 'done',
      failed_stage: null,
      report_path: null,
      created_at: '2026-06-02T00:00:00.000Z',
      updated_at: '2026-06-02T00:00:00.000Z',
    };
    // call 0 = audit row, call 1 = bySeverity group rows.
    const { service } = buildService([[auditRow], [{ severity: 'high', count: '2' }]]);

    const result = await service.getAudit('aid', USER);

    expect(result?.id).toBe('aid');
    expect(result?.findingsTotal).toBe(2);
    expect(result?.bySeverity).toEqual({ critical: 0, high: 2, medium: 0, low: 0, info: 0 });
  });
});

describe('AuditQueryService.auditExists (owner scope, Phase A3)', () => {
  it('scopes the existence check to the caller for a non-admin', async () => {
    const { service, execute } = buildService([[{ '?column?': 1 }]]);

    await expect(service.auditExists('aid', USER)).resolves.toBe(true);

    const [q] = renderedQueries(execute);
    expect(q.sql).toContain('owner_id = $');
    expect(q.params).toContain(USER.id);
  });

  it('returns false when the scoped existence check matches nothing', async () => {
    const { service } = buildService([[]]);

    await expect(service.auditExists('aid', USER)).resolves.toBe(false);
  });

  it('omits the owner predicate for an admin', async () => {
    const { service, execute } = buildService([[{ '?column?': 1 }]]);

    await expect(service.auditExists('aid', ADMIN)).resolves.toBe(true);

    const [q] = renderedQueries(execute);
    expect(q.sql).not.toContain('owner_id =');
    expect(q.params).not.toContain(ADMIN.id);
  });
});
