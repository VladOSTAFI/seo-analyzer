import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { InvalidArgumentError } from '../common/errors';
import { DB, type Database } from '../db/db.types';
import { AuditRepository } from '../audit/audit.repository';
import { LinkVerifierService } from './link-verifier';
import type { EnrichSummary } from './enrich.types';

/**
 * A Drizzle/pg query handle that exposes `execute` — satisfied by both the
 * top-level {@link Database} and the transaction object handed to a
 * `db.transaction` callback. Typed structurally so the SQL helpers can run
 * against either without leaking Drizzle's transaction generics.
 */
type Executor = Pick<Database, 'execute'>;

/**
 * Read a single integer aggregate (e.g. `count(*)`) from an `execute` result.
 * node-postgres returns `{ rows: [...] }`; the aggregate column is `n`. Coerces
 * Postgres' bigint-as-string defensively so callers always get a JS number.
 */
function scalarCount(result: { rows: Record<string, unknown>[] }): number {
  const value = result.rows[0]?.n;
  return value == null ? 0 : Number(value);
}

/**
 * Phase 2 enrichment (§"Phase 2 — Enrichment", §1/§8). Turns the raw crawl
 * output into actionable link/inlink/hreflang/image signals using **set-based
 * SQL only** — every write is a single `UPDATE` (reset-then-set or aggregate),
 * never a row-by-row loop in Node. All set-based writes are scoped by `audit_id`
 * and run inside ONE transaction, so a partial failure leaves the prior
 * enrichment intact and a re-run reproduces identical results (idempotent).
 *
 * AFTER that transaction commits, three **live verification/probe passes** run
 * sequentially, each best-effort (never fails enrich):
 *
 * 1. **Broken-link verification** ({@link LinkVerifierService.verifyBrokenLinks}):
 *    re-checks every `is_broken=true` internal link with a fresh browser-like
 *    request to clear false positives. Gated by LINK_VERIFY_ENABLED.
 *
 * 2. **External-link probe** ({@link LinkVerifierService.probeExternalLinks}):
 *    probes external hrefs whose `target_status_code` is still NULL (never
 *    visited by the crawl). Populates `target_status_code` and `is_broken` so
 *    the `links.broken-external` rule has live data. Gated by
 *    EXTERNAL_VERIFY_ENABLED (default false).
 *
 * 3. **Image probe** ({@link LinkVerifierService.probeImages}):
 *    probes image srcs whose `status_code` is still NULL. Populates
 *    `images.status_code` so the `image.broken` rule has live data. Gated by
 *    IMAGE_VERIFY_ENABLED (default false).
 *
 * All three passes run OUTSIDE the transaction (see the broken-link pass
 * docblock for the rationale). Any failure in any pass is caught and logged; it
 * cannot fail the enrich stage.
 *
 * Status semantics mirror Phase 1: status is set to `enriching` at the start and
 * LEFT at `enriching` on success — `enriching` is the settled "enriched" state
 * until the analyze stage advances it (there is no `enriched` enum value). On
 * failure we `markFailed(auditId, 'enrich')` and rethrow.
 */
@Injectable()
export class EnrichService {
  private readonly logger = new Logger(EnrichService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly auditRepo: AuditRepository,
    private readonly linkVerifier: LinkVerifierService,
  ) {}

