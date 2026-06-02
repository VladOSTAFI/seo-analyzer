import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedHreflang,
} from '../../../../test/int/rule-harness';
import { i18nHreflangRule } from './hreflang.rule';

describe('i18n.hreflang (int)', () => {
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

  it('flags a non-reciprocal entry with a valid lang', async () => {
    await seedHreflang(auditId, [
      {
        pageUrl: 'https://t/en',
        lang: 'en',
        href: 'https://t/de',
        isReciprocal: false,
      },
    ]);

    const findings = await runRule(i18nHreflangRule, auditId);

    expect(findings).toEqual([
      {
        url: 'https://t/en',
        detail: { lang: 'en', href: 'https://t/de', issue: 'non-reciprocal' },
      },
    ]);
  });

  it('flags an invalid lang code even when reciprocal', async () => {
    await seedHreflang(auditId, [
      {
        pageUrl: 'https://t/en',
        lang: 'EN_us', // underscore is not a valid subtag separator
        href: 'https://t/de',
        isReciprocal: true,
      },
    ]);

    const findings = await runRule(i18nHreflangRule, auditId);

    expect(findings).toEqual([
      {
        url: 'https://t/en',
        detail: { lang: 'EN_us', href: 'https://t/de', issue: 'invalid-lang' },
      },
    ]);
  });

  it('composes both issues when non-reciprocal AND invalid lang', async () => {
    await seedHreflang(auditId, [
      {
        pageUrl: 'https://t/en',
        lang: 'nope_bad',
        href: 'https://t/de',
        isReciprocal: false,
      },
    ]);

    const findings = await runRule(i18nHreflangRule, auditId);

    expect(findings).toEqual([
      {
        url: 'https://t/en',
        detail: { lang: 'nope_bad', href: 'https://t/de', issue: 'non-reciprocal,invalid-lang' },
      },
    ]);
  });

  it('does not flag a reciprocal entry with a valid lang (incl. case-insensitive + x-default)', async () => {
    await seedHreflang(auditId, [
      {
        pageUrl: 'https://t/en',
        lang: 'en-US',
        href: 'https://t/de',
        isReciprocal: true,
      },
      {
        pageUrl: 'https://t/en',
        lang: 'x-default',
        href: 'https://t/',
        isReciprocal: true,
      },
    ]);

    const findings = await runRule(i18nHreflangRule, auditId);

    expect(findings).toEqual([]);
  });
});
