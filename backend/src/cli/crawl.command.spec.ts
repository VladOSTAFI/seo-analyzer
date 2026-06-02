import { InvalidArgumentError } from '../common/errors';
import type { CrawlService } from '../crawl/crawl.service';
import type { CrawlSummary } from '../crawl/crawl.types';
import { CrawlCommand, parseAuditId } from './crawl.command';

const VALID_ID = '11111111-2222-3333-4444-555555555555';

describe('parseAuditId', () => {
  it('accepts a UUID-ish id', () => {
    expect(parseAuditId(VALID_ID)).toBe(VALID_ID);
    expect(parseAuditId(`  ${VALID_ID}  `)).toBe(VALID_ID);
  });

  it('rejects a missing argument', () => {
    expect(() => parseAuditId(undefined)).toThrow(InvalidArgumentError);
    expect(() => parseAuditId('')).toThrow(InvalidArgumentError);
  });

  it('rejects a non-UUID string', () => {
    expect(() => parseAuditId('not-an-id')).toThrow(InvalidArgumentError);
    expect(() => parseAuditId('123')).toThrow(InvalidArgumentError);
  });
});

describe('CrawlCommand.run', () => {
  function makeCrawl(summary: CrawlSummary) {
    const crawl = jest.fn().mockResolvedValue(summary);
    const service = { crawl } as unknown as CrawlService;
    return { service, crawl };
  }

  it('runs the crawl and prints a summary line to stdout', async () => {
    const summary: CrawlSummary = { pages: 3, links: 7, images: 2, hreflang: 1 };
    const { service, crawl } = makeCrawl(summary);
    const command = new CrawlCommand(service);
    const writeSpy = jest.spyOn(process.stdout, 'write').mockReturnValue(true);

    await command.run([VALID_ID], {});

    expect(crawl).toHaveBeenCalledWith(VALID_ID);
    expect(writeSpy).toHaveBeenCalledWith('pages=3, links=7, images=2, hreflang=1\n');

    writeSpy.mockRestore();
  });

  it('rejects a malformed id before touching the service', async () => {
    const { service, crawl } = makeCrawl({ pages: 0, links: 0, images: 0, hreflang: 0 });
    const command = new CrawlCommand(service);

    await expect(command.run(['bad'], {})).rejects.toBeInstanceOf(InvalidArgumentError);
    expect(crawl).not.toHaveBeenCalled();
  });
});
