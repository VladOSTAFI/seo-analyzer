import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { mirrorMainMirrorRule } from './main-mirror.rule';

describe('mirror.main-mirror (int)', () => {
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

  it('flags every page served under 2+ host/scheme variants of the same key', async () => {
    await seedPages(auditId, [
      // trigger: same variant_key `example.com/` under two origins (www + non-www)
      { url: 'https://example.com/', statusClass: '2xx' },
      { url: 'https://www.example.com/', statusClass: '2xx' },
      // unrelated single-variant path must NOT be flagged
      { url: 'https://example.com/solo', statusClass: '2xx' },
    ]);

    const findings = await runRule(mirrorMainMirrorRule, auditId);

    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.url).sort()).toEqual([
      'https://example.com/',
      'https://www.example.com/',
    ]);
    for (const f of findings) {
      expect(f.detail).toEqual({
        variantKey: 'example.com/',
        variants: ['https://example.com', 'https://www.example.com'],
        mirrorCount: 2,
      });
    }
  });

  it('flags an http/https mirror of the same www-stripped key', async () => {
    await seedPages(auditId, [
      { url: 'http://example.com/p', statusClass: '2xx' },
      { url: 'https://example.com/p', statusClass: '2xx' },
    ]);

    const findings = await runRule(mirrorMainMirrorRule, auditId);

    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.url).sort()).toEqual([
      'http://example.com/p',
      'https://example.com/p',
    ]);
    expect(findings[0].detail).toMatchObject({
      variantKey: 'example.com/p',
      variants: ['http://example.com', 'https://example.com'],
      mirrorCount: 2,
    });
  });

  it('returns nothing when each page is served under a single origin only', async () => {
    await seedPages(auditId, [
      { url: 'https://example.com/', statusClass: '2xx' },
      { url: 'https://example.com/about', statusClass: '2xx' },
      { url: 'https://example.com/contact', statusClass: '2xx' },
    ]);

    const findings = await runRule(mirrorMainMirrorRule, auditId);

    expect(findings).toEqual([]);
  });

  it('ignores non-2xx variants when deciding mirror count', async () => {
    await seedPages(auditId, [
      { url: 'https://example.com/', statusClass: '2xx' },
      // www variant is a redirect (3xx), so NOT a live mirror
      { url: 'https://www.example.com/', statusClass: '3xx' },
    ]);

    const findings = await runRule(mirrorMainMirrorRule, auditId);

    expect(findings).toEqual([]);
  });
});
