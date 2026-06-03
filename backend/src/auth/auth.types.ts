/**
 * Auth principal + token contract (Phase A0). See docs/AUTHORIZATION_PLAN.md §4.
 *
 * No NestJS/DB imports here on purpose — these are pure shapes shared by the
 * (future) JwtService, the JwtAuthGuard, and any controller reading `req.user`.
 */

/** The two authorization roles. Mirrors the `user_role` pgEnum in schema/enums.ts. */
export type Role = 'user' | 'admin';

/**
 * The authenticated principal attached to a request by the JwtAuthGuard (A2).
 * Derived from the verified access-token claims, not a fresh DB read on the hot
 * path. `tokenVersion` must equal `users.tokenVersion` for mass-revocation (§A5).
 */
export interface AuthUser {
  id: string; // JWT `sub` → users.id
  email: string;
  role: Role;
  tokenVersion: number; // JWT `tv`
}

/**
 * The HS256 access-token claim shape (A1 signs these; A2 verifies them). Keep
 * the payload minimal — `sub`, `email`, `role`, `tv` plus the standard `iat`/`exp`
 * the signer adds. No PII beyond email (§8).
 */
export interface AccessTokenClaims {
  sub: string; // users.id
  email: string;
  role: Role;
  tv: number; // users.tokenVersion at issuance
  iat?: number; // issued-at (added by the signer)
  exp?: number; // expiry (added by the signer)
}

/**
 * Map a verified set of claims onto the request principal. Lives here so the
 * guard and any test share one definition of "claims → AuthUser".
 */
export function claimsToAuthUser(claims: AccessTokenClaims): AuthUser {
  return {
    id: claims.sub,
    email: claims.email,
    role: claims.role,
    tokenVersion: claims.tv,
  };
}
