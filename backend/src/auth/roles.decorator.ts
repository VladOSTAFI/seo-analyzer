import { SetMetadata } from '@nestjs/common';
import type { Role } from './auth.types';

/**
 * Metadata key the {@link import('./roles.guard').RolesGuard} reads to discover
 * which roles a route requires. Exported so the guard's
 * `Reflector.getAllAndOverride` and any test reference one canonical string
 * (mirrors `IS_PUBLIC_KEY` in public.decorator.ts).
 */
export const ROLES_KEY = 'roles';

/**
 * Restricts a route handler (or an entire controller class) to the listed roles
 * (Phase A4). The {@link import('./roles.guard').RolesGuard} allows the request
 * only when `req.user.role` is one of these; otherwise it raises a
 * {@link import('../common/errors').ForbiddenError} (→ 403).
 *
 * A route with NO `@Roles(...)` is unrestricted by the role gate (ownership and
 * authentication still apply). No admin-only route exists yet — this decorator is
 * provided so any future "admin can manage users"-style route can opt in.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
