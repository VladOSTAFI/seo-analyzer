import { type ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { AuthUser } from './auth.types';

/**
 * Request shape after {@link import('./jwt-auth.guard').JwtAuthGuard} has run:
 * the verified principal is attached as `req.user`. Declared locally so this
 * decorator stays free of an `@types/express` dependency (matching how
 * app-error.filter.ts types only the slice it touches).
 */
interface RequestWithUser {
  user?: AuthUser;
}

/**
 * Param decorator (Phase A2) that returns the authenticated {@link AuthUser}
 * attached to the request by the global JwtAuthGuard. Only valid on routes the
 * guard protects — on a `@Public()` route `req.user` is undefined.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    return request.user;
  },
);
