import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../api/zod-validation.pipe';
import { LoginBody, RegisterBody } from './auth.dto';
import { AuthService, type IssuedTokens } from './auth.service';

/**
 * Auth HTTP surface (Phase A1).
 *
 *   POST /auth/register → 201 + { accessToken, refreshToken }
 *   POST /auth/login    → 200 + { accessToken, refreshToken }
 *
 * Thin by design — all identity logic lives in {@link AuthService}; this layer
 * only validates the body (via {@link ZodValidationPipe}) and pins status codes.
 *
 * Both routes are OPEN in A1: the global JwtAuthGuard + `@Public()` opt-out are
 * Phase A2, so no guard is mounted yet. Domain failures (`EmailTakenError` → 409,
 * `InvalidCredentialsError` → 401) are thrown by the service and mapped by the
 * global {@link import('../api/app-error.filter').AppErrorFilter} — this
 * controller never throws raw HttpExceptions, matching the project convention.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Create an account and return a fresh token pair. Duplicate email → 409. */
  @Post('register')
  @HttpCode(201)
  register(@Body(new ZodValidationPipe(RegisterBody)) body: RegisterBody): Promise<IssuedTokens> {
    return this.auth.register(body.email, body.password);
  }

  /** Exchange credentials for a fresh token pair. Bad credentials → 401 (generic). */
  @Post('login')
  @HttpCode(200)
  login(@Body(new ZodValidationPipe(LoginBody)) body: LoginBody): Promise<IssuedTokens> {
    return this.auth.login(body.email, body.password);
  }
}
