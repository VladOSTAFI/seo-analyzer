# seoditly — Marketing Site + Dashboard (Next.js) · Implementation Plan

A phased, deliverable-by-deliverable plan for the **seoditly** Next.js front end: a marketing site that explains the product and captures leads, plus a later, gated dashboard layered over the existing **SEO Audit backend** (NestJS + PostgreSQL).

**Stack:** Next.js 15 (App Router) · TypeScript (strict) · Tailwind CSS · shadcn/ui · dark theme, near-black + violet accent · deployed on Vercel.

**Product name:** `seoditly` — defined as one constant (`PRODUCT_NAME`), trivially renameable.

**Backend it consumes:** the NestJS HTTP API (`npm run api`, default `http://localhost:3000`). The API is now **authenticated** — a global `JwtAuthGuard` protects every `/audits` route, so each request must carry an `Authorization: Bearer <accessToken>` header. Identity is **first-party** (the backend is the identity provider — no Clerk/Auth.js needed).

**Auth routes** (mirror `backend/src/auth/auth.controller.ts`):

| Method | Route | Auth | Returns | Notes |
|---|---|---|---|---|
| `POST` | `/auth/register` | public | `201` `IssuedTokens` | Body `{ email, password≥8 }`; duplicate email → `409` |
| `POST` | `/auth/login` | public | `200` `IssuedTokens` | Body `{ email, password }`; bad creds → `401`; too many attempts → `429` |
| `POST` | `/auth/refresh` | public | `200` `IssuedTokens` | Body `{ refreshToken }`; **rotating** (old token revoked); invalid/expired/revoked → `401` |
| `GET` | `/auth/me` | Bearer | `200` `AuthUser` | Caller's principal |
| `POST` | `/auth/logout` | Bearer | `204` | Revokes all the caller's refresh tokens |

**Audit routes** (now Bearer-protected + ownership-scoped):

| Method | Route | Returns | Notes |
|---|---|---|---|
| `POST` | `/audits` | `202` `{ id, status: 'created' }` | Body `{ url }`; new audit stamped `ownerId = caller.id`; runs pipeline fire-and-forget |
| `GET` | `/audits` | `Paginated<AuditDto>` | `?limit&offset` (default 50, max 200); **scoped to caller's own audits** (admin sees all) |
| `GET` | `/audits/:id` | `AuditDetailDto` | `AuditOwnershipGuard`: `404` if missing **or not owned**; adds `findingsTotal` + `bySeverity` |
| `GET` | `/audits/:id/findings` | `Paginated<FindingDto>` | `?severity&ruleId&limit&offset`; owner-or-admin or `404` |
| `GET` | `/audits/:id/report` | `.xlsx` stream | owner-or-admin; `404` missing / `409` not generated yet |

**Contract types** (mirror `backend/src/api/api.types.ts` + `backend/src/auth/auth.types.ts` exactly):
- `Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'`
- `AuditStatus = 'created' | 'crawling' | 'enriching' | 'analyzing' | 'reporting' | 'done' | 'failed'` (terminal: `done` / `failed`)
- `Role = 'user' | 'admin'`
- `AuditDto { id, startUrl, status, failedStage|null, reportPath|null, createdAt, updatedAt }`
- `AuditDetailDto extends AuditDto { findingsTotal, bySeverity: Record<Severity, number> }`
- `FindingDto { id, ruleId, severity, url|null, detail: Record<string,unknown>, createdAt }`
- `Paginated<T> { items: T[], total, limit, offset }`
- `IssuedTokens { accessToken: string; refreshToken: string }` — access = short-lived HS256 JWT (`JWT_ACCESS_TTL`, default 15m); refresh = opaque, long-lived (`JWT_REFRESH_TTL`, default 30d), rotated on every `/auth/refresh`
- `AuthUser { id: string; email: string; role: Role; tokenVersion: number }`

**Sequencing:** Phases 0–3 ship the marketing MVP with **zero dependency on backend state** (the marketing site never calls the authenticated API). Phases 4–5 add the gated dashboard on top of the backend's first-party auth. Each phase is independently shippable.

