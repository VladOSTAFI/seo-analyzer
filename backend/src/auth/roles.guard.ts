import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ForbiddenError } from '../common/errors';
import type { AuthUser, Role } from './auth.types';
import { ROLES_KEY } from './roles.decorator';

/**
 * Request slice this guard touches: the principal the global
 * {@link import('./jwt-auth.guard').JwtAuthGuard} (A2) has already attached.
 * Typed locally so the guard stays free of an `@types/express` dependency (same
 * posture as jwt-auth.guard.ts / current-user.decorator.ts).
 */
interface RequestWithUser {
  user?: AuthUser;
}

/**
 * Role gate (Phase A4). Applied per-route via `@UseGuards(RolesGuard)` together
 * with `@Roles('admin', ...)`; reads the required roles from the handler/class
 * metadata.
 *
 *  - No `@Roles(...)` on the route → allow (the role gate is opt-in; auth and
 *    ownership still apply via their own guards).
 *  - `@Roles(...)` present → allow only if `req.user.role` is one of them,
 *    otherwise raise a {@link ForbiddenError} (→ 403 via AppErrorFilter). We
 *    throw the DOMAIN error, never a raw HttpException, matching the codebase's
 *    error-mapping convention.
 *
 * Ordering note: this guard assumes authentication ran first (the global
 * JwtAuthGuard populates `req.user`). A missing principal here means the route was
 * reached unauthenticated — treated as forbidden rather than silently allowed.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No roles required → the role gate does not apply to this route.
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenError('You do not have permission to perform this action.');
    }
    return true;
  }
}
