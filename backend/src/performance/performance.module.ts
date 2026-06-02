import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PerfCommand } from '../cli/perf.command';
import { PerformanceService } from './performance.service';
import { PsiService } from './psi.service';
import { PSI_CLIENT } from './psi.types';

/**
 * Phase 4 performance module. Wires the PSI client ({@link PsiService}), the
 * orchestration service ({@link PerformanceService}), and the `audit:perf` CLI
 * command. Imports {@link AuditModule} for status transitions; DB/ENV come from
 * the @Global modules so they need no import here.
 *
 * PerformanceService depends on the PSI client through the PSI_CLIENT token
 * (the {@link import('./psi.types').PsiClient} interface seam), bound here to
 * the concrete PsiService — so tests can swap in a mock client.
 */
@Module({
  imports: [AuditModule],
  providers: [
    PsiService,
    { provide: PSI_CLIENT, useExisting: PsiService },
    PerformanceService,
    PerfCommand,
  ],
  exports: [PerformanceService],
})
export class PerformanceModule {}
