import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { InvalidArgumentError } from '../common/errors';
import type { AuthUser } from '../auth/auth.types';
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
   * Ownership-aware lookup (Phase A3 — building block for A4's guard). Fetch one
   * audit by id ONLY if `user` may see it: an `admin` bypasses the predicate
   * (sees any audit), otherwise the row must be owned by `user.id`
   * (`eq(audits.ownerId, user.id)`).
   *
   * Returns `undefined` both when the id doesn't exist AND when it exists but is
   * owned by someone else — the two are indistinguishable on purpose so A4 can
   * map "not visible" to a **404 (not 403)** and avoid leaking which ids exist
   * (AUTHORIZATION_PLAN §8). It deliberately does NOT throw `ForbiddenError` for
   * the cross-user case for that same reason.
   *
   * NOTE: owner-less rows (`ownerId IS NULL`, pre-migration audits) are NOT
   * matched by the `=` predicate, so a non-admin user cannot see them — only an
   * admin can, which is the intended migration-window behavior.
   */
  async findByIdForUser(id: string, user: AuthUser): Promise<Audit | undefined> {
    const predicate =
      user.role === 'admin'
        ? eq(audits.id, id)
        : and(eq(audits.id, id), eq(audits.ownerId, user.id));
    const [row] = await this.db.select().from(audits).where(predicate).limit(1);
    return row;
  }

  /**
   * Ownership assertion (Phase A3 — building block for A4's guard). Returns the
   * audit if `user` may see it (admin: any; otherwise owner-only), or throws
   * {@link InvalidArgumentError} when it is missing-or-not-visible.
   *
   * Per AUTHORIZATION_PLAN §8 the cross-user case must be indistinguishable from
   * a missing id (so existence isn't leaked): both paths funnel through the same
   * not-found error here rather than a `ForbiddenError`. A4's guard layers the
   * actual `404` HTTP response on top of this.
   */
  async assertOwnedBy(id: string, user: AuthUser): Promise<Audit> {
    const audit = await this.findByIdForUser(id, user);
    if (!audit) {
      throw new InvalidArgumentError(
        `No audit found with id "${id}". Create one first with ` +
          `\`audit:create <url>\`, then pass the printed id.`,
      );
    }
    return audit;
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
