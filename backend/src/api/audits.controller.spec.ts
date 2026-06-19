import { Readable } from 'node:stream';
import { createReadStream, existsSync } from 'node:fs';
import { ConflictException, NotFoundException, StreamableFile } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import type { AuditService } from '../audit/audit.service';
import type { AuditQueryService } from './audit-query.service';
import type { AuditDetailDto, AuditDto, FindingDto, Paginated } from './api.types';
import { AuditsController } from './audits.controller';

// `node:fs`'s named exports are non-configurable, so jest.spyOn can't redefine
// them — mock the module instead and drive existsSync/createReadStream below.
jest.mock('node:fs');
const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
const mockCreateReadStream = createReadStream as jest.MockedFunction<typeof createReadStream>;

/**
 * Unit tests for {@link AuditsController}. Built WITHOUT a Nest test module:
 * the controller is a thin delegator, so we hand-roll jest.fn() mocks for the
 * two collaborators and instantiate it directly. These assert the controller's
 * status-code contract and that it delegates to the right service method with
 * the validated input AND the authenticated principal (Phase A3) — the services'
 * own behavior is tested elsewhere.
 */

const AUDIT_ID = '11111111-2222-3333-4444-555555555555';

/** A stand-in authenticated principal (attached by JwtAuthGuard at runtime). */
const USER: AuthUser = {
  id: '99999999-8888-7777-6666-555555555555',
  email: 'user@example.com',
  role: 'user',
  tokenVersion: 0,
};

function detail(overrides: Partial<AuditDetailDto> = {}): AuditDetailDto {
  return {
    id: AUDIT_ID,
    startUrl: 'https://example.com/',
    status: 'done',
    failedStage: null,
    reportPath: null,
    createdAt: '2026-06-02T00:00:00.000Z',
    updatedAt: '2026-06-02T00:00:00.000Z',
    findingsTotal: 0,
    bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    // Items 14 / 12 / 13 — sensible nulls / zero until the pipeline writes them.
    progress: null,
    coverage: null,
    distinctIssues: 0,
    ...overrides,
  };
}

function buildController() {
  const audits = {
    create: jest.fn(),
    runInBackground: jest.fn(),
  } as unknown as jest.Mocked<Pick<AuditService, 'create' | 'runInBackground'>>;

  const query = {
    listAudits: jest.fn(),
    getAudit: jest.fn(),
    auditExists: jest.fn(),
    listFindings: jest.fn(),
  } as unknown as jest.Mocked<AuditQueryService>;

  const controller = new AuditsController(audits as unknown as AuditService, query);

  return { controller, audits, query };
}

describe('AuditsController.create (POST /audits)', () => {
  it('creates the audit owned by the caller, fires the pipeline, and returns 202 payload', async () => {
    const { controller, audits } = buildController();
    audits.create.mockResolvedValue(AUDIT_ID);
    audits.runInBackground.mockResolvedValue(undefined);

    const result = await controller.create({ url: 'https://example.com' }, USER);

    // Forwards the caller's id as the owner (Phase A3).
    expect(audits.create).toHaveBeenCalledWith('https://example.com', USER.id);
    expect(audits.runInBackground).toHaveBeenCalledWith(AUDIT_ID);
    expect(result).toEqual({ id: AUDIT_ID, status: 'created' });
  });

  it('does NOT await runInBackground (fire-and-forget): resolves even if the pipeline never settles', async () => {
    const { controller, audits } = buildController();
    audits.create.mockResolvedValue(AUDIT_ID);
    // A promise that never resolves — if the handler awaited it, this would hang.
    audits.runInBackground.mockReturnValue(new Promise<void>(() => {}));

    const result = await controller.create({ url: 'https://example.com' }, USER);

    expect(result).toEqual({ id: AUDIT_ID, status: 'created' });
    expect(audits.runInBackground).toHaveBeenCalledTimes(1);
  });
});

