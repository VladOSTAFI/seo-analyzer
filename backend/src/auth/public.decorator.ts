import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key the {@link import('./jwt-auth.guard').JwtAuthGuard} reads to decide
 * whether a route opts out of authentication. Exported so the guard's
 * `Reflector.getAllAndOverride` and any test reference one canonical string.
 */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route handler (or an entire controller class) as anonymous-accessible
 * (Phase A2). The globally-mounted JwtAuthGuard skips token verification for any
 * handler/class carrying this metadata.
 *
 * Used on the open auth surface: `register`, `login` (and `refresh` once A5 adds
 * it). Everything else is authenticated-by-default.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