> A working reference UI already exists at `frontend/` (Vite + React, covecta-styled). seoditly is a fresh Next.js build — reuse the proven API call shapes and DTO types from `frontend/src/{api,types}.ts`, not the Vite scaffolding.

---

## PHASE 0 — Foundation & Design System

**Goal:** Runnable app with the visual language locked in, reusable primitives, nav + footer on every route. No real page content yet.

**Setup**
- `create-next-app` — App Router, TypeScript, Tailwind, ESLint, `src/`, `@/*` alias.
- `shadcn init` — dark base, CSS variables on.
- shadcn components: `button, card, badge, input, textarea, label, sonner, navigation-menu`.
- Root layout sets `<html className="dark">`; dark is the only theme for MVP.

**Theme tokens** (`globals.css`, HSL, mapped to shadcn vars):
```css
--background: 230 25% 4%;      /* near-black */
--foreground: 0 0% 98%;
--card: 230 20% 7%;
--muted: 230 12% 16%;
--muted-foreground: 230 10% 64%;
--primary: 265 85% 65%;        /* violet accent */
--primary-foreground: 0 0% 100%;
--border: 230 14% 16%;
--ring: 265 85% 65%;
--radius: 0.75rem;
```
Type: single sans (Geist/Inter via `next/font`), headlines 600–700 with `tracking-tight`, body in `text-muted-foreground`, generous rhythm (`py-20 md:py-28`).

**Structure**
```
src/
  app/        layout.tsx · page.tsx · globals.css
  components/
    layout/   nav.tsx · footer.tsx
    ui/       (shadcn)
    primitives/ section.tsx · container.tsx · stat-card.tsx · pill-badge.tsx · cta-button.tsx
  lib/        constants.ts · copy.ts · utils.ts
```

**Component contracts**
- `Container {children, className?}` — `max-w-6xl mx-auto px-6`.
- `Section {id?, eyebrow?, heading?, children, className?}` — optional violet eyebrow + heading, wraps in `Container`.
- `StatCard {value, label, sub?}` — large value, label, muted sub.
- `PillBadge {children, dot?}` — `rounded-full` pill, optional pulsing violet dot.
- `CTAButton {href, variant?: 'primary'|'secondary', children}` — `Link` + shadcn `Button`.
- `Nav` — text logo (`PRODUCT_NAME`), links from `NAV_ITEMS`, right "Sign in" CTA, mobile menu under `md`.
- `Footer` — name, tagline, copyright, minimal links.

**`constants.ts`**
```ts
export const PRODUCT_NAME = "seoditly";
export const NAV_ITEMS = [
  { label: "How it works", href: "/how-it-works" },
  { label: "Contact", href: "/contact" },
];
export const SIGN_IN_HREF = "/dashboard";
```

**Acceptance:** builds with no type/lint errors; dark violet theme global; nav + footer on every route; all primitives render in isolation, responsive to 375px; mobile menu works; no contrast/CLS failures on the shell.

---

## PHASE 1 — Home Page

**Goal:** The selling page — one key idea, proof, platform visual, the report as hero artifact, clear CTAs.

**Sections (top → bottom)**
1. **Hero** — `PillBadge` ("Early access · launching soon"); H1 (`text-5xl md:text-6xl tracking-tight`) *"Technical SEO audits, automated into a developer-ready report."*; one-sentence muted subhead; CTA row (primary → `/contact` "Get a free audit", secondary → `/how-it-works`).
2. **Stat proof row** — three `StatCard`s: `48 → 805` (pages → findings, from the covecta.io run), `~31` (automated checks), `1` (Excel report, severity-ranked).
3. **Platform visual** — `MediaFrame` (image or silent looping video), `aspect-video`, violet ring; placeholder block sized identically to the final asset.
4. **Report showcase** — two columns: copy framing the Excel ТЗ report as the deliverable + `MediaFrame` report screenshot; one-line bullets (categorized fix tables, severity ranking, dev-ready).
5. **Pipeline teaser** — five labeled steps (**Crawl → Enrich → Analyze → Performance → Report**) as small cards with `lucide` icons; links to `/how-it-works`.
6. **Closing CTA band** — violet-tinted full-width section, headline + primary CTA → `/contact`.

