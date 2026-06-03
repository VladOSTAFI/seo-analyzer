import { createReadStream, existsSync } from 'node:fs';
import { basename } from 'node:path';
import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { AuditOwnershipGuard } from '../auth/audit-ownership.guard';
import { AuditService } from '../audit/audit.service';
import { AuditQueryService } from './audit-query.service';
import { CreateAuditBody, ListAuditsQuery, ListFindingsQuery } from './api.dto';
import { ZodValidationPipe } from './zod-validation.pipe';
import type { AuditDetailDto, AuditDto, FindingDto, Paginated } from './api.types';

/** MIME type for the generated `.xlsx` report (OOXML spreadsheet). */
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * REST surface for audits (Phase 7).
 *
 * Five routes, thin by design — the read side delegates wholesale to
 * {@link AuditQueryService} (all SQL/aggregation lives there) and the write side
 * to {@link AuditService}:
 *   POST   /audits              → create + run in background (202 Accepted)
 *   GET    /audits              → list (paginated)
 *   GET    /audits/:id          → detail + finding rollups (404 if missing)
 *   GET    /audits/:id/findings → findings (filters + pagination; 404 if no audit)
 *   GET    /audits/:id/report   → stream the .xlsx (StreamableFile)
 *
 * OWNERSHIP (Phases A3 + A4): every route reads the authenticated principal via
 * {@link CurrentUser} (attached by the global JwtAuthGuard, A2). `POST` stamps the
 * new audit's `ownerId = user.id`; the list/detail reads forward the principal so
 * the query layer scopes results to the owner (admins see all).
 *
 * The three per-`:id` routes additionally carry {@link AuditOwnershipGuard}
 * (Phase A4): it enforces owner-or-admin BEFORE the handler runs, returning a
 * **404 (not 403)** for a cross-user or missing id so audit ids can't be
 * enumerated (AUTHORIZATION_PLAN §8). The list (`GET /audits`) and create
 * (`POST /audits`) routes stay owner-scoped from A3 and need no per-id guard.
 *
 * ASYNC-PIPELINE-VIA-202: a full audit (crawl→…→report) is far too long to run
 * inside a request. So `POST /audits` only validates the URL + inserts the row
 * synchronously (cheap), then fires {@link AuditService.runInBackground} WITHOUT
 * awaiting it and returns 202 Accepted with the new id. Clients poll
 * `GET /audits/:id` for `status` and pull the artifact from `.../report` once
 * `reportPath` is set. `runInBackground` never rejects (it self-marks the audit
 * `failed` and logs), so the un-awaited promise can't crash the process.
 *
 * STATUS MAPPING: bad-URL → 400 is owned by the global {@link AppErrorFilter}
 * (it maps InvalidArgumentError); this controller only throws Nest HttpExceptions
 * for the 404/409 cases it owns. Request validation (body/query) is done by the
 * {@link ZodValidationPipe} against the {@link CreateAuditBody}/{@link ListAuditsQuery}/
 * {@link ListFindingsQuery} schemas, which throws 400 on its own.
 */
@Controller('audits')
export class AuditsController {
  constructor(
    private readonly audits: AuditService,
    private readonly query: AuditQueryService,
  ) {}

  /**
   * Create an audit and kick off its pipeline out-of-band. 202 Accepted: the row
   * is inserted synchronously (so the returned id is immediately queryable) but
   * the pipeline is fire-and-forget — we deliberately do NOT await
   * `runInBackground`, so the request returns at once. A malformed URL makes
   * `create()` throw InvalidArgumentError → the global filter maps it to 400.
   *
   * The new audit is stamped with `ownerId = user.id` (Phase A3): the creating
   * principal owns the result.
   */
  @Post()
  @HttpCode(202)
  async create(
    @Body(new ZodValidationPipe(CreateAuditBody)) body: CreateAuditBody,
    @CurrentUser() user: AuthUser,
  ): Promise<{ id: string; status: 'created' }> {
    const id = await this.audits.create(body.url, user.id);
    // Fire-and-forget: must NOT be awaited — the request returns while the
    // pipeline runs out-of-band. `runInBackground` never rejects.
    void this.audits.runInBackground(id);
    return { id, status: 'created' };
  }

