import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UnauthorizedError } from '../common/errors';
import { type AuthUser, claimsToAuthUser } from './auth.types';
import { JwtService } from './jwt.service';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * Request slice the guard touches: it reads the `authorization` header and, on
 * success, writes the verified principal to `user`. Typed locally so the guard
 * stays free of an `@types/express` dependency (same posture as
 * app-error.filter.ts / current-user.decorator.ts).
 */
interface RequestWithAuth {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthUser;
}

/**
 * Global authentication guard (Phase A2). Mounted via `APP_GUARD` in
 * {@link import('../api/api.module').ApiModule}, so every REST route is
 * authenticated-by-default; handlers/classes marked `@Public()` opt out.
 *
 * On a protected route it:
 *  1. extracts the bearer token from `Authorization: Bearer <token>`,
 *  2. verifies it via {@link JwtService.verify} (stateless — zero DB round-trips
 *     on the hot path; eager `tokenVersion` validation is deferred to A5),
 *  3. attaches the typed {@link AuthUser} principal to `req.user`.
 *
 * Any defect — missing header, malformed header, invalid/expired/garbage token —
 * raises a single {@link UnauthorizedError} (→ 401 via AppErrorFilter), never
 * leaking which check failed (§8: minimal disclosure).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // Handler metadata overrides class metadata; either marking the route public
    // short-circuits all verification.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const token = extractBearerToken(request.headers.authorization);
    const claims = this.jwt.verify(token);
    request.user = claimsToAuthUser(claims);
    return true;
  }
}

/**
 * Pull the raw token out of an `Authorization: Bearer <token>` header. A missing
 * header, a non-string header, the wrong scheme, or an empty token all raise the
 * SAME {@link UnauthorizedError} as a bad token would — the caller learns only
 * that authentication failed.
 */
function extractBearerToken(header: string | string[] | undefined): string {
  if (typeof header !== 'string') {
    throw new UnauthorizedError('Authentication required.');
  }
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new UnauthorizedError('Authentication required.');
  }
  return token;
}