**New components:** `home/{hero,stat-row,platform-visual,report-showcase,pipeline-teaser,cta-band}.tsx`, `primitives/media-frame.tsx` (`{src, type, alt}`; renders placeholder when `src` missing). `app/page.tsx` composes them.

**Assets:** document expected files (`public/media/dashboard.png` 1280×720, `report.png`, optional `demo.mp4`); `MediaFrame` placeholder-first so the page is presentable before assets exist and swaps with zero code change. All strings in `copy.ts`.

**Acceptance:** all six sections render, responsive 375px→desktop; CTAs route correctly; placeholders swap for real media with no code change; no CLS from media; Lighthouse perf + a11y ≥ 95; copy from `copy.ts`, name from `PRODUCT_NAME`.

---

## PHASE 2 — How It Works Page

**Goal:** Set clear expectations — the process and the result a user receives.

**Sections**
1. **Intro** — one-line framing: what an audit is and what you walk away with.
2. **Pipeline detail** — the five stages as end-user-facing blocks (not internals), each with icon, title, 1–2 sentence explanation:
   - **Crawl** — we fetch every page, link, image, and meta tag.
   - **Enrich** — we map the link graph, redirects, and canonical relationships.
   - **Analyze** — ~31 checks flag issues and rank them by severity.
   - **Performance** — Core Web Vitals via Google PageSpeed.
   - **Report** — a styled Excel spec your developers can action.
3. **Checks overview** — the ~31 checks grouped into categories (Metadata, Canonical/Indexing, Links, Images, Performance, i18n) as a clean card grid or definition list — breadth without overwhelm.
4. **What the report looks like** — sample screenshot of the categorized ТЗ tables + a downloadable sample `.xlsx` (`public/media/sample-report.xlsx`, placeholder file until the real one lands).
5. **Expectations strip** — short: turnaround, that output is an Excel file, that it's prioritized by severity.
6. **Closing CTA** → `/contact`.

**New components:** `how-it-works/{stage-list,checks-grid,report-preview,expectations}.tsx`; reuse `Section, Card, MediaFrame, CTAButton`. Checks data lives in `lib/checks.ts` (array of `{category, items[]}`), so the list edits in one place.

**Acceptance:** a first-time visitor understands process + output with no prior context; sample report downloads; checks render from `checks.ts`; fully responsive; CTA routes.

---

## PHASE 3 — Contact Page

**Goal:** Capture leads / inquiries. The MVP's conversion endpoint — the marketing site is fully shippable at the end of this phase.

**Deliverables**
- Form fields: `name`, `email` (required, validated), optional `siteUrl`, `message`. Client + server validation with `zod`.
- Submission via **Server Action** → (a) email via Resend and/or (b) insert into a `leads` table (Vercel Postgres / Supabase — whichever is provisioned). Keep the storage adapter behind `lib/leads.ts` so the backend choice is swappable.
- Anti-spam: hidden honeypot field + basic per-IP rate limit; reject bots silently.
- States: loading, success (toast via `sonner` + inline confirmation), error.
- Privacy note under the form.

**New components:** `contact/contact-form.tsx` (client component), `app/contact/actions.ts` (Server Action), `lib/leads.ts` (storage adapter), `lib/validation.ts` (zod schema shared client/server).

**Acceptance:** valid submit sends/stores a lead; invalid input shows field errors; honeypot rejects bots; rate limit blocks rapid repeats; success and error states both visible; no PII in logs.

> **Milestone:** Phases 0–3 = a complete, live-able marketing site. Deploy to Vercel and start receiving traffic. Phases 4–5 are the dashboard and depend on the backend access decision.

---

## PHASE 4 — Auth & Dashboard Shell

**Goal:** "Sign in" leads to a real, gated dashboard, authenticating against the backend's **first-party** `/auth` endpoints — no third-party identity provider. Tokens live in httpOnly cookies and never touch client JS; all backend traffic is server-proxied.

> **Architecture change:** the backend is now the identity provider. seoditly does **not** add Clerk/Auth.js and does **not** use a shared proxy secret — it logs the user in against `/auth/login`, holds the resulting tokens server-side, and forwards each `/audits` call with the user's own `Authorization: Bearer <accessToken>`. Ownership is enforced by the backend per-user, so the proxy carries identity instead of a service secret.

