import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AuditOwnershipGuard } from '../auth/audit-ownership.guard';
import { AuditModule } from '../audit/audit.module';
import { RunModule } from '../run/run.module';
import { AuditsController } from './audits.controller';
import { AuditQueryService } from './audit-query.service';
import { AppErrorFilter } from './app-error.filter';

/**
 * Phase 7 REST API module. Hosts {@link AuditsController} and the read-side
 * {@link AuditQueryService}.
 *
 * Wiring:
 *  - imports RunModule → provides {@link import('../audit/audit.service').AuditService}
 *    (which RunModule exports) for the write path (`POST /audits` create + run).
 *  - imports AuditModule → provides {@link import('../audit/audit.repository').AuditRepository}
 *    so the per-id {@link AuditOwnershipGuard} (Phase A4) can inject it. RunModule
 *    only re-exports AuditService, not the repository, so ApiModule imports
 *    AuditModule directly (module exports are not transitive).
 *  - imports AuthModule (Phase A1) → mounts the `/auth/*` routes (register/login)
 *    and exposes JwtService/AuthService for the guard (A2).
 *  - AuditQueryService injects the global DB token directly (DbModule is @Global),
 *    so no DB import is needed here.
 *
 * Cross-cutting providers (same pattern for each):
 *  - APP_FILTER → {@link AppErrorFilter} maps domain AppErrors to HTTP statuses.
 *  - APP_GUARD  → {@link JwtAuthGuard} (Phase A2) makes every route
 *    authenticated-by-default; `@Public()` opts a route out. Because this is
 *    registered on ApiModule (not a global app provider), it only takes effect
 *    under the `api` entrypoint — the CLI never imports ApiModule, so the guard
 *    never runs there (no token needed for `audit:run`).
 *
 * Per-route guards (Phase A4), provided so Nest can inject their deps but applied
 * via `@UseGuards(...)` on individual handlers (NOT `APP_GUARD`):
 *  - {@link AuditOwnershipGuard} → owner-or-admin on `/audits/:id`,
 *    `.../findings`, `.../report` (404-not-403 for cross-user, §8).
 *  - {@link RolesGuard} → `@Roles('admin')` gate, available for any future
 *    admin-only route (none exists yet).
 *
 * No circular dependency: ApiModule sits at the top, importing RunModule (which
 * already imports the stage modules) and AuditModule. The CLI never imports
 * ApiModule, so the controllers/guards are inert under CommandFactory (no HTTP
 * adapter mounted) and only come alive under the `api` entrypoint
 * (src/api.main.ts) via NestFactory.create.
 */
@Module({
  imports: [RunModule, AuditModule, AuthModule],
  controllers: [AuditsController],
  providers: [
    AuditQueryService,
    AuditOwnershipGuard,
    RolesGuard,
    { provide: APP_FILTER, useClass: AppErrorFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [AuditQueryService],
})
export class ApiModule {}
