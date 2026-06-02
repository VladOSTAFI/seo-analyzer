import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { InvalidArgumentError } from '../common/errors';
import { DB, type Database } from '../db/db.types';
import { type Audit, audits, auditStatus } from '../db/schema';

/** The set of valid `audits.status` values, derived from the pgEnum definition. */
export type AuditStatus = (typeof auditStatus.enumValues)[number];

/**
 * Centralizes audit lookups and status transitions (§8). Every stage flips
 * status through this repository rather than ad hoc, so the forward-only state
 * machine stays in one place. Injects the shared Drizzle DB via the `DB` token.
 */
@Injectable()
export class AuditRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Fetch one audit by id, or `undefined` if it does not exist. */
  async findById(id: string): Promise<Audit | undefined> {
    const [row] = await this.db.select().from(audits).where(eq(audits.id, id)).limit(1);
    return row;
  }

  /**
   * Set the audit's status and bump `updatedAt`. Callers own the forward-only
   * semantics; this method just performs the write atomically per row.
   */
  async setStatus(id: string, status: AuditStatus): Promise<void> {
    await this.db.update(audits).set({ status, updatedAt: new Date() }).where(eq(audits.id, id));
  }

  /**
   * Mark the audit as failed at a given stage. Records `failedStage` so the
   * orchestrator and reports can surface where the pipeline stopped.
   */
  async markFailed(id: string, failedStage: string): Promise<void> {
    await this.db
      .update(audits)
      .set({ status: 'failed', failedStage, updatedAt: new Date() })
      .where(eq(audits.id, id));
  }

  /**
   * Fetch an audit by id, throwing an actionable error if it does not exist.
   * Use this at the top of every stage so a bad/stale `auditId` fails clearly.
   */
  async assertExists(id: string): Promise<Audit> {
    const audit = await this.findById(id);
    if (!audit) {
      throw new InvalidArgumentError(
        `No audit found with id "${id}". Create one first with ` +
          `\`audit:create <url>\`, then pass the printed id.`,
      );
    }
    return audit;
  }
}
