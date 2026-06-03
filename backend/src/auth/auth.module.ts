import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtService } from './jwt.service';
import { PasswordService } from './password.service';

/**
 * Authentication module (Phase A1). Hosts the register/login surface and the
 * services behind it: {@link AuthService} (identity + issuance), {@link JwtService}
 * (HS256 access tokens), {@link PasswordService} (argon2id hashing).
 *
 * Wiring:
 *  - No `imports` for DB/config — DbModule and ConfigModule are `@Global`, so the
 *    `DB`/`ENV` tokens are injectable directly (mirrors how AuditQueryService
 *    pulls in `DB` without importing DbModule).
 *  - Exports the services so later phases (the A2 JwtAuthGuard verifies via
 *    JwtService; A5 refresh/logout reuse AuthService) can consume them.
 *
 * Imported by {@link import('../api/api.module').ApiModule}, so these routes only
 * come alive under the `api` entrypoint — the CLI never mounts them.
 */
@Module({
  controllers: [AuthController],
  providers: [AuthService, JwtService, PasswordService],
  exports: [AuthService, JwtService, PasswordService],
})
export class AuthModule {}
