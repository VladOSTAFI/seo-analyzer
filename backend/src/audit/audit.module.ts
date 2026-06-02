import { Module } from '@nestjs/common';
import { AuditRepository } from './audit.repository';

/**
 * Provides the {@link AuditRepository} for audit lookups and status transitions.
 * Other stage modules (crawl, enrich, analyze, ...) import this to read/transition
 * audit state without re-implementing the forward-only status machine. The DB
 * itself comes from the global DbModule, so this module only wires the repository.
 */
@Module({
  providers: [AuditRepository],
  exports: [AuditRepository],
})
export class AuditModule {}
