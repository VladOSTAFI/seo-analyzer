import "server-only";

import { decodeJwt } from "jose";

import type { AuthUser, Role } from "@/lib/api/types";
import { getAccessToken } from "@/lib/auth/session";

/**
 * Resolve the signed-in principal from the access-token cookie, or `null`.
 *
 * Trust model — why decode without verifying:
 *   The HS256 signing secret lives ONLY on the backend; seoditly never holds
 *   it, so it CANNOT cryptographically verify the JWT. That is fine here: the
 *   token is read from our own httpOnly cookie, which only this server set
 *   (after a successful `/auth/login` or `/auth/refresh`). The client can never
 *   write that cookie, so a tampered token can't be injected through it. We use
 *   the decoded claims purely to render UI (email, role) — every privileged
 *   action still rides the raw Bearer token to the backend, which DOES verify
 *   the signature and enforces ownership. So an attacker forging claims here
 *   gains nothing: the backend rejects the unsigned/expired token on the next
 *   request, the proxy clears the cookies, and the UI bounces to `/login`.
 *
 *   If stricter local validation is ever needed, swap `decodeJwt` for a
 *   `GET /auth/me` round-trip through the proxy (authoritative, signed-checked
 *   by the backend) — the return shape is identical.
 *
 * Claims shape (`{ sub, email, role, tv, iat, exp }`) maps to `AuthUser`.
 * Expired tokens (`exp` in the past) resolve to `null` so a stale cookie reads
 * as "logged out" in the UI even before the proxy rotates it.
 */

interface AccessClaims {
  sub?: string;
  email?: string;
  role?: string;
  tv?: number;
  exp?: number;
}

function isRole(value: unknown): value is Role {
  return value === "user" || value === "admin";
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = await getAccessToken();
  if (!token) return null;

  let claims: AccessClaims;
  try {
    claims = decodeJwt<AccessClaims>(token);
  } catch {
    // Malformed token — treat as no session.
    return null;
  }

  // Reject expired tokens (seconds since epoch).
  if (typeof claims.exp === "number" && claims.exp * 1000 <= Date.now()) {
    return null;
  }

  if (
    typeof claims.sub !== "string" ||
    typeof claims.email !== "string" ||
    !isRole(claims.role)
  ) {
    return null;
  }

  return {
    id: claims.sub,
    email: claims.email,
    role: claims.role,
    tokenVersion: typeof claims.tv === "number" ? claims.tv : 0,
  };
}
