import { Body, Controller, Get, HttpCode, Ip, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../api/zod-validation.pipe';
import type { AuthUser } from './auth.types';
import { AuthService, type IssuedTokens } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { LoginBody, RefreshBody, RegisterBody } from './auth.dto';
import { Public } from './public.decorator';

/**
 * Auth HTTP surface (Phase A1 + A2 + A5 + A6).
 *
 *   POST /auth/register → 201 + { accessToken, refreshToken }   (public)
 *   POST /auth/login    → 200 + { accessToken, refreshToken }   (public)
 *   POST /auth/refresh  → 200 + { accessToken, refreshToken }   (public, rotating)
 *   GET  /auth/me       → 200 + AuthUser principal              (authenticated)
 *   POST /auth/logout   → 204                                   (authenticated)
 *
 * Thin by design — all identity logic lives in {@link AuthService}; this layer
 * only validates the body (via {@link ZodValidationPipe}) and pins status codes.
 *
 * Enforcement (A2): the global JwtAuthGuard authenticates every route by default;
 * `register`/`login`/`refresh` opt out with `@Public()`. Domain failures
 * (`EmailTakenError` → 409, `InvalidCredentialsError` → 401, `UnauthorizedError`
 * → 401, `TooManyRequestsError` → 429) are thrown by the service and mapped by
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

  /**
   * Exchange credentials for a fresh token pair. Bad credentials → 401 (generic);
   * too many recent failures for the email → 429 (A6, brute-force lockout). The
   * client `@Ip()` is threaded through for the per-email attempt ledger (forensics
   * only — the lockout itself is keyed on email, not IP).
   */
  @Public()
  @Post('login')
  @HttpCode(200)
  login(
    @Body(new ZodValidationPipe(LoginBody)) body: LoginBody,
    @Ip() ip: string,
  ): Promise<IssuedTokens> {
    return this.auth.login(body.email, body.password, ip);
  }

  /**
   * Rotate a refresh token: revoke the presented opaque token and return a brand
   * -new access+refresh pair (Phase A5). Public — the refresh token itself is the
   * credential, so no access token is required (it may already be expired, which
   * is the whole point). An invalid/expired/revoked token, or one whose owner is
   * gone/deactivated, surfaces as a single generic 401 (§8, no enumeration).
   */
  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body(new ZodValidationPipe(RefreshBody)) body: RefreshBody): Promise<IssuedTokens> {
    return this.auth.refresh(body.refreshToken);
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
   * Log out the caller (Phase A5). Authenticated. Revokes ALL of the caller's
   * active refresh tokens via {@link AuthService.logout}, so none of their
   * sessions can refresh again (subsequent `POST /auth/refresh` → 401). Idempotent
   * — logging out with nothing active is still a 204.
   *
   * Residual window (deliberate stateless trade-off, §3.2): the caller's already
   * -issued access JWT stays valid until its short TTL elapses; logout does not
   * bump `tokenVersion`, so it does not invalidate other valid access tokens
   * system-wide. "Log out everywhere" is {@link AuthService.revokeAllSessions}.
   */
  @Post('logout')
  @HttpCode(204)
  logout(@CurrentUser() user: AuthUser): Promise<void> {
    return this.auth.logout(user.id);
  }
}
