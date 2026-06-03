import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  AppError,
  EmailTakenError,
  ForbiddenError,
  InvalidArgumentError,
  InvalidCredentialsError,
  UnauthorizedError,
} from '../common/errors';

/**
 * The slice of the platform response object we use. Declared locally so the
 * filter stays platform-agnostic and needs no `@types/express` dependency
 * (Express is the runtime adapter, but we only touch `.status().json()`).
 */
interface HttpResponseLike {
  status(code: number): { json(body: unknown): void };
}

/**
 * Maps domain {@link AppError}s to HTTP responses for the REST API (Phase 7+).
 *
 * The pipeline/services throw AppError subclasses rather than NestJS
 * HttpExceptions, so without this filter they would surface as opaque 500s. This
 * translates them:
 *  - InvalidArgumentError                       → 400 Bad Request
 *  - UnauthorizedError / InvalidCredentialsError → 401 Unauthorized (Phase A1)
 *  - ForbiddenError                             → 403 Forbidden     (Phase A1)
 *  - EmailTakenError                            → 409 Conflict      (Phase A1)
 *  - any other AppError                         → 500 Internal Server Error
 *
 * It only catches AppError (`@Catch(AppError)`), so HttpExceptions the controller
 * throws on purpose (NotFoundException → 404, ConflictException → 409, the
 * ZodValidationPipe's BadRequestException → 400) pass straight through to Nest's
 * default handler unchanged.
 */
@Catch(AppError)
export class AppErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(AppErrorFilter.name);

  catch(exception: AppError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<HttpResponseLike>();
    const status = statusFor(exception);

    if (status >= 500) {
      this.logger.error(`${exception.name}: ${exception.message}`, exception.stack);
    }

    res.status(status).json({
      statusCode: status,
      error: exception.name,
      message: exception.message,
    });
  }
}

/**
 * Map a domain error to its HTTP status. Order is irrelevant — each error class
 * is distinct (no subclass overlap among these), so `instanceof` checks are
 * unambiguous; anything unmapped is a server fault (500).
 */
function statusFor(exception: AppError): number {
  if (exception instanceof InvalidArgumentError) return HttpStatus.BAD_REQUEST;
  if (exception instanceof UnauthorizedError) return HttpStatus.UNAUTHORIZED;
  if (exception instanceof InvalidCredentialsError) return HttpStatus.UNAUTHORIZED;
  if (exception instanceof ForbiddenError) return HttpStatus.FORBIDDEN;
  if (exception instanceof EmailTakenError) return HttpStatus.CONFLICT;
  return HttpStatus.INTERNAL_SERVER_ERROR;
}