**Deliverables**
- **Auth pages** — `app/(auth)/login` and `app/(auth)/register` (email + password, zod-validated). Submit via **Server Actions** that call the backend `/auth/login` / `/auth/register`. On success, store the returned `{ accessToken, refreshToken }` in **httpOnly, Secure, SameSite=Lax cookies** (`sd_at` / `sd_rt`) — never in `localStorage` or any client-readable store.
- **Session helper** `lib/auth/session.ts` — server-only read/write/clear of the token cookies via `next/headers cookies()`; `getCurrentUser()` resolves the principal by decoding the access JWT (or calling `GET /auth/me`).
- **Server-side proxy with token attach + transparent refresh (critical):** the browser never calls the SEO backend directly. Route handlers under `app/api/proxy/[...path]/route.ts` (server-only) read `sd_at`, attach `Authorization: Bearer`, and forward to `BACKEND_URL`. On a `401` (access token expired), the handler calls `/auth/refresh` with `sd_rt` **once**, writes the rotated pair back to the cookies, and retries the original request; if refresh also fails, it clears cookies and returns `401` so the UI redirects to login.
- **Logout** — Server Action calls `POST /auth/logout` (Bearer) to revoke refresh tokens server-side, then clears both cookies.
- **Nav** — "Sign in" becomes "Dashboard" + a user menu (email, sign out) when a session cookie is present.
- **API client layer** `lib/api/` — typed wrappers for the `/audits` (and `/auth`) endpoints, called **only from server code**, reusing the DTO + `AuthUser`/`IssuedTokens` types verbatim from the backend contract.
- **Dashboard shell:** protected route group `app/(dashboard)/` — layout, empty states, loading skeletons, dark-theme consistent.

**New structure**
```
app/(auth)/           login/page.tsx · register/page.tsx · actions.ts   # Server Actions → /auth/*
app/(dashboard)/      layout.tsx · page.tsx (overview)
app/api/proxy/[...path]/route.ts   # server-only forwarder: Bearer attach + 401→refresh→retry
lib/auth/             session.ts (cookie read/write/clear) · current-user.ts
lib/api/              client.ts · types.ts
middleware.ts                      # redirect (dashboard) → /login when no session cookie
```

**Env:** `BACKEND_URL` (e.g. `http://localhost:3000`), `COOKIE_SECRET` (sign/verify cookies if not relying on httpOnly alone). All server-only — never `NEXT_PUBLIC_*`. No shared backend secret is needed anymore.

**Acceptance:** a visitor can register and log in against the backend; unauthenticated users are redirected from `(dashboard)` routes to `/login`; tokens exist **only** in httpOnly cookies (verify none are readable from `document.cookie` / JS); an expired access token is refreshed transparently mid-session without the user re-logging in; logout revokes refresh tokens server-side and clears cookies; **all backend traffic goes browser → Next.js server → backend, never browser → backend**.

---

## PHASE 5 — Audits Dashboard (Live Data)

**Goal:** Authenticated users see and manage **their own** audits over the proxied, Bearer-authenticated backend. Ownership scoping is enforced by the backend (`AuditOwnershipGuard`) — the UI just reflects it.

**Deliverables**
- **Audits list** (`GET /audits`) — paginated table: URL, status, severity rollups, created date; empty state with a "Start audit" CTA. Maps `Paginated<AuditDto>`. The backend already returns only the caller's audits (admins see all), so no client-side owner filtering is needed.
- **Audit detail** (`GET /audits/:id`) — status + `bySeverity` rollups (severity badges on a violet→severity color scale); show `failedStage` when `status === 'failed'`. A `404` here means missing **or** not-owned — render a single "audit not found" state either way (don't distinguish, matching the backend's no-enumeration posture).
- **Findings view** (`GET /audits/:id/findings`) — filter by `severity` + `ruleId`, paginated; each finding shows `ruleId`, `severity`, affected `url`, and a compact `detail` render.
- **Report download** (`GET /audits/:id/report`) — streamed through the proxy (Bearer attached server-side) so the backend stays hidden; disable the button until `reportPath` is set (otherwise `409`).
- **Start audit** (`POST /audits`) — the backend stamps `ownerId` from the access token, so ownership is automatic. Still apply **server-side URL validation** (require a valid public `http(s)` URL; block private IPs/localhost) as defence-in-depth against SSRF, since auth does not add target-host validation.
- **Role-aware UI** (optional) — if `getCurrentUser().role === 'admin'`, the list naturally shows all audits; surface an "All audits (admin)" label so the wider scope is obvious.
- **Polling** — the backend has no queue/websocket; poll `GET /audits/:id` on an interval (~3s) while `status` is non-terminal, stop on `done`/`failed`. (The Vite reference UI in `frontend/src/AuditDetails.tsx` already implements this loop — port the logic.) The proxy's transparent refresh (Phase 4) keeps long-running polls authenticated as the access token rotates.

