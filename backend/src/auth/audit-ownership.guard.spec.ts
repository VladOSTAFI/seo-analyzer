import { type ExecutionContext, NotFoundException } from '@nestjs/common';
import type { AuditRepository } from '../audit/audit.repository';
import type { Audit } from '../db/schema';
import type { AuthUser } from './auth.types';
import { AuditOwnershipGuard } from './audit-ownership.guard';

/**
 * Unit tests for {@link AuditOwnershipGuard}. Built WITHOUT a Nest test module:
 * the guard is a thin wrapper over {@link AuditRepository.findByIdForUser}, so we
 * hand-roll a mocked ExecutionContext + repo and instantiate it directly.
 *
 * The security-critical assertion (AUTHORIZATION_PLAN §8) is that a cross-user or
 * missing id resolves to a **404 (NotFoundException), NOT a 403**, so ids can't be
 * enumerated. The repo's findByIdForUser already encodes admin-bypass +
 * owner-only and returns `undefined` for both missing and cross-user — the guard
 * maps that single `undefined` onto the 404.
 */

const AUDIT_ID = '11111111-2222-3333-4444-555555555555';

const OWNER: AuthUser = {
  id: 'owner-1111-2222-3333-444444444444',
  email: 'owner@example.com',
  role: 'user',
  tokenVersion: 0,
};

const OTHER: AuthUser = {
  id: 'other-9999-8888-7777-666666666666',
  email: 'other@example.com',
  role: 'user',
  tokenVersion: 0,
};

const ADMIN: AuthUser = {
  id: 'admin-aaaa-bbbb-cccc-dddddddddddd',
  email: 'admin@example.com',
  role: 'admin',
  tokenVersion: 0,
};

/** A minimal audit row stand-in (only identity/ownership matter to the guard). */
function auditRow(ownerId: string | null): Audit {
  return {
    id: AUDIT_ID,
    ownerId,
  } as unknown as Audit;
}

/** Build a mocked ExecutionContext exposing `params.id` + `req.user`. */
function contextFor(id: string | undefined, user: AuthUser | undefined): ExecutionContext {
  const request = { params: { id }, user };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function buildGuard() {
  const repo = {
    findByIdForUser: jest.fn(),
  } as unknown as jest.Mocked<Pick<AuditRepository, 'findByIdForUser'>>;
  const guard = new AuditOwnershipGuard(repo as unknown as AuditRepository);
  return { guard, repo };
}

describe('AuditOwnershipGuard', () => {
  it('allows the owner (repo returns the audit) and forwards id + principal', async () => {
    const { guard, repo } = buildGuard();
    repo.findByIdForUser.mockResolvedValue(auditRow(OWNER.id));

    await expect(guard.canActivate(contextFor(AUDIT_ID, OWNER))).resolves.toBe(true);
    expect(repo.findByIdForUser).toHaveBeenCalledWith(AUDIT_ID, OWNER);
  });

  it('allows an admin (repo bypasses the owner predicate and returns the audit)', async () => {
    const { guard, repo } = buildGuard();
    repo.findByIdForUser.mockResolvedValue(auditRow(OWNER.id));

    await expect(guard.canActivate(contextFor(AUDIT_ID, ADMIN))).resolves.toBe(true);
    expect(repo.findByIdForUser).toHaveBeenCalledWith(AUDIT_ID, ADMIN);
  });

  it('rejects a cross-user read with 404 (NotFoundException), NOT 403, to avoid id enumeration', async () => {
    const { guard, repo } = buildGuard();
    // findByIdForUser returns undefined for an id owned by someone else.
    repo.findByIdForUser.mockResolvedValue(undefined);

    const promise = guard.canActivate(contextFor(AUDIT_ID, OTHER));
    await expect(promise).rejects.toBeInstanceOf(NotFoundException);
    // Prove it is specifically the not-found (404) error, never a forbidden (403).
    await expect(promise).rejects.toMatchObject({ status: 404 });
    expect(repo.findByIdForUser).toHaveBeenCalledWith(AUDIT_ID, OTHER);
  });

  it('rejects a missing id with 404 (indistinguishable from cross-user)', async () => {
    const { guard, repo } = buildGuard();
    repo.findByIdForUser.mockResolvedValue(undefined);

    await expect(guard.canActivate(contextFor(AUDIT_ID, OWNER))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects with 404 when the principal is absent (auth did not populate req.user)', async () => {
    const { guard, repo } = buildGuard();

    await expect(guard.canActivate(contextFor(AUDIT_ID, undefined))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    // Never reaches the repo when there is no principal.
    expect(repo.findByIdForUser).not.toHaveBeenCalled();
  });

  it('rejects with 404 when the :id param is missing', async () => {
    const { guard, repo } = buildGuard();

    await expect(guard.canActivate(contextFor(undefined, OWNER))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.findByIdForUser).not.toHaveBeenCalled();
  });
});
