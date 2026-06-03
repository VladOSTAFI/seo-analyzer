import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ForbiddenError } from '../common/errors';
import type { AuthUser, Role } from './auth.types';
import { ROLES_KEY } from './roles.decorator';
import { RolesGuard } from './roles.guard';

/**
 * Unit tests for {@link RolesGuard}. Hand-rolled ExecutionContext + a real
 * {@link Reflector} whose `getAllAndOverride` is stubbed to return the required
 * roles for the route. Asserts:
 *  - no `@Roles(...)` → allow;
 *  - matching role → allow;
 *  - wrong/absent role → DOMAIN {@link ForbiddenError} (→ 403), never a raw
 *    HttpException.
 */

const USER: AuthUser = {
  id: 'user-1111',
  email: 'user@example.com',
  role: 'user',
  tokenVersion: 0,
};

const ADMIN: AuthUser = {
  id: 'admin-2222',
  email: 'admin@example.com',
  role: 'admin',
  tokenVersion: 0,
};

function contextFor(user: AuthUser | undefined): ExecutionContext {
  const request = { user };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function buildGuard(required: Role[] | undefined) {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(required);
  const guard = new RolesGuard(reflector);
  return { guard, reflector };
}

describe('RolesGuard', () => {
  it('allows the route when no roles are required (undefined metadata)', () => {
    const { guard, reflector } = buildGuard(undefined);

    expect(guard.canActivate(contextFor(USER))).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, expect.any(Array));
  });

  it('allows the route when the required-roles array is empty', () => {
    const { guard } = buildGuard([]);
    expect(guard.canActivate(contextFor(USER))).toBe(true);
  });

  it('allows when the principal has a required role', () => {
    const { guard } = buildGuard(['admin']);
    expect(guard.canActivate(contextFor(ADMIN))).toBe(true);
  });

  it('throws ForbiddenError (domain error → 403) when the role does not match', () => {
    const { guard } = buildGuard(['admin']);
    expect(() => guard.canActivate(contextFor(USER))).toThrow(ForbiddenError);
  });

  it('throws ForbiddenError when there is no principal but roles are required', () => {
    const { guard } = buildGuard(['admin']);
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(ForbiddenError);
  });
});