  async enrich(auditId: string): Promise<EnrichSummary> {
    const startedAt = Date.now();
    await this.auditRepo.assertExists(auditId);

    // Guard: enrichment is meaningless without crawl output. A zero-page count
    // almost always means `audit:crawl` was never run for this id.
    const pageCount = scalarCount(
      await this.db.execute(sql`select count(*)::int as n from pages where audit_id = ${auditId}`),
    );
    if (pageCount === 0) {
      throw new InvalidArgumentError(
        `No crawled pages for audit "${auditId}". Run \`audit:crawl ${auditId}\` first.`,
      );
    }

    await this.auditRepo.setStatus(auditId, 'enriching');
    this.logger.log(`Enrich start audit=${auditId} pages=${pageCount}`);

    try {
      // (1) Set-based enrichment + initial summary snapshot — committed in ONE
      // transaction, exactly as before. These steps stay idempotent.
      const summary = await this.db.transaction(async (tx) => {
        await this.resolveLinkTargets(tx, auditId);
        await this.computeInlinkCounts(tx, auditId);
        await this.computeHreflangReciprocity(tx, auditId);
        await this.resolveImageStatus(tx, auditId);
        // Collect the summary inside the txn for a consistent snapshot.
        return this.collectSummary(tx, auditId);
      });

      // (2) Live broken-link verification pass — network I/O + its own small
      // UPDATEs, run AFTER the transaction commits (see class docblock for why).
      // Best-effort: it never throws, so it cannot fail the enrich stage.
      const verify = await this.linkVerifier.verifyBrokenLinks(auditId);
      summary.linksVerified = verify.linksVerified;
      summary.falsePositivesCleared = verify.falsePositivesCleared;
      summary.verifyInconclusive = verify.verifyInconclusive;

      // (3) If the verification pass cleared any false positives, the in-txn
      // broken count is now stale — recompute it from the just-updated rows so
      // the summary/log reflect the post-verification truth.
      if (verify.falsePositivesCleared > 0) {
        summary.brokenLinks = scalarCount(
          await this.db.execute(
            sql`select count(*)::int as n from links where audit_id = ${auditId} and is_broken = true`,
          ),
        );
      }

      // (4) External-link probe pass — probes external hrefs with NULL
      // target_status_code so broken-external findings have live data.
      // Best-effort; never throws. Gated by EXTERNAL_VERIFY_ENABLED.
      const externalProbe = await this.linkVerifier.probeExternalLinks(auditId);
      summary.externalsVerified = externalProbe.externalsVerified;
      summary.externalsTruncated = externalProbe.truncated;

      // (5) Image probe pass — probes image srcs with NULL status_code.
      // Best-effort; never throws. Gated by IMAGE_VERIFY_ENABLED.
      const imageProbe = await this.linkVerifier.probeImages(auditId);
      summary.imagesVerified = imageProbe.imagesVerified;
      summary.imagesTruncated = imageProbe.truncated;

      const elapsedMs = Date.now() - startedAt;
      this.logger.log(
        `Enrich done audit=${auditId} links=${summary.linksResolved} ` +
          `(redirect=${summary.redirectLinks}, broken=${summary.brokenLinks}) ` +
          `verified=${summary.linksVerified} false_positives_cleared=${summary.falsePositivesCleared} ` +
          `verify_inconclusive=${summary.verifyInconclusive} ` +
          `externals_verified=${summary.externalsVerified} externals_truncated=${summary.externalsTruncated} ` +
          `images_verified=${summary.imagesVerified} images_truncated=${summary.imagesTruncated} ` +
          `inlinked_pages=${summary.pagesWithInlinks} ` +
          `images=${summary.imagesResolved} hreflang_reciprocal=${summary.hreflangReciprocal} ` +
          `redirect_chains=${summary.redirectChainPages} loops=${summary.redirectLoopPages} ` +
          `durationMs=${elapsedMs}`,
      );
      // Status stays at `enriching` on success — analyze owns the next transition.
      return summary;
    } catch (err) {
      await this.auditRepo.markFailed(auditId, 'enrich');
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(`Enrich failed audit=${auditId} stage=enrich: ${reason}`);
      throw err;
    }
  }

  /**
   * Step 5 — Link target resolution. Match each link's already-normalized `href`
   * to a crawled `pages.url` (the crawl normalized both with the same helper, so
   * a plain `=` join is correct — do NOT re-normalize in SQL). For a matched
   * page set `target_status_code`, `is_redirect` (target is 3xx) and `is_broken`
   * (target is 4xx/5xx). Links with no crawled page (external, or internal URLs
   * not crawled because the page cap was hit) are left NULL = "unknown".
   *
   * Reset-then-set guarantees idempotency: the reset clears any stale values
   * (incl. links whose target is no longer crawled) so a re-run is identical.
   * (The post-commit verification pass may then flip some `is_broken` flags back
   * to false based on a live re-check — see the class docblock.)
   */
  private async resolveLinkTargets(tx: Executor, auditId: string): Promise<void> {
    await tx.execute(sql`
      update links
      set target_status_code = null, is_redirect = null, is_broken = null
      where audit_id = ${auditId}
    `);
    await tx.execute(sql`
      update links l
      set target_status_code = p.status_code,
          is_redirect = (p.status_class = '3xx'),
          is_broken = (p.status_class in ('4xx', '5xx'))
      from pages p
      where l.audit_id = ${auditId}
        and p.audit_id = l.audit_id
        and p.url = l.href
    `);
  }

  /**
   * Step 6 — Inlink counts. `pages.inlink_count` = the number of internal links
   * pointing at that page's url. A correlated COALESCE(count, 0) over every page
   * sets zero-inlink pages back to 0 too, so the column is fully recomputed each
   * run (no stale counts survive a re-crawl that removed inbound links).
   */
  private async computeInlinkCounts(tx: Executor, auditId: string): Promise<void> {
    await tx.execute(sql`
      update pages p
      set inlink_count = coalesce((
        select count(*)
        from links l
        where l.audit_id = p.audit_id
          and l.type = 'internal'
          and l.href = p.url
      ), 0)
      where p.audit_id = ${auditId}
    `);
  }

