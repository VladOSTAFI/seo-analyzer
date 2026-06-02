import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedImages,
} from '../../../../test/int/rule-harness';
import { imageAltTitleRule } from './alt-title.rule';

describe('image.alt-title (int)', () => {
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

  it('flags images with a missing (null) alt', async () => {
    await seedImages(auditId, [
      { pageUrl: 'https://t/a', src: 'https://t/img/hero.png', alt: null },
    ]);

    const findings = await runRule(imageAltTitleRule, auditId);

    expect(findings).toEqual([
      {
        url: 'https://t/a',
        detail: { src: 'https://t/img/hero.png', alt: null, altState: 'missing' },
      },
    ]);
  });

  it('flags images with an empty-string alt and labels it as empty', async () => {
    await seedImages(auditId, [{ pageUrl: 'https://t/a', src: 'https://t/img/deco.png', alt: '' }]);

    const findings = await runRule(imageAltTitleRule, auditId);

    expect(findings).toEqual([
      {
        url: 'https://t/a',
        detail: { src: 'https://t/img/deco.png', alt: '', altState: 'empty' },
      },
    ]);
  });

  it('does not flag an image with non-empty alt text', async () => {
    await seedImages(auditId, [
      { pageUrl: 'https://t/a', src: 'https://t/img/logo.png', alt: 'logo' },
    ]);

    const findings = await runRule(imageAltTitleRule, auditId);

    expect(findings).toEqual([]);
  });
});
