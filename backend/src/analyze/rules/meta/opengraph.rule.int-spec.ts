import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { metaOpengraphRule } from './opengraph.rule';

const fullOg = {
  ogTitle: 'T',
  ogDescription: 'D',
  ogImage: 'https://t/img.png',
  ogUrl: 'https://t/page',
  ogType: 'website',
  ogSiteName: 'S',
  twitterCard: 'summary_large_image',
  twitterTitle: 'T',
  twitterDescription: 'D',
  twitterImage: 'https://t/tw.png',
};

describe('meta.opengraph (int)', () => {
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

  it('emits a single no-social-metadata issue when og_data is null', async () => {
    await seedPages(auditId, [
      { url: 'https://t/no-og', statusClass: '2xx', pageKind: 'html', ogData: null },
    ]);

    const findings = await runRule(metaOpengraphRule, auditId);

    expect(findings).toEqual([
      { url: 'https://t/no-og', detail: { issues: ['no-social-metadata'] } },
    ]);
  });

  it('lists the missing keys on a partial page', async () => {
    await seedPages(auditId, [
      {
        url: 'https://t/partial',
        statusClass: '2xx',
        pageKind: 'html',
        ogData: { ...fullOg, ogTitle: 'Only title', ogDescription: null, twitterCard: null, ogImage: null },
      },
    ]);

    const findings = await runRule(metaOpengraphRule, auditId);

    expect(findings).toHaveLength(1);
    const issues = findings[0]!.detail!.issues as string[];
    expect(issues).toEqual(
      expect.arrayContaining(['og:description-missing', 'og:image-missing', 'twitter:card-missing']),
    );
    // no preview card at all → promoted to medium
    expect(findings[0]!.severity).toBe('medium');
  });

  it('flags invalid twitter:card and non-absolute og:image', async () => {
    await seedPages(auditId, [
      {
        url: 'https://t/invalid',
        statusClass: '2xx',
        pageKind: 'html',
        ogData: { ...fullOg, twitterCard: 'banner', ogImage: '/relative.png' },
      },
    ]);

    const findings = await runRule(metaOpengraphRule, auditId);

    const issues = findings[0]!.detail!.issues as string[];
    expect(issues).toEqual(expect.arrayContaining(['twitter:card-invalid', 'og:image-invalid']));
  });

  it('does not flag a fully-valid page', async () => {
    await seedPages(auditId, [
      { url: 'https://t/ok', statusClass: '2xx', pageKind: 'html', ogData: fullOg },
    ]);

    const findings = await runRule(metaOpengraphRule, auditId);

    expect(findings).toEqual([]);
  });

  it('never flags non-HTML or non-2xx pages (gating)', async () => {
    await seedPages(auditId, [
      { url: 'https://t/404', statusClass: '4xx', pageKind: 'html', ogData: null },
      { url: 'https://t/sitemap', statusClass: '2xx', pageKind: 'sitemap', ogData: null },
    ]);

    const findings = await runRule(metaOpengraphRule, auditId);

    expect(findings).toEqual([]);
  });
});
