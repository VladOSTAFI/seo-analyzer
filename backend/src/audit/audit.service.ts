import { Inject, Injectable, Logger } from '@nestjs/common';
import { DB, type Database } from '../db/db.types';
import { audits } from '../db/schema';
import { CrawlService } from '../crawl/crawl.service';
import { EnrichService } from '../enrich/enrich.service';
import { AnalyzeService } from '../analyze/analyze.service';
import { PerformanceService } from '../performance/performance.service';
import { ReportService } from '../report/report.service';
import { buildAuditPayload, parseStartUrl } from '../cli/create.command';
import { AuditRepository } from './audit.repository';
import type { RunResult } from '../run/run.types';

/** The canonical stage names used for `failedStage` + progress logs. */
type StageName = 'crawl' | 'enrich' | 'analyze' | 'perf' | 'report';

/**
 * Phase 6 orchestrator (§"Phase 6 — Orchestration & Full Pipeline"). Drives the
 * five stage services from a cold start in one command:
 *
 *   crawl → enrich → analyze → perf → report
 *
 * It does NOT re-implement any stage — it injects and calls each service in
 * order, surfacing per-stage progress (start/end, key counts, durations) and
 * stopping the pipeline on the first failure. Every stage is already idempotent
 * per `auditId`, so a re-run (whole pipeline or an individual stage command)
 * resumes without forcing a re-crawl.
 *
 * STATUS OWNERSHIP (critical — mirrors the per-stage convention):
 *  - Each stage service sets ITS OWN status at its start and LEAVES it there on
 *    success: crawl→`crawling`, enrich→`enriching`, analyze→`analyzing`,
 *    report→`reporting`. PerformanceService deliberately does NOT advance status
 *    (it runs on an analyzed audit and only adds findings). So this orchestrator
 *    NEVER sets those intermediate statuses — the stage owns its status.
 *  - The ONLY status this orchestrator owns is the terminal transition: after
 *    `report.generate` succeeds (status left at `reporting`) it sets `done`.
 *  - On failure each stage's own catch already calls `markFailed`, BUT guard
 *    errors (e.g. "no crawled pages") are thrown BEFORE that catch runs. So the
 *    orchestrator's per-stage wrapper ALSO calls `markFailed(auditId, <stage>)`
 *    (idempotent — safe even if the stage already set it), logs the stage
 *    context, then RETHROWS so subsequent stages do NOT run.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly crawl: CrawlService,
    private readonly enrich: EnrichService,
    private readonly analyze: AnalyzeService,
    private readonly performance: PerformanceService,
    private readonly report: ReportService,
    private readonly auditRepo: AuditRepository,
    @Inject(DB) private readonly db: Database,
  ) {}

  /**
   * Validate `url`, insert a fresh `audits` row (status defaults to `created`)
   * owned by `ownerId`, log the new id, then run the full pipeline against it.
   * This is what `audit:run <url>` calls — a cold start from URL to finished
   * `.xlsx`.
   *
   * `ownerId` (Phase A3) stamps the creator on the row: the HTTP layer passes
   * `req.user.id`; the unauthenticated CLI passes `null` (the column is nullable
   * for that migration window — see AUTHORIZATION_PLAN §5/§10).
   *
   * URL validation reuses {@link parseStartUrl} so the run command shares the
   * same http(s) contract as `audit:create`. An invalid URL rejects here, BEFORE
   * any row is inserted or any stage runs.
   */
  async createAndRun(url: string, ownerId: string | null): Promise<RunResult> {
    const auditId = await this.create(url, ownerId);
    return this.runAll(auditId);
  }

  /**
   * Validate `url`, insert a fresh `audits` row (status `created`) owned by
   * `ownerId`, and return its id WITHOUT running the pipeline. The REST layer
   * (Phase 7) uses this to acknowledge a `POST /audits` synchronously (returning
   * the id) and then drive the pipeline in the background via
   * {@link runInBackground}.
   *
   * `ownerId` (Phase A3) is the creating principal: `req.user.id` from the HTTP
   * caller, or `null` from the unauthenticated CLI. URL validation reuses
   * {@link parseStartUrl}, so an invalid URL rejects here BEFORE any row is
   * inserted — the controller maps that to HTTP 400.
   */
  async create(url: string, ownerId: string | null): Promise<string> {
    const startUrl = parseStartUrl(url);
    const auditId = await this.createAudit(startUrl, ownerId);
    this.logger.log(`Created audit ${auditId} for ${startUrl}`);
    return auditId;
  }

  /**
   * Fire-and-forget the full pipeline for an already-created audit. Intended for
   * the REST layer: the HTTP request returns immediately while the audit runs
   * out-of-band, and clients poll `GET /audits/:id` for status.
   *
   * Takes an EXISTING `auditId` (already stamped with its owner by {@link create})
   * — ownership is established at insert time, so the background run is purely an
   * id-driven pipeline and never touches authz (per AUTHORIZATION_PLAN §8: all
   * authz runs in the request lifecycle BEFORE this is invoked).
   *
   * This NEVER rejects: {@link runAll}'s per-stage wrapper already marks the
   * audit `failed` on any error, so here we only log the failure to avoid an
   * unhandled promise rejection crashing the process. The returned promise
   * resolves once the run settles (handy for tests that want to await it).
   */
  runInBackground(auditId: string): Promise<void> {
    return this.runAll(auditId).then(
      () => undefined,
      (err: unknown) => {
        const reason = err instanceof Error ? err.message : String(err);
        this.logger.error(`Background pipeline failed audit=${auditId}: ${reason}`);
      },
    );
  }

  /**
   * Insert a new audit row owned by `ownerId` and return its id. Isolated as a
   * tiny seam so the Drizzle insert chain can be stubbed in unit tests without
   * mocking the whole pipeline. Mirrors the exact idiom in
   * {@link import('../cli/create.command').CreateCommand}.
   */
  private async createAudit(startUrl: string, ownerId: string | null): Promise<string> {
    const [row] = await this.db
      .insert(audits)
      .values(buildAuditPayload(startUrl, ownerId))
      .returning({ id: audits.id });
    if (!row) {
      throw new Error('Insert returned no row; audit was not created.');
    }
    return row.id;
  }

  /**
   * Run all five stages IN ORDER against an existing audit. Asserts the audit
   * exists first, then drives crawl → enrich → analyze → perf → report, each
   * wrapped by {@link runStage} so a throw marks the audit failed at that stage
   * and stops the pipeline (subsequent stages do NOT run). After report succeeds
   * the orchestrator owns the terminal `done` transition and logs a final
   * pipeline summary.
   */
  async runAll(auditId: string): Promise<RunResult> {
    const startedAt = Date.now();
    await this.auditRepo.assertExists(auditId);
    this.logger.log(`Pipeline start audit=${auditId}`);

    const crawl = await this.runStage(
      'crawl',
      auditId,
      () => this.crawl.crawl(auditId),
      (s) => `pages=${s.pages} links=${s.links} images=${s.images} hreflang=${s.hreflang}`,
    );
    const enrich = await this.runStage(
      'enrich',
      auditId,
      () => this.enrich.enrich(auditId),
      (s) =>
        `links_resolved=${s.linksResolved} inlinked_pages=${s.pagesWithInlinks} ` +
        `broken=${s.brokenLinks} hreflang_reciprocal=${s.hreflangReciprocal}`,
    );
    const analyze = await this.runStage(
      'analyze',
      auditId,
      () => this.analyze.analyze(auditId),
      (s) =>
        `findings=${s.totalFindings} rules_run=${s.rulesRun} rules_failed=${s.failedRules.length}`,
    );
    const performance = await this.runStage(
      'perf',
      auditId,
      () => this.performance.run(auditId),
      (s) =>
        `sampled=${s.sampled} fetched=${s.fetched} cached=${s.cached} failed=${s.failed} ` +
        `findings=${s.findings}`,
    );
    const report = await this.runStage(
      'report',
      auditId,
      () => this.report.generate(auditId),
      (s) => `sheets=${s.sheets} findings=${s.totalFindings} report=${s.reportPath}`,
    );

    // The ONLY status this orchestrator owns: report left it at `reporting`.
    await this.auditRepo.setStatus(auditId, 'done');

    const elapsedMs = Date.now() - startedAt;
    this.logger.log(
      `Pipeline done audit=${auditId} status=done findings=${report.totalFindings} ` +
        `report=${report.reportPath} durationMs=${elapsedMs}`,
    );

    return {
      auditId,
      status: 'done',
      reportPath: report.reportPath,
      crawl,
      enrich,
      analyze,
      performance,
      report,
    };
  }

  /**
   * Run one stage: log start, time the call, log done with the stage's key counts
   * (via `describe`), and on any throw mark the audit failed at this stage
   * (idempotent — the stage may have already marked it), log the stage context +
   * reason, then RETHROW so the pipeline stops. Centralizes the try/catch so it
   * is not repeated five times.
   */
  private async runStage<T>(
    name: StageName,
    auditId: string,
    fn: () => Promise<T>,
    describe: (summary: T) => string,
  ): Promise<T> {
    const startedAt = Date.now();
    this.logger.log(`Stage ${name} start audit=${auditId}`);
    try {
      const summary = await fn();
      const elapsedMs = Date.now() - startedAt;
      this.logger.log(
        `Stage ${name} done audit=${auditId} ${describe(summary)} durationMs=${elapsedMs}`,
      );
      return summary;
    } catch (err) {
      // Idempotent safety net: guard errors throw BEFORE a stage's own markFailed.
      await this.auditRepo.markFailed(auditId, name);
      const reason = err instanceof Error ? err.message : String(err);
      const elapsedMs = Date.now() - startedAt;
      this.logger.error(
        `Stage ${name} failed audit=${auditId} stage=${name} durationMs=${elapsedMs}: ${reason}`,
      );
      throw err;
    }
  }
}
