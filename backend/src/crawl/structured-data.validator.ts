import type { ExtractedStructuredData, SchemaError } from './crawl.types';

/**
 * Pure shape-checker for the parse-only {@link ExtractedStructuredData} nodes
 * produced by {@link ExtractService.extract}. No DB, no network, no throw — a
 * malformed node degrades to "recorded but unpenalised".
 *
 * Deliberately hand-rolled (no `schema-dts` runtime weight): a frozen map of a
 * bounded set of types → required vs recommended props. `required` absent ⇒
 * `valid=false` + a `missing-required` error; `recommended` absent ⇒ a
 * `missing-recommended` annotation (rich-result gap) that does NOT fail
 * validity. Unknown `@type` is valid with no errors (we don't model it) but is
 * still recorded so `schema.missing` sees that *some* structured data exists.
 */

interface SchemaRule {
  required: string[];
  recommended: string[];
}

/** type → required / recommended (recommended = rich-result eligibility). */
const SCHEMA_MAP: Record<string, SchemaRule> = {
  Organization: { required: ['name', 'url'], recommended: ['logo', 'sameAs'] },
  LocalBusiness: {
    required: ['name', 'address'],
    recommended: ['telephone', 'geo', 'openingHours', 'priceRange'],
  },
  BreadcrumbList: { required: ['itemListElement'], recommended: [] },
  Product: { required: ['name'], recommended: ['image', 'offers', 'aggregateRating', 'review'] },
  FAQPage: { required: ['mainEntity'], recommended: [] },
  Article: { required: ['headline'], recommended: ['image', 'author', 'datePublished'] },
  Event: { required: ['name', 'startDate', 'location'], recommended: ['endDate', 'offers'] },
};

/**
 * schema.org subtypes whose ancestry is LocalBusiness; for the bounded scope we
 * map a small allowlist onto the LocalBusiness ruleset (plus the literal type).
 */
export const LOCAL_BUSINESS_TYPES = new Set([
  'LocalBusiness',
  'Gym',
  'HealthClub',
  'SportsActivityLocation',
  'ExerciseGym',
  'SportsClub',
]);

/** True for a `@type` that should be validated against the LocalBusiness ruleset. */
export function isLocalBusinessType(type: string | null): boolean {
  return type !== null && LOCAL_BUSINESS_TYPES.has(type);
}

/** A property is "present" when it is a non-empty value / non-empty array / object. */
function isPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as object).length > 0;
  return true; // numbers, booleans
}

/** Read a possibly-nested object property (objects, or the first element of an array of objects). */
function asObject(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    const first = value.find((v) => v && typeof v === 'object');
    return (first as Record<string, unknown>) ?? null;
  }
  if (value && typeof value === 'object') return value as Record<string, unknown>;
  return null;
}

/**
 * NAP / geo / hours / phone completeness checks for a LocalBusiness node, tied
 * to the §6 multi-location use case. Each missing item is annotated so the
 * `schema.localbusiness` rule can list the gaps; `address`/`name` gaps are
 * `missing-required` (already covered by the base map), geo/hours/phone are
 * `missing-recommended` rich-result gaps.
 */
function localBusinessErrors(node: Record<string, unknown>, type: string): SchemaError[] {
  const errors: SchemaError[] = [];

  // address: string OR PostalAddress with streetAddress + addressLocality.
  const address = node.address;
  let addressOk = false;
  if (typeof address === 'string') {
    addressOk = address.trim().length > 0;
  } else {
    const addr = asObject(address);
    addressOk = addr !== null && isPresent(addr.streetAddress) && isPresent(addr.addressLocality);
  }
  if (!addressOk) {
    errors.push({ code: 'missing-required', prop: 'address', type });
  }

  // telephone (phone).
  if (!isPresent(node.telephone)) {
    errors.push({ code: 'missing-recommended', prop: 'telephone', type });
  }

  // geo: GeoCoordinates with latitude + longitude.
  const geo = asObject(node.geo);
  if (!(geo !== null && isPresent(geo.latitude) && isPresent(geo.longitude))) {
    errors.push({ code: 'missing-recommended', prop: 'geo', type });
  }

  // opening hours: openingHours OR openingHoursSpecification.
  if (!isPresent(node.openingHours) && !isPresent(node.openingHoursSpecification)) {
    errors.push({ code: 'missing-recommended', prop: 'openingHours', type });
  }

  return errors;
}

/**
 * Shape-check one parsed JSON-LD node. Returns the validity verdict + the error
 * annotations. `valid=false` only when a `required` prop is missing (recommended
 * gaps never fail validity). Unknown types are valid with no errors.
 */
export function validateNode(node: Record<string, unknown>, type: string | null): {
  valid: boolean;
  errors: SchemaError[];
} {
  const errors: SchemaError[] = [];

  if (isLocalBusinessType(type)) {
    // LocalBusiness (incl. subtypes): base required (name) + NAP/geo/hours/phone.
    const t = type as string;
    if (!isPresent(node.name)) {
      errors.push({ code: 'missing-required', prop: 'name', type: t });
    }
    errors.push(...localBusinessErrors(node, t));
  } else if (type !== null && SCHEMA_MAP[type]) {
    const rule = SCHEMA_MAP[type];
    for (const prop of rule.required) {
      if (!isPresent(node[prop])) {
        errors.push({ code: 'missing-required', prop, type });
      }
    }
    for (const prop of rule.recommended) {
      if (!isPresent(node[prop])) {
        errors.push({ code: 'missing-recommended', prop, type });
      }
    }
  }
  // Unknown / null type → no errors, valid.

  const valid = !errors.some((e) => e.code === 'missing-required');
  return { valid, errors };
}

/**
 * Run {@link validateNode} over every extracted node IN PLACE — fills `valid`
 * and `errors` on each node that parsed (those carrying a `node` object). Nodes
 * that failed JSON parsing (`node` undefined, already `valid=false` with a
 * `json-syntax` error) are left untouched. Pure: returns the same array for
 * call-site chaining. Never throws.
 */
export function validateStructuredData(
  nodes: ExtractedStructuredData[],
): ExtractedStructuredData[] {
  for (const n of nodes) {
    if (!n.node) continue; // JSON-syntax failure — keep extractor's verdict.
    try {
      const { valid, errors } = validateNode(n.node, n.type);
      n.valid = valid;
      n.errors = errors;
    } catch {
      // Best-effort: never let validation break the crawl.
    }
  }
  return nodes;
}
