import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditRepository } from '../audit/audit.repository';
import type { AuthUser } from './auth.types';

/**
 * Request slice this guard touches: the `:id` route param and the principal the
 * global {@link import('./jwt-auth.guard').JwtAuthGuard} (A2) attached. Typed
 * locally so the guard stays free of an `@types/express` dependency (same posture
 * as jwt-auth.guard.ts / current-user.decorator.ts).
 */
interface RequestWithUser {
  params: { id?: string };
  user?: AuthUser;
}

/**
 * Per-resource ownership gate (Phase A4). Applied via
 * `@UseGuards(AuditOwnershipGuard)` on every route carrying an `:id` param
 * (`GET /audits/:id`, `.../findings`, `.../report`). It runs BEFORE the handler,
 * so the request never reaches any business logic — including the report-download
 * `existsSync`/stream in `getReport` — for an audit the caller may not see (§8).
 *
 * Rule (AUTHORIZATION_PLAN §4 / §8):
 *  - admin → bypasses ownership (sees any audit);
 *  - owner → allowed;
 *  - cross-user OR missing id → **404, NOT 403**, so an attacker cannot
 *    enumerate which audit ids exist.
 *
 * It reuses the A3 {@link AuditRepository.findByIdForUser}, which returns
 * `undefined` for BOTH "missing" and "owned by someone else" (the two are
 * deliberately indistinguishable). On `undefined` this guard throws
 * {@link NotFoundException} → 404, matching the EXACT status the controller's own
 * not-found path produces for an unknown id (`getAudit` → `NotFoundException`).
 *
 * Why `NotFoundException` and not a domain error here: the A3 repo's
 * `assertOwnedBy` throws `InvalidArgumentError`, which AppErrorFilter maps to
 * **400** — that would NOT satisfy the security-critical 404 requirement. Using
 * `findByIdForUser` + `NotFoundException` yields the required 404 and mirrors the
 * controller's existing 404 mechanism exactly (the controller itself throws
 * `NotFoundException` for the identical missing-or-not-visible case).
 */
@Injectable()
export class AuditOwnershipGuard implements CanActivate {
  constructor(private readonly audits: AuditRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const id = request.params.id;
    const user = request.user;

    // No principal means authentication did not run/populate `req.user`; treat
    // as not-visible (404) rather than leaking a different status.
    if (!id || !user) {
      throw new NotFoundException(`No audit found with id ${id ?? ''}`);
    }

    // findByIdForUser already encodes the admin-bypass + owner-only predicate and
    // returns undefined for missing OR cross-user (indistinguishable on purpose).
    const audit = await this.audits.findByIdForUser(id, user);
    if (!audit) {
      throw new NotFoundException(`No audit found with id ${id}`);
    }
    return true;
  }
}
