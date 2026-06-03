import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
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
 * No circular dependency: ApiModule sits at the top, importing RunModule (which
 * already imports the stage modules). The CLI never imports ApiModule, so the
 * controllers are inert under CommandFactory (no HTTP adapter mounted) and only
 * come alive under the `api` entrypoint (src/api.main.ts) via NestFactory.create.
 */
@Module({
  imports: [RunModule, AuthModule],
  controllers: [AuditsController],
  providers: [
    AuditQueryService,
    { provide: APP_FILTER, useClass: AppErrorFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [AuditQueryService],
})
export class ApiModule {}
