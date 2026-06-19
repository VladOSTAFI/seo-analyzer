import {
  cleanupAudit,
  closePool,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { mobileViewportRule } from './viewport.rule';

describe('mobile.viewport (int)', () => {
  let auditId: string;

  beforeEach(async () => {
    auditId = await createAudit();
  });
  afterEach(async () => {
    await cleanupAudit(auditId);
  });
  afterAll(async () => {
    await closePool();
  });

  it('flags missing / non-responsive / scale-pinned viewports and composes reason[]', async () => {
    await seedPages(auditId, [
      // good responsive viewport → not flagged
      {
        url: 'https://t/ok',
        statusClass: '2xx',
        pageKind: 'html',
        hasViewport: true,
        viewportContent: 'width=device-width, initial-scale=1',
      },
      // missing viewport
      {
        url: 'https://t/missing',
        statusClass: '2xx',
        pageKind: 'html',
        hasViewport: false,
        viewportContent: null,
      },
      // present but no device-width
      {
        url: 'https://t/no-dw',
        statusClass: '2xx',
        pageKind: 'html',
        hasViewport: true,
        viewportContent: 'initial-scale=1',
      },
      // pins scale (user-scalable=no) — also no device-width
      {
        url: 'https://t/pinned',
        statusClass: '2xx',
        pageKind: 'html',
        hasViewport: true,
        viewportContent: 'width=device-width, user-scalable=no',
      },
    ]);

    const findings = await runRule(mobileViewportRule, auditId);
    const byUrl = Object.fromEntries(findings.map((f) => [f.url, f.detail]));

    expect(findings.map((f) => f.url).sort()).toEqual([
      'https://t/missing',
      'https://t/no-dw',
      'https://t/pinned',
    ]);
    expect(byUrl['https://t/missing']).toMatchObject({ reason: ['missing-viewport'] });
    expect(byUrl['https://t/no-dw']).toMatchObject({ reason: ['no-device-width'] });
    expect(byUrl['https://t/pinned']).toMatchObject({ reason: ['pins-scale'] });
  });
});