describe('AuditsController.listAudits (GET /audits)', () => {
  it('delegates to query.listAudits with the validated query AND the principal', async () => {
    const { controller, query } = buildController();
    const page: Paginated<AuditDto> = { items: [], total: 0, limit: 50, offset: 0 };
    query.listAudits.mockResolvedValue(page);

    const result = await controller.listAudits({ limit: 50, offset: 0 }, USER);

    expect(query.listAudits).toHaveBeenCalledWith({ limit: 50, offset: 0 }, USER);
    expect(result).toBe(page);
  });
});

describe('AuditsController.getAudit (GET /audits/:id)', () => {
  it('returns the audit when present (scoped to the caller)', async () => {
    const { controller, query } = buildController();
    const dto = detail();
    query.getAudit.mockResolvedValue(dto);

    const result = await controller.getAudit(AUDIT_ID, USER);

    expect(query.getAudit).toHaveBeenCalledWith(AUDIT_ID, USER);
    expect(result).toBe(dto);
  });

  it('throws NotFoundException when the audit is missing or not visible to the caller', async () => {
    const { controller, query } = buildController();
    query.getAudit.mockResolvedValue(undefined);

    await expect(controller.getAudit(AUDIT_ID, USER)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AuditsController.listFindings (GET /audits/:id/findings)', () => {
  it('throws NotFoundException when the audit does not exist or is not visible', async () => {
    const { controller, query } = buildController();
    query.auditExists.mockResolvedValue(false);

    await expect(
      controller.listFindings(AUDIT_ID, { limit: 50, offset: 0 }, USER),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(query.auditExists).toHaveBeenCalledWith(AUDIT_ID, USER);
    expect(query.listFindings).not.toHaveBeenCalled();
  });

  it('delegates to query.listFindings when the audit exists and is visible', async () => {
    const { controller, query } = buildController();
    query.auditExists.mockResolvedValue(true);
    const page: Paginated<FindingDto> = { items: [], total: 0, limit: 50, offset: 0 };
    query.listFindings.mockResolvedValue(page);

    const result = await controller.listFindings(
      AUDIT_ID,
      {
        limit: 50,
        offset: 0,
        severity: 'high',
      },
      USER,
    );

    expect(query.auditExists).toHaveBeenCalledWith(AUDIT_ID, USER);
    expect(query.listFindings).toHaveBeenCalledWith(AUDIT_ID, {
      limit: 50,
      offset: 0,
      severity: 'high',
    });
    expect(result).toBe(page);
  });
});

describe('AuditsController.getReport (GET /audits/:id/report)', () => {
  afterEach(() => jest.clearAllMocks());

  it('throws NotFoundException when the audit is missing or not visible', async () => {
    const { controller, query } = buildController();
    query.getAudit.mockResolvedValue(undefined);

    await expect(controller.getReport(AUDIT_ID, USER)).rejects.toBeInstanceOf(NotFoundException);
    expect(query.getAudit).toHaveBeenCalledWith(AUDIT_ID, USER);
  });

  it('throws ConflictException when reportPath is null (not generated yet)', async () => {
    const { controller, query } = buildController();
    query.getAudit.mockResolvedValue(detail({ reportPath: null }));

    await expect(controller.getReport(AUDIT_ID, USER)).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws NotFoundException when the report path is recorded but the file is gone', async () => {
    const { controller, query } = buildController();
    query.getAudit.mockResolvedValue(detail({ reportPath: '/out/audit.xlsx' }));
    mockExistsSync.mockReturnValue(false);

    await expect(controller.getReport(AUDIT_ID, USER)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns a StreamableFile when the report exists on disk', async () => {
    const { controller, query } = buildController();
    query.getAudit.mockResolvedValue(detail({ reportPath: '/out/audit.xlsx' }));
    mockExistsSync.mockReturnValue(true);
    mockCreateReadStream.mockReturnValue(
      Readable.from(['x']) as unknown as ReturnType<typeof createReadStream>,
    );

    const result = await controller.getReport(AUDIT_ID, USER);

    expect(result).toBeInstanceOf(StreamableFile);
  });
});
