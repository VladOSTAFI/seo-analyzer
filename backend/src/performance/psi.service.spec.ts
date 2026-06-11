import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Env } from '../config/env.validation';
import { PsiService } from './psi.service';

/** Load a saved runPagespeed v5 fixture from test/fixtures/psi. */
function loadFixture(name: string): Record<string, unknown> {
  const path = resolve(__dirname, '../../test/fixtures/psi', name);
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

const MOBILE_FULL = loadFixture('mobile-full.json');
const DESKTOP_LAB_ONLY = loadFixture('desktop-lab-only.json');
const MOBILE_ORIGIN_FALLBACK = loadFixture('mobile-origin-fallback.json');

/**
 * Build a minimal fake Env exposing just the fields PsiService reads. A high
 * CRAWL_RATE_LIMIT makes the inter-request gap ~0 so pacing never delays tests.
 */
function fakeEnv(overrides: Partial<Env> = {}): Env {
  return {
    PSI_API_KEY: '',
    CRAWL_RATE_LIMIT: 1000,
    ...overrides,
  } as Env;
}

/** A fetch mock that resolves with an ok Response yielding `json`. */
function okFetch(json: unknown): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => json,
    text: async () => JSON.stringify(json),
  } as unknown as Response);
}

describe('PsiService.fetch', () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('parses full field-data + lab metrics (CLS ÷100, score ×100, rounded ms ints)', async () => {
    global.fetch = okFetch(MOBILE_FULL);
    const service = new PsiService(fakeEnv());

    const metrics = await service.fetch('https://example.com/', 'mobile');

    // Field (CrUX) preferred for LCP/CLS/INP.
    expect(metrics.lcpMs).toBe(3210);
    expect(metrics.cls).toBe(0.12); // percentile 12 ÷ 100
    expect(metrics.inpMs).toBe(245);

    // Lab metrics.
    expect(metrics.performanceScore).toBe(74); // 0.74 × 100
    expect(metrics.fcpMs).toBe(2103); // round(2103.4)
    expect(metrics.tbtMs).toBe(488); // round(487.6)
    expect(metrics.speedIndexMs).toBe(3550); // round(3550.2)

    // raw is the untouched parsed JSON.
    expect(metrics.raw).toEqual(MOBILE_FULL);
  });

  it('falls back to lab LCP/CLS when loadingExperience is missing; INP stays null', async () => {
    global.fetch = okFetch(DESKTOP_LAB_ONLY);
    const service = new PsiService(fakeEnv());

    const metrics = await service.fetch('https://example.com/low-traffic', 'desktop');

    expect(metrics.lcpMs).toBe(1502); // lab numericValue 1502.3, NOT ÷100
    expect(metrics.cls).toBe(0.021); // lab CLS already 0..1, NOT ÷100
    expect(metrics.inpMs).toBeNull(); // no field data, no lab INP
    expect(metrics.performanceScore).toBe(91);
    expect(metrics.fcpMs).toBe(902);
  });

  it('collects low-score perf opportunities + failing SEO audits, excludes >=0.9, sorted & deduped', async () => {
    global.fetch = okFetch(MOBILE_FULL);
    const service = new PsiService(fakeEnv());

    const { usabilityFlags } = await service.fetch('https://example.com/', 'mobile');

    // Perf problems (<0.9, non-null): fcp 0.62, lcp 0.41, tbt 0.55, si 0.7,
    // cls 0.88, uses-responsive-images 0.33, render-blocking 0.5.
    // Excluded: uses-long-cache-ttl (null score), efficient-animated-content (1.0).
    // SEO failures (<1, non-null): meta-description 0, tap-targets 0.66.
    // Excluded: viewport 1, document-title 1, image-alt (null).
    expect(usabilityFlags).toEqual([
      'cumulative-layout-shift',
      'first-contentful-paint',
      'largest-contentful-paint',
      'meta-description',
      'render-blocking-resources',
      'speed-index',
      'tap-targets',
      'total-blocking-time',
      'uses-responsive-images',
    ]);

    // Sorted ascending and deduped.
    expect([...usabilityFlags]).toEqual([...usabilityFlags].sort());
    expect(new Set(usabilityFlags).size).toBe(usabilityFlags.length);

    // Null-score and >=0.9/>=1 audits are excluded.
    expect(usabilityFlags).not.toContain('uses-long-cache-ttl');
    expect(usabilityFlags).not.toContain('efficient-animated-content');
    expect(usabilityFlags).not.toContain('viewport');
    expect(usabilityFlags).not.toContain('image-alt');
  });

  it('omits key when PSI_API_KEY is empty and includes both category params + strategy', async () => {
    const mock = okFetch(MOBILE_FULL);
    global.fetch = mock;
    const service = new PsiService(fakeEnv({ PSI_API_KEY: '' }));

    await service.fetch('https://example.com/page?q=1', 'mobile');

    const calledUrl = mock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('https://www.googleapis.com/pagespeedonline/v5/runPagespeed?');
    expect(calledUrl).toContain('category=performance');
    expect(calledUrl).toContain('category=seo');
    expect(calledUrl).toContain('strategy=mobile');
    expect(calledUrl).toContain('url=https%3A%2F%2Fexample.com%2Fpage%3Fq%3D1');
    expect(calledUrl).not.toContain('key=');
  });

  it('appends key when PSI_API_KEY is non-empty and passes the strategy through', async () => {
    const mock = okFetch(DESKTOP_LAB_ONLY);
    global.fetch = mock;
    const service = new PsiService(fakeEnv({ PSI_API_KEY: 'secret-key-123' }));

    await service.fetch('https://example.com/', 'desktop');

    const calledUrl = mock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('key=secret-key-123');
    expect(calledUrl).toContain('strategy=desktop');
  });

  it('throws an informative error on a non-ok response (e.g. 429)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({}),
      text: async () => 'Quota exceeded for quota metric',
    } as unknown as Response);
    const service = new PsiService(fakeEnv());

    await expect(service.fetch('https://example.com/', 'mobile')).rejects.toThrow(
      /PSI request failed \(429\) for https:\/\/example\.com\/ \[mobile\]: Quota exceeded/,
    );
  });

  it('throws a network error when fetch itself rejects', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
    const service = new PsiService(fakeEnv());

    await expect(service.fetch('https://example.com/', 'desktop')).rejects.toThrow(
      /PSI request failed \(network\) for https:\/\/example\.com\/ \[desktop\]: ECONNRESET/,
    );
  });

  it('passes an AbortSignal and throws a timeout error when the request hangs', async () => {
    jest.useFakeTimers();
    try {
      // Simulate a hung request: fetch never settles on its own; it rejects only
      // when its AbortSignal fires (as Node's fetch does on abort). Capture the
      // signal from inside the mock so we don't race the service's first await.
      let captured: AbortSignal | undefined;
      const mock = jest.fn((_url: string, init?: { signal?: AbortSignal }) => {
        captured = init?.signal;
        return new Promise<Response>((_resolve, reject) => {
          captured?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        });
      });
      global.fetch = mock as unknown as typeof global.fetch;

      const service = new PsiService(fakeEnv());
      const promise = service.fetch('https://example.com/', 'mobile');
      // Attach a rejection handler immediately so the eventual reject is never
      // an unhandled rejection while we drive the fake clock.
      const settled = expect(promise).rejects.toThrow(
        /PSI request failed \(timeout after \d+ms\) for https:\/\/example\.com\/ \[mobile\]/,
      );

      // Let the service get past pace() and actually call fetch with the signal.
      await Promise.resolve();
      await Promise.resolve();
      expect(mock).toHaveBeenCalledTimes(1);
      expect(captured).toBeInstanceOf(AbortSignal);
      expect(captured?.aborted).toBe(false);

      // Advance past the request timeout → controller.abort() fires → fetch rejects.
      jest.advanceTimersByTime(30_000);

      await settled;
      expect(captured?.aborted).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  describe('CWV provenance (cwvSource + isOriginFallback)', () => {
    it('reports cwvSource=field and isOriginFallback=false for a normal page-level response', async () => {
      global.fetch = okFetch(MOBILE_FULL);
      const service = new PsiService(fakeEnv());

      const metrics = await service.fetch('https://example.com/', 'mobile');

      expect(metrics.cwvSource).toBe('field');
      expect(metrics.isOriginFallback).toBe(false);
    });

    it('reports cwvSource=lab and isOriginFallback=false when loadingExperience is absent', async () => {
      global.fetch = okFetch(DESKTOP_LAB_ONLY);
      const service = new PsiService(fakeEnv());

      const metrics = await service.fetch('https://example.com/low-traffic', 'desktop');

      // No loadingExperience → no field data; lab LCP/CLS are present.
      expect(metrics.cwvSource).toBe('lab');
      expect(metrics.isOriginFallback).toBe(false);
    });

    it('reports cwvSource=field and isOriginFallback=true when origin_fallback=true with field metrics', async () => {
      global.fetch = okFetch(MOBILE_ORIGIN_FALLBACK);
      const service = new PsiService(fakeEnv());

      const metrics = await service.fetch('https://example.com/some-page', 'mobile');

      // origin_fallback=true in loadingExperience AND field metrics present.
      expect(metrics.cwvSource).toBe('field');
      expect(metrics.isOriginFallback).toBe(true);

      // CWV values are still parsed from the origin-level field metrics.
      expect(metrics.lcpMs).toBe(4100);
      expect(metrics.cls).toBe(0.15); // percentile 15 ÷ 100
      expect(metrics.inpMs).toBe(320);
    });

    it('reports cwvSource=none and isOriginFallback=false when no CWV data at all', async () => {
      // Construct a minimal response: no loadingExperience and no lab LCP/CLS audits.
      const noData = {
        lighthouseResult: {
          categories: {
            performance: { id: 'performance', score: 0.8, auditRefs: [] },
          },
          audits: {
            'first-contentful-paint': { score: 0.9, numericValue: 1000 },
          },
        },
      };
      global.fetch = okFetch(noData);
      const service = new PsiService(fakeEnv());

      const metrics = await service.fetch('https://example.com/ghost', 'desktop');

      expect(metrics.cwvSource).toBe('none');
      expect(metrics.isOriginFallback).toBe(false);
      expect(metrics.lcpMs).toBeNull();
      expect(metrics.cls).toBeNull();
      expect(metrics.inpMs).toBeNull();
    });
  });
});
