import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { indexSoft404Rule } from './soft-404.rule';

describe('index.soft-404 (int)', () => {
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

  it('flags 2xx html pages whose title/h1 matches the EN/RU/UK error vocabulary; ignores healthy short pages', async () => {
    await seedPages(auditId, [
      // EN: title match
      { url: 'https://t/en-title', statusClass: '2xx', pageKind: 'html', title: ['404 Not Found'] },
      // EN: h1 match
      {
        url: 'https://t/en-h1',
        statusClass: '2xx',
        pageKind: 'html',
        title: ['Some Page'],
        h1: ['Page not found'],
      },
      // RU: title match
      {
        url: 'https://t/ru',
        statusClass: '2xx',
        pageKind: 'html',
        title: ['Страница не найдена'],
      },
      // UK: h1 match
      {
        url: 'https://t/uk',
        statusClass: '2xx',
        pageKind: 'html',
        h1: ['Нічого не знайдено'],
      },
      // negative: legitimate short "thank you" page
      {
        url: 'https://t/thanks',
        statusClass: '2xx',
        pageKind: 'html',
        title: ['Thank you'],
        h1: ['Thanks for your order'],
      },
      // negative: a real 404 (non-2xx) — out of scope (the rule is for SOFT 404s)
      {
        url: 'https://t/real-404',
        statusClass: '4xx',
        pageKind: 'html',
        title: ['404 Not Found'],
      },
    ]);

    const findings = await runRule(indexSoft404Rule, auditId);
    const urls = findings.map((f) => f.url).sort();
    expect(urls).toEqual(['https://t/en-h1', 'https://t/en-title', 'https://t/ru', 'https://t/uk']);

    const enTitle = findings.find((f) => f.url === 'https://t/en-title');
    expect(enTitle?.detail).toMatchObject({ title: '404 Not Found' });
    expect(enTitle?.confidence).toBeUndefined(); // static rule confidence (medium) applies
  });
});
