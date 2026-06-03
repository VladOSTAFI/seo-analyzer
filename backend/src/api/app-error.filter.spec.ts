import type { ArgumentsHost } from '@nestjs/common';
import {
  AppError,
  DatabaseError,
  EmailTakenError,
  ForbiddenError,
  InvalidArgumentError,
  InvalidCredentialsError,
  TooManyRequestsError,
  UnauthorizedError,
} from '../common/errors';
import { AppErrorFilter } from './app-error.filter';

/**
 * Unit tests for {@link AppErrorFilter}'s domain-error → HTTP-status mapping.
 * We hand-roll a minimal ArgumentsHost whose response captures `status(code)`
 * and `json(body)`, so we assert the code and the serialized error shape without
 * a real HTTP server.
 */
function invoke(exception: AppError): { status: number; body: unknown } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;

  new AppErrorFilter().catch(exception, host);

  return { status: status.mock.calls[0][0] as number, body: json.mock.calls[0][0] };
}

describe('AppErrorFilter status mapping', () => {
  it.each([
    ['InvalidArgumentError', new InvalidArgumentError('bad url'), 400],
    ['UnauthorizedError', new UnauthorizedError('no token'), 401],
    ['InvalidCredentialsError', new InvalidCredentialsError('Invalid email or password.'), 401],
    ['ForbiddenError', new ForbiddenError('not allowed'), 403],
    ['EmailTakenError', new EmailTakenError('taken'), 409],
    ['TooManyRequestsError', new TooManyRequestsError('too many failed logins'), 429],
    ['unmapped AppError', new DatabaseError('boom'), 500],
  ])('maps %s → %i', (_name, exception, expected) => {
    expect(invoke(exception).status).toBe(expected);
  });

  it('serializes the error name + message in the body', () => {
    const { body } = invoke(new EmailTakenError('email already exists'));
    expect(body).toEqual({
      statusCode: 409,
      error: 'EmailTakenError',
      message: 'email already exists',
    });
  });
});
