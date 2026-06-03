# SEO Technical Audit Application — Authorization & Authentication Plan

> **Goal:** Put the Phase 7 REST API behind real authentication and authorization.
> Today every `/audits` route is wide open and audits have no owner. After this
> work, a request must carry a valid identity, audits belong to the user who
> created them, and a user can only see/act on their own audits — with an `admin`
> role that can see everything.
>
> **One-liner:** From "anyone can read/run any audit" to "you authenticate, you
> own your audits, the API enforces it."

This document follows the same contract style as
[`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md): strictly ordered phases,
each ending **runnable and testable**, each with **Goal / Tasks / Files /
Acceptance**. It is a build contract for adding authz to *this* codebase — it
references the real modules (`ApiModule`, `AuditsController`, `AuditService`,
`AuditRepository`, `DbModule`, `ConfigModule`) and the real conventions (Drizzle
schema-per-file, Zod env validation, Symbol DI tokens, the `AppError` →
`AppErrorFilter` mapping, the dual CLI/API entrypoints).

---

## Table of Contents

1. [Scope & Non-Goals](#1-scope--non-goals)
2. [Where Authz Plugs Into the Current Architecture](#2-where-authz-plugs-into-the-current-architecture)
3. [Key Architectural Decisions](#3-key-architectural-decisions)
4. [Authorization Model](#4-authorization-model)
5. [Data Model Changes](#5-data-model-changes)
6. [Configuration Reference (new env)](#6-configuration-reference-new-env)
7. [Phase-by-Phase Implementation](#7-phase-by-phase-implementation)
   - [Phase A0 — Auth Foundation: Users, Hashing, Config](#phase-a0--auth-foundation-users-hashing-config)
   - [Phase A1 — Authentication: Register / Login / JWT Issuance](#phase-a1--authentication-register--login--jwt-issuance)
   - [Phase A2 — Authentication Enforcement: Global JWT Guard](#phase-a2--authentication-enforcement-global-jwt-guard)
   - [Phase A3 — Resource Ownership: Audits Get an Owner](#phase-a3--resource-ownership-audits-get-an-owner)
   - [Phase A4 — Authorization: Roles + Ownership Enforcement](#phase-a4--authorization-roles--ownership-enforcement)
   - [Phase A5 — Refresh Tokens & Session Lifecycle](#phase-a5--refresh-tokens--session-lifecycle)
   - [Phase A6 — Brute-Force & Abuse Protection](#phase-a6--brute-force--abuse-protection)
8. [Security Considerations](#8-security-considerations)
9. [Testing Strategy](#9-testing-strategy)
10. [Rollout & Migration of Existing Data](#10-rollout--migration-of-existing-data)
11. [Definition of Done per Phase](#11-definition-of-done-per-phase)

---

## 1. Scope & Non-Goals

**In scope**
- A first-party user/account model (email + password) with secure hashing.
- Stateless **JWT access tokens** + persisted **refresh tokens** for the REST API.
- A **global authentication guard** so routes are protected by default.
- **Resource ownership**: every `audits` row gets an `ownerId`; users only touch
  their own audits.
- A small **RBAC layer** (`user`, `admin`) layered on top of ownership.
- Brute-force protection on the login route and config/secrets hygiene.

**Non-goals (explicitly deferred)**
- The CLI entrypoint (`src/main.ts`, `npm run cli`) stays unauthenticated. It is
  an operator tool run on a trusted host; only the HTTP surface
  (`src/api.main.ts`) is guarded. This mirrors the existing "one module, two
  entrypoints" split — see [§2](#2-where-authz-plugs-into-the-current-architecture).
- External IdP / OAuth2 social login (see [§3](#3-key-architectural-decisions)
  for why first-party is chosen now; the design leaves room to add it later).
- A Next.js dashboard / cookie-session browser flow (the optional Phase 7 UI). The
  token contract here is UI-ready, but UI work is separate.
- Fine-grained per-finding permissions. Authz granularity is the **audit**
  (and everything cascading from it).

---

## 2. Where Authz Plugs Into the Current Architecture

The codebase already gives us exactly the seams we need. Nothing here requires
rewriting the pipeline.

| Existing seam | File | How authz uses it |
|---|---|---|
| HTTP entrypoint, distinct from CLI | `src/api.main.ts` | Mount the global `JwtAuthGuard` + global `ValidationPipe` here only; CLI stays open. |
| REST module | `src/api/api.module.ts` | Import a new `AuthModule`; register the global guard via `APP_GUARD` (alongside the existing `APP_FILTER`). |
| The five protected routes | `src/api/audits.controller.ts` | Annotate with ownership + role decorators; read `req.user` for the owner id. |
| Write path | `src/audit/audit.service.ts` (`create`, `runInBackground`) | `create(url)` gains an `ownerId` so new audits are owned. |
| Read path | `src/api/audit-query.service.ts` | List/detail/findings queries gain an owner scope (admins bypass). |
| Status/lookup repo | `src/audit/audit.repository.ts` | Add an ownership-aware `findById`/`assertOwnedBy` used by the guard. |
| Global DB | `src/db/db.module.ts` (`@Global`, `DB` token) | New `users`/`refresh_tokens`/auth tables inject the same `DB` token — no new DB wiring. |
| Config | `src/config/config.module.ts` + `src/config/env.validation.ts` | New `JWT_*` / `AUTH_*` env vars added to the Zod `envSchema`; injected via the `ENV` token. |
| Error mapping | `src/api/app-error.filter.ts` (`@Catch(AppError)`) | New domain errors (`AuthError` subclasses) map to `401`/`403`/`409`; keeps controllers throwing domain errors, not raw `HttpException`s, consistent with today. |
| Validation | `src/api/zod-validation.pipe.ts` | Reuse the existing Zod pipe for the new auth DTOs (no `class-validator` is pulled in — matches the current choice). |
| Migrations | `drizzle/`, `drizzle.config.ts` (`schema: './src/db/schema/*'`) | New schema files are auto-discovered; `npm run db:generate` emits the migration. |

**Critical constraint to preserve:** `runInBackground` is fire-and-forget and
must never reject (`audits.controller.ts` and `audit.service.ts` both depend on
this). All authz checks therefore happen **synchronously in the request**
(guard + controller) **before** the background pipeline is kicked off — never
inside the background task.

---

## 3. Key Architectural Decisions

### 3.1 First-party email/password auth (not an external IdP) — for now

The app is a self-hosted, single-tenant-ish audit tool (Docker Postgres, operator
CLI, small REST surface). Standing up Auth0/Cognito/Keycloak would add an external
dependency and network hop for what is currently a handful of routes. We implement
**first-party credentials** with industry-standard hashing, but isolate identity
behind an `AuthService` so swapping in an OIDC provider later only touches
issuance, not enforcement. **Justification:** matches the project's "no
unnecessary dependencies" posture (the existing code deliberately avoids
`class-validator`/`dotenv`, hand-rolling small equivalents).

### 3.2 JWT access tokens + persisted refresh tokens (not server-side sessions)

- **Access token: stateless JWT.** The REST API is stateless and has two
  entrypoints sharing one module; there is no session store today, and adding
  Redis just for sessions contradicts the current "Postgres-only, Redis optional"
  stance. A short-lived signed JWT (`~15 min`) lets the global guard verify a
  request with **zero DB round-trips** — important because the guard runs on every
  request including the high-frequency `GET /audits/:id` status poll documented in
  `API_TESTING_PLAN.md §2`.
- **Refresh token: opaque, hashed, stored in Postgres** (`refresh_tokens` table).
  This gives us revocation (logout, "log out everywhere") that pure-JWT can't,
  using the DB we already have. **Justification:** keeps the hot path stateless
  while still supporting revocation, reusing the existing `DB` token and Drizzle
  migration flow — no new infrastructure.

**Algorithm:** HS256 with a single `JWT_SECRET` initially (symmetric, simplest for
a single service). The token's `sub`, `role`, and `tokenVersion` claims are the
authz inputs (see [§4](#4-authorization-model)). RS256 is a later swap if a
separate verifier service ever appears.

### 3.3 RBAC + resource ownership (hybrid, ownership-first)

Pure RBAC is too coarse (every "user" would see every audit); pure ownership
can't express "support/admin can see everything." We use **ownership as the
default rule** with a small **role** override:

- A `user` may act only on audits where `audits.ownerId = req.user.id`.
- An `admin` bypasses the ownership check (full read/run/download).

This maps cleanly onto the one resource that matters — `audits` — and everything
else (`pages`, `links`, `findings`, `performance`, …) is reachable **only**
through an audit, so securing the audit secures the cascade. **Justification:**
the schema already has `onDelete: 'cascade'` from every child to `audits.id`
(`db-schemas.txt`); ownership at the audit level is the natural, minimal cut.

### 3.4 Enforcement via a global NestJS guard + decorators (not middleware)

NestJS guards are the idiomatic place for authn/authz and have access to the DI
container and route metadata (unlike raw Express middleware). We register:

- `JwtAuthGuard` **globally** via `APP_GUARD` → authenticated-by-default; opt out
  with a `@Public()` decorator on `register`/`login`/`refresh`.
- `RolesGuard` (reads `@Roles('admin')` metadata) for role-gated routes.
- `AuditOwnershipGuard` (reads the `:id` param) for the per-resource checks.

**Justification:** matches how the API module already composes cross-cutting
behavior through Nest providers (`APP_FILTER` for `AppErrorFilter`); adding
`APP_GUARD` is the same pattern. Guards run before the controller, so the
fire-and-forget pipeline never starts for an unauthorized request.

---

## 4. Authorization Model

### Roles

```ts
// src/db/schema/enums.ts (extend)
export const userRole = pgEnum('user_role', ['user', 'admin']);
```

| Role  | Audits visible | Can create/run | Can download report | Manage users |
|-------|----------------|----------------|---------------------|--------------|
| `user`  | own only       | yes (owns result) | own only          | no           |
| `admin` | all            | yes               | all               | (future)     |

### The principal (`req.user`)

The `JwtAuthGuard` validates the access token and attaches a typed principal:

```ts
// src/auth/auth.types.ts
export interface AuthUser {
  id: string;          // JWT `sub` → users.id
  email: string;
  role: 'user' | 'admin';
  tokenVersion: number; // JWT `tv`; must equal users.tokenVersion (see §A5)
}
```

### Decision matrix (per route)

| Route | Authn | Authz rule |
|---|---|---|
| `POST /auth/register` | `@Public()` | none |
| `POST /auth/login` | `@Public()` | none (rate-limited, §A6) |
| `POST /auth/refresh` | `@Public()` | valid, non-revoked refresh token |
| `POST /auth/logout` | required | revokes caller's refresh token(s) |
| `GET  /auth/me` | required | returns own principal |
| `POST /audits` | required | any authenticated user; new audit `ownerId = req.user.id` |
| `GET  /audits` | required | scoped to `ownerId = req.user.id` (admin: all) |
| `GET  /audits/:id` | required | owner or admin (else `404`, see §8) |
| `GET  /audits/:id/findings` | required | owner or admin |
| `GET  /audits/:id/report` | required | owner or admin |

---

## 5. Data Model Changes

New schema files under `src/db/schema/` (auto-discovered by `drizzle.config.ts`'s
`schema: './src/db/schema/*'`), each re-exported from `src/db/schema/index.ts` to
match the existing barrel convention.

### `users` (Phase A0)

```ts
// src/db/schema/users.ts
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),   // argon2id (see §3.1 / §8)
  role: userRole('role').notNull().default('user'),
  tokenVersion: integer('token_version').notNull().default(0), // bumped to mass-revoke
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  emailIdx: uniqueIndex('users_email_idx').on(t.email), // case-normalized at write
}));
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

