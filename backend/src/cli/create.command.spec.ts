import { InvalidArgumentError } from '../common/errors';
import { audits } from '../db/schema';
import type { Database } from '../db/db.types';
import { CreateCommand, buildAuditPayload, parseStartUrl } from './create.command';

describe('parseStartUrl', () => {
  it('accepts a well-formed https URL', () => {
    expect(parseStartUrl('https://example.com')).toBe('https://example.com/');
  });

  it('accepts a well-formed http URL with a path', () => {
    expect(parseStartUrl('http://example.com/foo')).toBe('http://example.com/foo');
  });

  it('rejects a missing argument', () => {
    expect(() => parseStartUrl(undefined)).toThrow(InvalidArgumentError);
    expect(() => parseStartUrl('')).toThrow(InvalidArgumentError);
  });

  it('rejects a malformed URL', () => {
    expect(() => parseStartUrl('not a url')).toThrow(InvalidArgumentError);
    expect(() => parseStartUrl('example.com')).toThrow(InvalidArgumentError);
  });

  it('rejects non-http(s) schemes', () => {
    expect(() => parseStartUrl('ftp://example.com')).toThrow(InvalidArgumentError);
    expect(() => parseStartUrl('file:///etc/passwd')).toThrow(InvalidArgumentError);
  });
});

describe('buildAuditPayload', () => {
  it('produces an insert payload with the start URL and no overridden defaults', () => {
    const payload = buildAuditPayload('https://example.com/');
    expect(payload).toEqual({ startUrl: 'https://example.com/' });
    // status/id/timestamps are DB defaults — must NOT be set on the payload.
    expect(payload).not.toHaveProperty('status');
    expect(payload).not.toHaveProperty('id');
  });
});

describe('CreateCommand.run', () => {
  function mockDb(returnedId: string) {
    const returning = jest.fn().mockResolvedValue([{ id: returnedId }]);
    const values = jest.fn().mockReturnValue({ returning });
    const insert = jest.fn().mockReturnValue({ values });
    const db = { insert } as unknown as Database;
    return { db, insert, values, returning };
  }

  it('inserts an audit and prints the returned UUID to stdout', async () => {
    const id = '11111111-2222-3333-4444-555555555555';
    const { db, insert, values } = mockDb(id);
    const command = new CreateCommand(db);

    const writeSpy = jest.spyOn(process.stdout, 'write').mockReturnValue(true);

    await command.run(['https://example.com'], {});

    expect(insert).toHaveBeenCalledWith(audits);
    expect(values).toHaveBeenCalledWith({ startUrl: 'https://example.com/' });
    expect(writeSpy).toHaveBeenCalledWith(`${id}\n`);

    writeSpy.mockRestore();
  });

  it('rejects a malformed URL before touching the DB', async () => {
    const { db, insert } = mockDb('unused');
    const command = new CreateCommand(db);

    await expect(command.run(['not-a-url'], {})).rejects.toBeInstanceOf(InvalidArgumentError);
    expect(insert).not.toHaveBeenCalled();
  });
});
