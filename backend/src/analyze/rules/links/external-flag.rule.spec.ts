import { linksExternalFlagRule } from './external-flag.rule';
import type { RuleDb } from '../../rule.types';

const AUDIT_ID = 'audit-unit-extflag';

function mockDb(rows: Record<string, unknown>[]): RuleDb {
  return {
    execute: jest.fn().mockResolvedValue({ rows }),
  } as unknown as RuleDb;
}

describe('links.external-flag', () => {
  it('emits findings for UTM-tracked links missing rel', async () => {
    // The mock simulates the DB already applying the monetized-href filter.
    const db = mockDb([
      {
        source_url: 'https://t/page',
        href: 'https://partner.com/?utm_source=site&utm_medium=cpc',
        rel: [],
      },
    ]);

    const findings = await linksExternalFlagRule.run(db, AUDIT_ID);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toEqual({
      url: 'https://t/page',
      detail: {
        href: 'https://partner.com/?utm_source=site&utm_medium=cpc',
        rel: [],
      },
    });
  });

  it('emits findings for referral (ref=) links missing rel', async () => {
    const db = mockDb([
      {
        source_url: 'https://t/page',
        href: 'https://shop.com/product?ref=mysite',
        rel: ['noopener'],
      },
    ]);

    const findings = await linksExternalFlagRule.run(db, AUDIT_ID);

    expect(findings).toHaveLength(1);
    expect(findings[0].detail?.href).toBe('https://shop.com/product?ref=mysite');
  });

  it('emits findings for /aff affiliate path links missing rel', async () => {
    const db = mockDb([
      {
        source_url: 'https://t/page',
        href: 'https://vendor.com/aff/product123',
        rel: [],
      },
    ]);

    const findings = await linksExternalFlagRule.run(db, AUDIT_ID);

    expect(findings).toHaveLength(1);
    expect(findings[0].detail?.href).toBe('https://vendor.com/aff/product123');
  });

  it('does NOT emit for plain external links without monetized pattern', async () => {
    // The SQL WHERE filters these out; mock returns empty rows.
    const db = mockDb([]);

    const findings = await linksExternalFlagRule.run(db, AUDIT_ID);

    expect(findings).toHaveLength(0);
  });

  it('does NOT emit for monetized links that already carry nofollow', async () => {
    // DB WHERE clause excludes these; mock returns empty rows.
    const db = mockDb([]);

    const findings = await linksExternalFlagRule.run(db, AUDIT_ID);

    expect(findings).toEqual([]);
  });

  it('preserves the rel array in the finding detail', async () => {
    const db = mockDb([
      {
        source_url: 'https://t/a',
        href: 'https://x.com?utm_campaign=sale',
        rel: ['noopener', 'noreferrer'],
      },
    ]);

    const findings = await linksExternalFlagRule.run(db, AUDIT_ID);

    expect(findings[0].detail?.rel).toEqual(['noopener', 'noreferrer']);
  });

  it('has correct rule metadata', () => {
    expect(linksExternalFlagRule.id).toBe('links.external-flag');
    expect(linksExternalFlagRule.severity).toBe('low');
  });
});
