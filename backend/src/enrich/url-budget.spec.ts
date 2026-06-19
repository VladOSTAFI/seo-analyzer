import { applyBudget } from './url-budget';

describe('applyBudget', () => {
  it('returns all candidates when both caps are not reached', () => {
    const urls = ['https://a.com/1', 'https://b.com/2', 'https://c.com/3'];
    const result = applyBudget(urls, 5, 10);

    expect(result.urls).toEqual(urls);
    expect(result.perHostTruncated).toBe(false);
    expect(result.totalTruncated).toBe(false);
  });

  it('trims per-host when a single host exceeds the per-host cap', () => {
    const urls = [
      'https://example.com/1',
      'https://example.com/2',
      'https://example.com/3',
      'https://other.com/x',
    ];
    const result = applyBudget(urls, 2, 100);

    // Only 2 from example.com kept, all from other.com kept.
    expect(result.urls).toEqual([
      'https://example.com/1',
      'https://example.com/2',
      'https://other.com/x',
    ]);
    expect(result.perHostTruncated).toBe(true);
    expect(result.totalTruncated).toBe(false);
  });

  it('applies the total cap after per-host trimming', () => {
    const urls = [
      'https://a.com/1',
      'https://b.com/2',
      'https://c.com/3',
      'https://d.com/4',
      'https://e.com/5',
    ];
    const result = applyBudget(urls, 5, 3);

    expect(result.urls).toHaveLength(3);
    expect(result.urls).toEqual(['https://a.com/1', 'https://b.com/2', 'https://c.com/3']);
    expect(result.totalTruncated).toBe(true);
  });

  it('applies both per-host and total caps in combination', () => {
    const urls = [
      'https://a.com/1',
      'https://a.com/2', // a.com will be trimmed to 1
      'https://b.com/1',
      'https://c.com/1',
    ];
    // perHostMax=1 → keeps one from each host → 3 URLs
    // totalMax=2 → trims to 2
    const result = applyBudget(urls, 1, 2);

    expect(result.urls).toEqual(['https://a.com/1', 'https://b.com/1']);
    expect(result.perHostTruncated).toBe(true);
    expect(result.totalTruncated).toBe(true);
  });

  it('returns empty list for empty input', () => {
    const result = applyBudget([], 5, 100);

    expect(result.urls).toEqual([]);
    expect(result.perHostTruncated).toBe(false);
    expect(result.totalTruncated).toBe(false);
  });

  it('per-host cap of 1 keeps exactly one URL per host', () => {
    const urls = [
      'https://example.com/page1',
      'https://example.com/page2',
      'https://example.com/page3',
    ];
    const result = applyBudget(urls, 1, 100);

    expect(result.urls).toEqual(['https://example.com/page1']);
    expect(result.perHostTruncated).toBe(true);
  });

  it('does not set perHostTruncated when each host appears exactly at the cap', () => {
    const urls = ['https://a.com/1', 'https://a.com/2', 'https://b.com/1', 'https://b.com/2'];
    const result = applyBudget(urls, 2, 100);

    // Exactly 2 from each host → no truncation.
    expect(result.urls).toEqual(urls);
    expect(result.perHostTruncated).toBe(false);
    expect(result.totalTruncated).toBe(false);
  });

  it('preserves order (first-seen per host is retained)', () => {
    const urls = [
      'https://z.com/first',
      'https://a.com/first',
      'https://z.com/second', // dropped by per-host cap
      'https://a.com/second', // dropped by per-host cap
    ];
    const result = applyBudget(urls, 1, 100);

    expect(result.urls).toEqual(['https://z.com/first', 'https://a.com/first']);
  });

  it('passes through unparseable URLs without counting them against any host', () => {
    const urls = ['not-a-valid-url', 'https://example.com/ok'];
    const result = applyBudget(urls, 1, 100);

    // Both kept (invalid URL passes through, valid URL is under the host cap).
    expect(result.urls).toEqual(['not-a-valid-url', 'https://example.com/ok']);
    expect(result.perHostTruncated).toBe(false);
  });
});