### `refresh_tokens` (Phase A5; can land in A1 if refresh is built early)

```ts
// src/db/schema/refresh-tokens.ts
export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),         // sha-256 of the opaque token; never store raw
  expiresAt: timestamp('expires_at').notNull(),
  revokedAt: timestamp('revoked_at'),              // null = active
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  userIdx: index('refresh_tokens_user_idx').on(t.userId),
  hashIdx: uniqueIndex('refresh_tokens_hash_idx').on(t.tokenHash),
}));
```

### `audits.ownerId` (Phase A3)

```ts
// src/db/schema/audits.ts (add column)
ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'cascade' }),
// + index('audits_owner_idx').on(t.ownerId)
```

> **Nullable on purpose for the migration window.** Existing audit rows predate
> users and have no owner. The column ships **nullable**, gets backfilled to a
> seeded `admin`, and is only tightened to `NOT NULL` once backfill is verified —
> see [§10](#10-rollout--migration-of-existing-data).

### `auth_attempts` (Phase A6, optional if a store-backed limiter is chosen)

```ts
// src/db/schema/auth-attempts.ts
export const authAttempts = pgTable('auth_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  ip: text('ip'),
  succeeded: boolean('succeeded').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  emailTimeIdx: index('auth_attempts_email_time_idx').on(t.email, t.createdAt),
}));
```

Every migration is produced with `npm run db:generate` and reviewed before
`npm run db:push` — matching the existing `drizzle/00XX_*.sql` flow. **No
hand-written SQL.**

---

## 6. Configuration Reference (new env)

Added to `src/config/env.validation.ts` (`envSchema`) so they are validated at
boot via the existing `ENV` token, and to `.env.example` with comments matching
the file's style. Booleans/ints reuse the existing helper idioms.

| Env var | Purpose | Validation |
|---|---|---|
| `JWT_SECRET` | HS256 signing secret for access tokens | Required when API runs; min length 32 |
| `JWT_ACCESS_TTL` | Access-token lifetime (e.g. `15m`) | String, default `15m` |
| `JWT_REFRESH_TTL` | Refresh-token lifetime (e.g. `30d`) | String, default `30d` |
| `AUTH_BCRYPT_OR_ARGON` | Hash algo selector (`argon2id` default) | Enum, default `argon2id` |
| `AUTH_LOGIN_MAX_ATTEMPTS` | Failed logins before lockout window | Int, default `5` |
| `AUTH_LOGIN_WINDOW_SEC` | Lockout window seconds | Int, default `900` |
| `AUTH_SEED_ADMIN_EMAIL` | Bootstrap admin email (first run / backfill owner) | Optional email |
| `AUTH_SEED_ADMIN_PASSWORD` | Bootstrap admin password | Optional, min length 12 |

> **`JWT_SECRET` boot rule:** like `DATABASE_URL` is "validated reachable on
> boot", the API entrypoint (`src/api.main.ts`) must **fail fast** if `JWT_SECRET`
> is missing — an unsigned/empty-secret API is worse than no API. The CLI
> entrypoint does not require it (CLI is unauthenticated), so validation is
> conditional or enforced in the API bootstrap.

---

## 7. Phase-by-Phase Implementation

Phases A0→A4 are **strictly ordered** (A1 needs A0's `users`; A2 needs A1's
tokens; A3 needs A0's `users` for the FK; A4 needs A2 + A3). A5 and A6 are
hardening layers that depend on A1/A2 but can be sequenced after A4.

---

### Phase A0 — Auth Foundation: Users, Hashing, Config

**Goal:** A `users` table, a password-hashing utility, and validated auth config —
no endpoints yet. The app still boots and behaves exactly as today.

**Tasks**
1. Add `userRole` enum to `src/db/schema/enums.ts`; add `users` table
   (`src/db/schema/users.ts`); re-export from `src/db/schema/index.ts`.
2. `npm run db:generate` → review the emitted `drizzle/00XX_*.sql` → `npm run db:push`.
3. Add the `JWT_*` / `AUTH_*` vars to `envSchema` (`src/config/env.validation.ts`)
   and to `.env.example`. Add the API-only "fail fast if `JWT_SECRET` missing"
   check in `src/api.main.ts` (after `app.get(ENV)`, before `listen`).
4. `src/auth/password.service.ts` — `hash(password)` / `verify(hash, password)`
   wrapping **argon2id** (add the `argon2` dependency; the only new runtime dep
   in A0). Keep it behind an injectable so the algorithm is swappable per
   `AUTH_BCRYPT_OR_ARGON`.
5. `src/auth/auth.types.ts` — the `AuthUser` principal interface and JWT claim
   shape.
6. New domain errors in `src/common/errors.ts`: `UnauthorizedError`,
   `ForbiddenError`, `InvalidCredentialsError`, `EmailTakenError` (all extend
   `AppError`, mirroring `InvalidArgumentError`).

**Files**
- create: `src/db/schema/users.ts`, `src/auth/password.service.ts`,
  `src/auth/auth.types.ts`
- change: `src/db/schema/enums.ts`, `src/db/schema/index.ts`,
  `src/config/env.validation.ts`, `src/api.main.ts`, `.env.example`,
  `src/common/errors.ts`, `package.json`

**Acceptance**
- `npm run build` clean; `npm run db:push` applies the `users` migration.
- `password.service` unit test: `verify(hash(p), p) === true`, wrong password
  `=== false`, two hashes of the same password differ (per-hash salt).
- API entrypoint exits non-zero with a clear message when `JWT_SECRET` is unset;
  CLI entrypoint unaffected.

---

### Phase A1 — Authentication: Register / Login / JWT Issuance

**Goal:** Users can register and log in over HTTP and receive a signed access
token (+ refresh token). Routes are still open (enforcement is A2).

**Tasks**
1. `src/auth/jwt.service.ts` — sign/verify HS256 access tokens with claims
   `{ sub, email, role, tv }` and `JWT_ACCESS_TTL`. Use `@nestjs/jwt` (thin,
   official) **or** hand-rolled `jsonwebtoken` to stay dependency-light — pick
   one and isolate it here.
2. `src/auth/auth.service.ts`:
   - `register(email, password)` → normalize email (lowercase/trim), reject
     duplicates with `EmailTakenError`, hash via `PasswordService`, insert `users`
     row (role `user`), return tokens.
   - `login(email, password)` → look up by normalized email, `verify`, throw
     `InvalidCredentialsError` on miss/mismatch (**same error + timing** for
     unknown-email vs bad-password, see §8), issue access + refresh tokens.
   - `issueTokens(user)` → access JWT + opaque refresh token; persist the refresh
     token's sha-256 hash in `refresh_tokens` (introduce the table now or in A5 —
     recommended now so login is complete).
3. `src/auth/auth.dto.ts` — Zod `RegisterBody` / `LoginBody` (`.strict()`,
   email + min-length password), validated with the existing `ZodValidationPipe`.
4. `src/auth/auth.controller.ts` — `POST /auth/register`, `POST /auth/login`.
5. `src/auth/auth.module.ts` — providers (`AuthService`, `JwtService`,
   `PasswordService`), controller; injects the global `DB`/`ENV` tokens.
6. Import `AuthModule` into `ApiModule` (`src/api/api.module.ts`).
7. Extend `AppErrorFilter` (`src/api/app-error.filter.ts`) to map the new auth
   errors: `InvalidCredentialsError`/`UnauthorizedError` → `401`,
   `ForbiddenError` → `403`, `EmailTakenError` → `409`.

**Files**
- create: `src/auth/{jwt.service,auth.service,auth.dto,auth.controller,auth.module}.ts`,
  `src/db/schema/refresh-tokens.ts`
- change: `src/api/api.module.ts`, `src/api/app-error.filter.ts`,
  `src/db/schema/index.ts`

**Acceptance**
- `POST /auth/register` with a fresh email → `201` + `{ accessToken, refreshToken }`;
  `users` row exists with an argon2 `password_hash` (never the raw password).
- Duplicate email → `409`. Bad login → `401` with a generic message. Valid login
  → `200` + tokens; a verifiable JWT whose `sub` is the user id.
- Unit tests for `AuthService` (mock repo/hasher); the new error→status mappings
  covered in the filter test.

**Dependencies:** A0.

---

### Phase A2 — Authentication Enforcement: Global JWT Guard

**Goal:** Every REST route requires a valid access token **by default**; only the
explicitly-public auth routes are open. The existing `/audits/*` routes now reject
anonymous callers.

**Tasks**
1. `src/auth/jwt-auth.guard.ts` — read the `Authorization: Bearer` header, verify
   via `JwtService`, attach the typed `AuthUser` to `req.user`. Throw
   `UnauthorizedError` (→ `401`) on missing/invalid/expired tokens.
2. `src/auth/public.decorator.ts` — `@Public()` sets metadata; the guard skips
   verification for handlers/classes marked public.
3. `src/auth/current-user.decorator.ts` — `@CurrentUser()` param decorator
   returning `req.user` (typed `AuthUser`).
4. Register the guard **globally** in `ApiModule` via `APP_GUARD` (same provider
   style as the existing `APP_FILTER`). Mark `register`/`login`/`refresh` with
   `@Public()`. Add `GET /auth/me` (returns `@CurrentUser()`) and `POST /auth/logout`.
5. Mount a global `ValidationPipe`/header handling in `src/api.main.ts` only if
   needed; the guard itself is module-registered so it cannot leak to the CLI
   entrypoint (CLI never imports `ApiModule`).

**Files**
- create: `src/auth/{jwt-auth.guard,public.decorator,current-user.decorator}.ts`
- change: `src/api/api.module.ts`, `src/auth/auth.controller.ts`

**Acceptance**
- `GET /audits` **without** a token → `401`; **with** a valid token → `200`.
- `POST /auth/login` still reachable anonymously (`@Public()` works).
- An expired/garbage token → `401`. `GET /auth/me` returns the caller's principal.
- The CLI (`npm run cli audit:run …`) still runs with no token (guard not mounted).
- Integration test: protected route returns `401` anonymously, `200` with a
  freshly-minted token.

**Dependencies:** A1.

---

### Phase A3 — Resource Ownership: Audits Get an Owner

**Goal:** New audits are stamped with their creator's id; the data model and
write/read paths carry ownership. (Enforcement of "only owner can read" is A4 —
A3 wires the data so A4 can enforce it.)

**Tasks**
1. Add nullable `ownerId` to `audits` (`src/db/schema/audits.ts`) + `owner_idx`;
   `npm run db:generate` → review → `npm run db:push`.
2. Thread `ownerId` through the write path:
   - `AuditService.create(url, ownerId)` and `createAndRun`/`runInBackground`
     signatures gain `ownerId`; `buildAuditPayload` (in `src/cli/create.command.ts`)
     includes `ownerId`. **CLI callers pass the seeded admin id (or null);** the
     HTTP caller passes `req.user.id`.
   - `AuditsController.create` reads `@CurrentUser()` and forwards
     `user.id` into `audits.create`.
3. Extend `AuditRepository` (`src/audit/audit.repository.ts`) with
   ownership-aware lookups: `findByIdForUser(id, user)` and `assertOwnedBy(id,
   user)` (admin bypasses; else `eq(audits.ownerId, user.id)`), throwing
   `ForbiddenError`/returning `undefined` per §8.
4. Update the read layer (`src/api/audit-query.service.ts`) so `listAudits`,
   `getAudit`, `auditExists`, `listFindings` accept an owner scope and filter
   `WHERE owner_id = $user` (admins skip the predicate). Child queries
   (`findings`) are already scoped by `auditId`, so once audit access is
   established no extra child filtering is required.

**Files**
- change: `src/db/schema/audits.ts`, `src/cli/create.command.ts`,
  `src/audit/audit.service.ts`, `src/audit/audit.repository.ts`,
  `src/api/audits.controller.ts`, `src/api/audit-query.service.ts`

**Acceptance**
- A `POST /audits` by user X stores `owner_id = X` (verify in Postgres, per the
  `API_TESTING_PLAN.md` style: `SELECT owner_id FROM audits ORDER BY created_at
  DESC LIMIT 1`).
- `GET /audits` as user X returns only X's audits; as admin returns all.
- Existing unit tests for `AuditService.create`/`runInBackground` updated for the
  new `ownerId` arg and still green (fire-and-forget contract preserved).

**Dependencies:** A0 (FK target), A2 (`req.user` available).

---

### Phase A4 — Authorization: Roles + Ownership Enforcement

**Goal:** The per-resource routes (`/audits/:id`, `/findings`, `/report`) enforce
"owner or admin"; role-gated behavior is in place. This is the phase that
actually closes the hole.

**Tasks**
1. `src/auth/roles.decorator.ts` + `src/auth/roles.guard.ts` — `@Roles('admin')`
   metadata gate (reads `req.user.role`); used for any admin-only route.
2. `src/auth/audit-ownership.guard.ts` — for routes with an `:id` param: load the
   audit via `AuditRepository.findById`, allow if `req.user.role === 'admin'` or
   `audit.ownerId === req.user.id`; otherwise behave per §8 (**`404` not `403`**
   for cross-user reads to avoid id enumeration). Apply with
   `@UseGuards(AuditOwnershipGuard)` on `getAudit`, `listFindings`, `getReport`.
3. Ensure the **list** path remains owner-scoped (done in A3) so it is consistent
   with the per-id guard.
4. Double-check the report-download path: ownership is checked **before**
   `existsSync`/streaming, so a non-owner can never probe whether another user's
   report file exists.

**Files**
- create: `src/auth/{roles.decorator,roles.guard,audit-ownership.guard}.ts`
- change: `src/api/audits.controller.ts`, `src/api/api.module.ts` (provide guards)

**Acceptance**
- User X cannot `GET /audits/:id`, `…/findings`, or `…/report` for user Y's audit
  (→ `404`); X can for their own (→ `200`/`409`/`404` exactly as the existing
  status contract specifies). Admin can access any.
- Integration tests cover the cross-user matrix (owner / other-user / admin) for
  all three per-id routes, mirroring `API_TESTING_PLAN.md`'s
  curl-plus-SQL-verification format.

**Dependencies:** A2, A3.

---

### Phase A5 — Refresh Tokens & Session Lifecycle

**Goal:** Short access tokens stay usable via refresh; logout and global
revocation work.

**Tasks**
1. `POST /auth/refresh` (`@Public()`): accept the opaque refresh token, look up
   its sha-256 hash in `refresh_tokens`, reject if missing/expired/revoked, then
   **rotate** — revoke the presented token and issue a new access+refresh pair
   (refresh-token rotation defeats replay).
2. `POST /auth/logout` (authenticated): revoke the caller's refresh token(s)
   (`revokedAt = now()`).
3. `tokenVersion` mass-revoke: the JWT carries `tv`; the guard rejects when
   `tv !== users.tokenVersion`. Bumping `users.tokenVersion` invalidates every
   outstanding access token for that user ("log out everywhere", forced logout on
   password change). **Note:** this reintroduces one DB read in the guard *only if
   you choose to validate `tv` on every request*; recommended approach is to
   validate `tv` lazily (on refresh) to keep the access-token hot path
   stateless — document the trade-off and pick one.
4. A periodic/lazy cleanup of expired `refresh_tokens` (a tiny query on refresh,
   or a CLI maintenance command consistent with the existing `nest-commander`
   commands).

**Files**
- change: `src/auth/auth.service.ts`, `src/auth/auth.controller.ts`,
  `src/auth/jwt-auth.guard.ts` (if `tv` checked eagerly)

**Acceptance**
- Access token expiry → `401`; `POST /auth/refresh` with a valid refresh token →
  new pair; the old refresh token no longer works (rotation).
- `POST /auth/logout` → subsequent refresh with the revoked token → `401`.
- Bumping `tokenVersion` invalidates the user's tokens per the chosen strategy.

**Dependencies:** A1 (token issuance), A2 (guard).

---

### Phase A6 — Brute-Force & Abuse Protection

**Goal:** Login can't be brute-forced; abusive clients are throttled.

**Tasks**
1. Rate-limit `POST /auth/login` (and `register`/`refresh`) — use
   `@nestjs/throttler` (in-memory, no Redis needed for a single instance) **or**
   the `auth_attempts` table + a per-email/IP lockout window
   (`AUTH_LOGIN_MAX_ATTEMPTS` within `AUTH_LOGIN_WINDOW_SEC`). For multi-instance
   later, back the limiter with the optional Redis already named in the Phase 7
   plan.
2. Constant-ish-time login: always run a hash `verify` even when the email is
   unknown (compare against a dummy hash) so response timing doesn't leak account
   existence (§8).
3. Optional account lockout after N failures with a clear unlock path.

**Files**
- create (if DB-backed): `src/db/schema/auth-attempts.ts`
- change: `src/auth/auth.controller.ts`, `src/auth/auth.service.ts`,
  `src/api/api.module.ts` (throttler wiring), `.env.example`,
  `src/config/env.validation.ts`

**Acceptance**
- N+1 rapid bad logins for one email/IP → `429` (or lockout) within the window.
- Timing for unknown-email vs wrong-password is indistinguishable in tests.

**Dependencies:** A1.

---

## 8. Security Considerations

- **Password hashing:** argon2id with sane memory/time params (per
  `AUTH_BCRYPT_OR_ARGON`); never log or return `password_hash`. Per-hash salt is
  inherent to argon2.
- **Token storage (client):** access token in memory; refresh token in an
  HttpOnly, Secure, `SameSite=Strict` cookie **if** a browser UI is added — the
  REST contract returns both in the body so non-browser clients (curl, the smoke
  script) work, but the doc must steer the future UI toward HttpOnly cookies.
- **Secrets:** `JWT_SECRET` from env only; `.env` is already gitignored,
  `.env.example` carries placeholders (matches the existing `PSI_API_KEY`
  handling). Redact secrets in logs the way `DbModule` already redacts the DB URL.
- **`404` vs `403` for cross-user reads:** per-id audit routes return **`404`**
  (not `403`) when the caller is authenticated but not the owner, so an attacker
  can't enumerate which audit ids exist. Ownership is checked **before** any disk
  access in `getReport`.
- **No account enumeration on auth:** identical error + timing for unknown-email
  and wrong-password logins (§A6); registration's `409` is acceptable but can be
  softened to a generic "check your email" flow if enumeration via register is a
  concern.
- **Token claims minimal:** `sub`, `email`, `role`, `tv`, `exp`, `iat` only — no
  PII beyond email.
- **Refresh rotation + revocation:** opaque refresh tokens are stored hashed
  (sha-256), rotated on use, revocable on logout, and mass-revocable via
  `tokenVersion`.
- **Fire-and-forget safety:** all authz runs in the request lifecycle (guard +
  controller) **before** `runInBackground` is invoked; the background pipeline
  itself never sees auth and never rejects — preserving the existing 202 contract.
- **Transport:** assume TLS termination in front of the API (the API binds
  `API_PORT` plainly today, same as now); document that production must run behind
  HTTPS.

---

## 9. Testing Strategy

Consistent with `IMPLEMENTATION_PLAN.md §9` and `API_TESTING_PLAN.md`: Jest unit
specs (`*.spec.ts`, `jest.config.js`) + DB-backed integration specs
(`*.int-spec.ts`, `jest-int.config.js`, single live Postgres,
`test/int/setup-env.ts`).

| Layer | What |
|---|---|
| Unit | `PasswordService` (hash/verify, salt uniqueness); `JwtService` (sign/verify, expiry, tampered-token reject); `AuthService` (register dup→409, login good/bad, token issuance) with a mocked repo + hasher. |
| Unit | `JwtAuthGuard` (valid/expired/missing/garbage token), `RolesGuard`, `AuditOwnershipGuard` (owner/other/admin) with mocked execution context + repo. |
| Filter | `AppErrorFilter` maps the new errors → `401/403/409`. |
| Integration (DB) | Seed `users` + `audits(ownerId=...)`; assert list/detail/findings/report are owner-scoped; admin bypass; cross-user → `404`. Curl-plus-SQL parity with the existing API plan. |
| Integration (auth flow) | register → login → call protected route with the issued token → refresh → logout → token rejected. |
| Abuse | rapid bad logins → `429`/lockout; unknown-email vs bad-password timing parity. |

**Principle:** every guard and every new route ships with a test; live external
calls (none here) stay out of CI. Update existing `audit.service.spec.ts` and any
controller tests for the new `ownerId` parameter.

A companion **`AUTH_TESTING_PLAN.md`** (same curl + psql format as
`API_TESTING_PLAN.md`) should be authored alongside Phase A4, and
`scripts/api-smoke.sh` extended to register/login and send the bearer token.

---

## 10. Rollout & Migration of Existing Data

The DB already holds owner-less audits (and the `output/*.xlsx` files referenced
by `reportPath`). Rollout is staged so the API is never half-protected:

1. **Backfill prep (A0/A3):** ship `audits.ownerId` **nullable**. Seed one admin
   user from `AUTH_SEED_ADMIN_EMAIL`/`AUTH_SEED_ADMIN_PASSWORD` (a one-shot
   `nest-commander` `auth:seed-admin` command, consistent with existing CLI
   commands). Backfill: `UPDATE audits SET owner_id = <admin id> WHERE owner_id
   IS NULL` (run via a reviewed migration or the seed command).
2. **Tighten (post-backfill):** a follow-up migration sets
   `audits.ownerId NOT NULL` once the backfill is verified (`SELECT count(*) FROM
   audits WHERE owner_id IS NULL` returns `0`).
3. **Flip enforcement last:** the global `JwtAuthGuard` (A2) and ownership guards
   (A4) are the breaking change for clients. Land A0/A1/A3 (additive, non-breaking)
   first; cut over A2/A4 in a single coordinated deploy with the smoke script
   updated to authenticate. Communicate the breaking change to any existing API
   consumers.
4. **CLI continuity:** the CLI pipeline keeps working throughout — it passes the
   seeded admin id (or null pre-tighten) and is never guarded.
5. **Rollback:** A2/A4 can be reverted by removing the `APP_GUARD`/route guards
   (additive schema stays; nullable→NOT NULL is the only non-trivial down-step,
   guarded by keeping the backfill migration separate from the tighten migration).

---

## 11. Definition of Done per Phase

| Phase | Done when… |
|---|---|
| A0 | `users` migration applied; `PasswordService` tested; API fails fast without `JWT_SECRET`; CLI unaffected. |
| A1 | register/login over HTTP issue verifiable tokens; password stored hashed; dup→409, bad login→401; unit-tested. |
| A2 | global guard makes `/audits/*` require a token (`401` anon, `200` with token); auth routes public; CLI still open. |
| A3 | new audits carry `owner_id`; list/read paths are owner-scoped; existing service tests updated + green. |
| A4 | per-id audit routes enforce owner-or-admin (`404` for others); cross-user matrix integration-tested. |
| A5 | refresh rotates, logout revokes, `tokenVersion` mass-revokes; tested. |
| A6 | login brute-force throttled/locked; no account-enumeration via timing; tested. |

---

*This document is the authz build contract. Land A0→A1→A3 (additive, safe), then
cut over A2+A4 (enforcement) in one coordinated deploy, then harden with A5/A6.
Each phase ends runnable and testable, and the enforcement phases preserve the
existing fire-and-forget 202 pipeline contract.*