  /**
   * List audits, newest-first and offset-paginated. Always 200 (empty page if
   * none). Scoped to the caller (Phase A3): a `user` sees only their own audits;
   * an `admin` sees all.
   */
  @Get()
  listAudits(
    @Query(new ZodValidationPipe(ListAuditsQuery)) query: ListAuditsQuery,
    @CurrentUser() user: AuthUser,
  ): Promise<Paginated<AuditDto>> {
    return this.query.listAudits(query, user);
  }

  /**
   * One audit plus its finding rollups. 200 when found, 404 (NotFound) when
   * missing OR not visible to the caller — a non-owner non-admin gets the same
   * 404 as a missing id, so existence isn't leaked.
   *
   * {@link AuditOwnershipGuard} (Phase A4) already rejected cross-user/missing ids
   * with a 404 before this handler runs; the `getAudit` re-check stays as a
   * defense-in-depth fallback and produces the identical 404.
   */
  @Get(':id')
  @UseGuards(AuditOwnershipGuard)
  async getAudit(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<AuditDetailDto> {
    const audit = await this.query.getAudit(id, user);
    if (!audit) {
      throw new NotFoundException(`No audit found with id ${id}`);
    }
    return audit;
  }

  /**
   * List an audit's findings (optional severity/ruleId filters + pagination).
   * {@link AuditOwnershipGuard} (Phase A4) enforces owner-or-admin first (404 for
   * cross-user/missing). The owner-scoped {@link AuditQueryService.auditExists}
   * check then distinguishes a missing audit (404) from an existing audit with
   * zero findings (→ 200 + empty page). 200 otherwise.
   */
  @Get(':id/findings')
  @UseGuards(AuditOwnershipGuard)
  async listFindings(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(ListFindingsQuery)) query: ListFindingsQuery,
    @CurrentUser() user: AuthUser,
  ): Promise<Paginated<FindingDto>> {
    if (!(await this.query.auditExists(id, user))) {
      throw new NotFoundException(`No audit found with id ${id}`);
    }
    return this.query.listFindings(id, query);
  }

  /**
   * Stream the audit's `.xlsx` report as an attachment. Status contract:
   *  - audit missing or not visible → 404 NotFound (owner-scoped, Phase A3/A4)
   *  - audit exists, no reportPath  → 409 Conflict (pipeline hasn't produced it yet)
   *  - reportPath set but file gone → 404 NotFound (recorded path no longer on disk)
   *  - otherwise                    → 200 with the streamed workbook
   *
   * SECURITY (§8): {@link AuditOwnershipGuard} (Phase A4) runs BEFORE this handler,
   * so ownership is enforced before ANY disk access. A non-owner is rejected with a
   * 404 and never reaches the `existsSync`/`createReadStream` below — they can't
   * probe whether another user's report file exists. The handler does no second,
   * unguarded disk lookup by id: `existsSync` only fires for an audit the caller is
   * already authorized to see.
   *
   * Uses {@link StreamableFile} so Nest sets the Content-Type/Content-Disposition
   * from the options here — no `@Res`, keeping the handler framework-agnostic.
   */
  @Get(':id/report')
  @UseGuards(AuditOwnershipGuard)
  async getReport(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<StreamableFile> {
    const audit = await this.query.getAudit(id, user);
    if (!audit) {
      throw new NotFoundException(`No audit found with id ${id}`);
    }
    if (audit.reportPath === null) {
      throw new ConflictException('report not generated yet; run the pipeline first');
    }
    const reportPath = audit.reportPath;
    if (!existsSync(reportPath)) {
      throw new NotFoundException(`Report file no longer exists for audit ${id}`);
    }
    return new StreamableFile(createReadStream(reportPath), {
      type: XLSX_MIME,
      disposition: `attachment; filename="${basename(reportPath)}"`,
    });
  }
}