**New structure**
```
app/(dashboard)/audits/   page.tsx (list) · [id]/page.tsx (detail) · [id]/findings/page.tsx
components/dashboard/      audits-table · severity-badge · findings-table · start-audit-form · report-download-button
lib/api/                   (extend with audits + findings + report methods)
```

**Acceptance:** a signed-in user sees only their own audits; starting an audit (URL validated server-side) stamps it to them; status updates via polling stay authenticated across access-token expiry; filtered findings browse and the report downloads — all proxied with the caller's Bearer token, no direct browser→backend traffic; requesting another user's audit id returns the not-found state; SSRF-prone URLs are rejected before reaching the backend.

---

## Cross-Phase Principles

- **Swappable content.** All copy in `copy.ts`, nav/product name in `constants.ts`, checks in `checks.ts`, lead storage behind `lib/leads.ts` — iterating wording, branding, or providers never means hunting through JSX.
- **Placeholder-first media.** `MediaFrame` renders correctly-sized placeholders so Phases 0–2 ship presentable before any real screenshot exists; assets drop into `public/media/` with zero code change. Capture real screenshots + the sample report from the covecta.io run when convenient.
- **Single source of truth for the API contract.** seoditly's `lib/api/types.ts` mirrors `backend/src/api/api.types.ts` + `backend/src/auth/auth.types.ts` exactly. If the backend contract changes, update one file.
- **Server-side backend boundary.** From Phase 4 on, the browser never touches the SEO backend directly. The Next.js server proxy attaches the user's **Bearer access token** (read from an httpOnly cookie) and handles transparent refresh; tokens never reach client JS. This keeps credentials off the wire to the browser while the backend enforces auth + ownership per request.
- **Tokens in httpOnly cookies only.** Access + refresh tokens live exclusively in httpOnly, Secure, SameSite cookies set by Server Actions/route handlers. No token ever appears in `localStorage`, `NEXT_PUBLIC_*`, or a client component — this is the main defence against token theft via XSS.
- **Ship the marketing site first.** Phases 0–3 are fully decoupled from backend state; deploy and start receiving traffic before the dashboard exists.

---

## Backend capabilities the front end relies on (and remaining gaps)

The backend now ships first-party auth + per-audit ownership, so the dashboard authenticates real users instead of working around an open API. What the front end leans on vs. what it still compensates for:

| Backend capability / gap | Front-end approach | Phase |
|---|---|---|
| ✅ First-party auth (`/auth/register\|login\|refresh\|logout\|me`, JWT + rotating refresh) | Log in against the backend; hold tokens in httpOnly cookies; server proxy attaches Bearer + refreshes transparently | 4 |
| ✅ Per-audit ownership + `user`/`admin` roles (`AuditOwnershipGuard`) | Trust backend scoping; render a single not-found state for missing-or-unowned ids; admin sees all | 5 |
| ⚠️ No target-host validation on `POST /audits` (SSRF) | Server-side URL validation (reject private IPs/localhost, require public http(s)) as defence-in-depth | 5 |
| ⚠️ No job queue / websocket | Client-side polling of `GET /audits/:id` until terminal status, kept authenticated by proxy refresh | 5 |
| ⚠️ Short access-token TTL (default 15m), no silent server session | Proxy catches `401`, calls `/auth/refresh` (rotating) once, retries; clears cookies + redirects to `/login` if that fails | 4 |
