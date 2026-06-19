import {
  isLocalBusinessType,
  validateNode,
  validateStructuredData,
} from './structured-data.validator';
import type { ExtractedStructuredData } from './crawl.types';

describe('structured-data.validator', () => {
  describe('validateNode — base types', () => {
    const cases: { type: string; valid: Record<string, unknown>; missingRequired: string }[] = [
      { type: 'Organization', valid: { name: 'X', url: 'https://x' }, missingRequired: 'name' },
      {
        type: 'BreadcrumbList',
        valid: { itemListElement: [{}] },
        missingRequired: 'itemListElement',
      },
      { type: 'Product', valid: { name: 'P' }, missingRequired: 'name' },
      { type: 'FAQPage', valid: { mainEntity: [{}] }, missingRequired: 'mainEntity' },
      { type: 'Article', valid: { headline: 'H' }, missingRequired: 'headline' },
      {
        type: 'Event',
        valid: { name: 'E', startDate: '2026-01-01', location: 'Kyiv' },
        missingRequired: 'startDate',
      },
    ];

    for (const c of cases) {
      it(`${c.type}: fully-present node is valid with no errors`, () => {
        const r = validateNode(c.valid, c.type);
        expect(r.valid).toBe(true);
        expect(r.errors.filter((e) => e.code === 'missing-required')).toEqual([]);
      });

      it(`${c.type}: a missing required prop fails validity`, () => {
        const node = { ...c.valid };
        delete (node as Record<string, unknown>)[c.missingRequired];
        const r = validateNode(node, c.type);
        expect(r.valid).toBe(false);
        expect(
          r.errors.some((e) => e.code === 'missing-required' && e.prop === c.missingRequired),
        ).toBe(true);
      });
    }

    it('Organization missing a recommended prop is still valid but annotated', () => {
      const r = validateNode({ name: 'X', url: 'https://x' }, 'Organization');
      expect(r.valid).toBe(true);
      expect(r.errors.some((e) => e.code === 'missing-recommended' && e.prop === 'logo')).toBe(
        true,
      );
      expect(r.errors.some((e) => e.code === 'missing-recommended' && e.prop === 'sameAs')).toBe(
        true,
      );
    });

    it('unknown @type is valid with no errors (not penalised)', () => {
      const r = validateNode({ foo: 'bar' }, 'WebSite');
      expect(r).toEqual({ valid: true, errors: [] });
    });

    it('null @type is valid with no errors', () => {
      const r = validateNode({}, null);
      expect(r).toEqual({ valid: true, errors: [] });
    });
  });

  describe('LocalBusiness NAP / geo / hours / phone', () => {
    const full = {
      name: 'ОЛІМП',
      address: { streetAddress: 'вул. Хрещатик 1', addressLocality: 'Kyiv' },
      telephone: '+380441234567',
      geo: { latitude: 50.45, longitude: 30.52 },
      openingHoursSpecification: [{ opens: '08:00', closes: '22:00' }],
    };

    it('treats Gym / HealthClub / SportsActivityLocation as LocalBusiness', () => {
      expect(isLocalBusinessType('Gym')).toBe(true);
      expect(isLocalBusinessType('HealthClub')).toBe(true);
      expect(isLocalBusinessType('SportsActivityLocation')).toBe(true);
      expect(isLocalBusinessType('Product')).toBe(false);
    });

    it('fully-populated LocalBusiness is valid with no errors', () => {
      const r = validateNode(full, 'Gym');
      expect(r.valid).toBe(true);
      expect(r.errors).toEqual([]);
    });

    it('missing geo + telephone annotate as recommended (still valid — address present)', () => {
      const node = { name: 'ОЛІМП', address: full.address };
      const r = validateNode(node, 'LocalBusiness');
      expect(r.valid).toBe(true);
      expect(r.errors.some((e) => e.prop === 'telephone' && e.code === 'missing-recommended')).toBe(
        true,
      );
      expect(r.errors.some((e) => e.prop === 'geo' && e.code === 'missing-recommended')).toBe(true);
      expect(
        r.errors.some((e) => e.prop === 'openingHours' && e.code === 'missing-recommended'),
      ).toBe(true);
    });

    it('missing address fails validity (missing-required)', () => {
      const node = { name: 'ОЛІМП' };
      const r = validateNode(node, 'Gym');
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.prop === 'address' && e.code === 'missing-required')).toBe(
        true,
      );
    });

    it('incomplete PostalAddress (no locality) fails the address check', () => {
      const node = { name: 'ОЛІМП', address: { streetAddress: 'вул. Х 1' } };
      const r = validateNode(node, 'LocalBusiness');
      expect(r.errors.some((e) => e.prop === 'address' && e.code === 'missing-required')).toBe(
        true,
      );
    });

    it('accepts a string address', () => {
      const node = {
        name: 'ОЛІМП',
        address: 'Kyiv, вул. Х 1',
        telephone: '+380',
        geo: full.geo,
        openingHours: 'Mo-Su',
      };
      const r = validateNode(node, 'LocalBusiness');
      expect(r.errors.some((e) => e.prop === 'address')).toBe(false);
    });
  });

  describe('validateStructuredData (in place)', () => {
    it('fills valid/errors for parsed nodes and leaves json-syntax nodes untouched', () => {
      const nodes: ExtractedStructuredData[] = [
        {
          type: 'Organization',
          valid: true,
          raw: '{}',
          errors: [],
          node: { name: 'X' }, // missing url
        },
        {
          type: null,
          valid: false,
          raw: 'broken',
          errors: [{ code: 'json-syntax', message: 'bad' }],
        },
      ];

      validateStructuredData(nodes);

      expect(nodes[0]!.valid).toBe(false);
      expect(nodes[0]!.errors.some((e) => e.prop === 'url' && e.code === 'missing-required')).toBe(
        true,
      );
      // syntax node untouched
      expect(nodes[1]!.valid).toBe(false);
      expect(nodes[1]!.errors).toEqual([{ code: 'json-syntax', message: 'bad' }]);
    });
  });
});