  /**
   * Step 7 — Hreflang reciprocity. `is_reciprocal` is TRUE iff the target page
   * declares a return hreflang back to the source page. We base reciprocity on
   * the URL round-trip (source→href and href→source both exist) and deliberately
   * do NOT require the language code to match: a missing/mismatched return lang
   * is a separate i18n finding, whereas reciprocity here answers "does the other
   * side point back at all?". Symmetric EXISTS over the same audit.
   */
  private async computeHreflangReciprocity(tx: Executor, auditId: string): Promise<void> {
    await tx.execute(sql`
      update hreflang_entries e
      set is_reciprocal = exists (
        select 1
        from hreflang_entries r
        where r.audit_id = e.audit_id
          and r.page_url = e.href
          and r.href = e.page_url
      )
      where e.audit_id = ${auditId}
    `);
  }

  /**
   * Step 8 — Image status (set-based only). Resolve `images.status_code` only
   * when the image's `src` happens to equal a crawled `pages.url` (rare, but
   * correct — e.g. an image URL that was itself queued and fetched). Reset then
   * set, mirroring link resolution, so it stays idempotent.
   *
   * A live HTTP HEAD-check pass (IMAGE_VERIFY_ENABLED) is now a separate
   * best-effort step run after this transaction — see {@link probeImages}.
   */
  private async resolveImageStatus(tx: Executor, auditId: string): Promise<void> {
    await tx.execute(sql`
      update images
      set status_code = null
      where audit_id = ${auditId}
    `);
    await tx.execute(sql`
      update images i
      set status_code = p.status_code
      from pages p
      where i.audit_id = ${auditId}
        and p.audit_id = i.audit_id
        and p.url = i.src
    `);
  }

  /**
   * Step 9/10 — Assemble the {@link EnrichSummary} from lightweight count
   * SELECTs over the just-updated rows. The redirect-chain/loop counts read the
   * stored `pages.redirect_chain` jsonb (no column is written for them — Phase 3
   * queries the same jsonb): a chain has >1 hop; a loop has a repeated url,
   * detected set-based by comparing the array length against the count of
   * DISTINCT `elem->>'url'` (distinct < total ⇒ some url repeats ⇒ loop). The
   * `redirect_chain` column defaults to `[]`, so the length guard is safe.
   *
   * The verification counts (`linksVerified`/`falsePositivesCleared`/
   * `verifyInconclusive`) are filled in by the caller AFTER the live pass; here
   * they are seeded to zero so the summary is complete inside the transaction.
   * Similarly, the external/image probe counts are seeded to zero here and filled
   * in post-transaction.
   */
  private async collectSummary(tx: Executor, auditId: string): Promise<EnrichSummary> {
    const linksResolved = scalarCount(
      await tx.execute(
        sql`select count(*)::int as n from links where audit_id = ${auditId} and target_status_code is not null`,
      ),
    );
    const redirectLinks = scalarCount(
      await tx.execute(
        sql`select count(*)::int as n from links where audit_id = ${auditId} and is_redirect = true`,
      ),
    );
    const brokenLinks = scalarCount(
      await tx.execute(
        sql`select count(*)::int as n from links where audit_id = ${auditId} and is_broken = true`,
      ),
    );
    const pagesWithInlinks = scalarCount(
      await tx.execute(
        sql`select count(*)::int as n from pages where audit_id = ${auditId} and inlink_count > 0`,
      ),
    );
    const imagesResolved = scalarCount(
      await tx.execute(
        sql`select count(*)::int as n from images where audit_id = ${auditId} and status_code is not null`,
      ),
    );
    const hreflangReciprocal = scalarCount(
      await tx.execute(
        sql`select count(*)::int as n from hreflang_entries where audit_id = ${auditId} and is_reciprocal = true`,
      ),
    );
    const redirectChainPages = scalarCount(
      await tx.execute(sql`
        select count(*)::int as n
        from pages
        where audit_id = ${auditId}
          and jsonb_array_length(redirect_chain) > 1
      `),
    );
    const redirectLoopPages = scalarCount(
      await tx.execute(sql`
        select count(*)::int as n
        from pages
        where audit_id = ${auditId}
          and jsonb_array_length(redirect_chain) > 1
          and jsonb_array_length(redirect_chain) > (
            select count(distinct elem->>'url')
            from jsonb_array_elements(redirect_chain) as elem
          )
      `),
    );

    return {
      linksResolved,
      redirectLinks,
      brokenLinks,
      pagesWithInlinks,
      imagesResolved,
      hreflangReciprocal,
      redirectChainPages,
      redirectLoopPages,
      // Filled in post-transaction by the live verification pass.
      linksVerified: 0,
      falsePositivesCleared: 0,
      verifyInconclusive: 0,
      // Filled in post-transaction by the external/image probe passes.
      externalsVerified: 0,
      externalsTruncated: false,
      imagesVerified: 0,
      imagesTruncated: false,
    };
  }
}
