import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../api/zod-validation.pipe';
import type { AuthUser } from './auth.types';
import { AuthService, type IssuedTokens } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { LoginBody, RegisterBody } from './auth.dto';
import { Public } from './public.decorator';

/**
 * Auth HTTP surface (Phase A1 + A2).
 *
 *   POST /auth/register → 201 + { accessToken, refreshToken }   (public)
 *   POST /auth/login    → 200 + { accessToken, refreshToken }   (public)
 *   GET  /auth/me       → 200 + AuthUser principal              (authenticated)
 *   POST /auth/logout   → 204                                   (authenticated)
 *
 * Thin by design — all identity logic lives in {@link AuthService}; this layer
 * only validates the body (via {@link ZodValidationPipe}) and pins status codes.
 *
 * Enforcement (A2): the global JwtAuthGuard authenticates every route by default;
 * `register`/`login` opt out with `@Public()`. Domain failures (`EmailTakenError`
 * → 409, `InvalidCredentialsError` → 401) are thrown by the service and mapped by
 * the global {@link import('../api/app-error.filter').AppErrorFilter} — this
 * controller never throws raw HttpExceptions, matching the project convention.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Create an account and return a fresh token pair. Duplicate email → 409. */
  @Public()
  @Post('register')
  @HttpCode(201)
  register(@Body(new ZodValidationPipe(RegisterBody)) body: RegisterBody): Promise<IssuedTokens> {
    return this.auth.register(body.email, body.password);
  }

  /** Exchange credentials for a fresh token pair. Bad credentials → 401 (generic). */
  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body(new ZodValidationPipe(LoginBody)) body: LoginBody): Promise<IssuedTokens> {
    return this.auth.login(body.email, body.password);
  }

  /**
   * Return the caller's own principal as resolved from the verified access token.
   * Authenticated (no `@Public()`): the global guard rejects anonymous callers
   * with 401 before this runs and attaches `req.user`, so the principal is always
   * present here.
   */
  @Get('me')
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }

  /**
   * Log out the caller. Authenticated. A2 only acknowledges (204) — full refresh
   * token revocation/rotation (deleting the caller's `refresh_tokens` rows) is A5;
   * the access token stays valid until its short TTL elapses. The route is added
   * now so clients have a stable endpoint to call.
   *
   * A5: revoke the caller's stored refresh token(s) here.
   */
  @Post('logout')
  @HttpCode(204)
  logout(): void {
    // A5: revoke refresh token(s) for `@CurrentUser()`; for A2 this is a no-op ack.
  }
}
