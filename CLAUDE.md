# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

wacrm is a self-hostable CRM template for WhatsApp (shared inbox, contacts, pipelines, broadcasts, no-code automations, AI replies) built on Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind v4, and Supabase (Postgres + Auth + Storage + RLS). It is a **template, not a product**: the expected flow is fork → customise → deploy. Upstream PRs are limited to security fixes, bug fixes, and small improvements — new features and stack changes belong in forks.

Heed the AGENTS.md warning above: Next.js 16 differs from training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js-facing code (requires `npm install` first).

## Commands

```bash
npm run dev           # Turbopack dev server on :3000
npm run build         # Production build (also runs Next's own typecheck)
npm run typecheck     # tsc --noEmit — fast TS-only pass
npm run lint          # ESLint (eslint-config-next core-web-vitals + typescript)
npm run format        # Prettier write; format:check for check-only
npm test              # vitest run (all tests)
npm run test:watch    # vitest watch mode
npx vitest run src/lib/whatsapp/encryption.test.ts   # single test file
```

CI (`.github/workflows/ci.yml`) runs lint → typecheck → test → build on every PR; run all four locally before pushing. Tests need no `.env.local` — `vitest.config.ts` injects dummy `ENCRYPTION_KEY` / `META_APP_SECRET` (some modules read these at import time). `next build` likewise needs `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` set (dummy values are fine, see the CI workflow).

The MCP server in `mcp-server/` is a separate npm package (`wacrm-mcp`) with its own `package.json` (`npm run build` / `typecheck` inside that directory). It is a thin wrapper over the public API.

Local app setup: `cp .env.local.example .env.local` and fill in Supabase + Meta credentials. The example file documents every variable; required ones are `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ENCRYPTION_KEY` (64 hex chars), `META_APP_SECRET`.

## Architecture

### Layout

- `src/app/` — App Router. Route groups: `(auth)` (login/signup/forgot-password), `(dashboard)` (inbox, contacts, pipelines, broadcasts, automations, flows, agents, settings, …), `join/` (invitation redemption), `api/` (route handlers).
- `src/lib/` — nearly all business logic, organized by domain (`whatsapp/`, `automations/`, `flows/`, `ai/`, `auth/`, `contacts/`, `webhooks/`, …). Logic here is deliberately pure and unit-testable; tests are colocated as `*.test.ts` next to the source.
- `src/components/` — React components grouped by feature domain; `components/ui/` is shadcn primitives.
- `src/hooks/` — client hooks (`use-auth`, `use-realtime`, `use-presence`, `use-can` for role gating, …).
- `supabase/migrations/` — numbered SQL migrations (`001_…` onward). RLS on every table. New schema changes get a new numbered file; never edit an applied migration.
- `messages/` + `src/i18n/request.ts` — next-intl. The locale is instance-wide from `NEXT_PUBLIC_APP_LOCALE` (default `en`), not per-request; dictionaries live in `messages/<locale>.json` with English fallback.
- Path alias: `@/*` → `./src/*`.

### Three Supabase client flavors — pick deliberately

1. **Browser singleton** — `@/lib/supabase/client.ts` (`createBrowserClient`). Must stay a singleton: multiple clients cause auth-lock contention.
2. **SSR server client** — `@/lib/supabase/server.ts`. Cookie-based, RLS-scoped to the signed-in user. Server-only (reads `next/headers`); importing it from a client component fails the build, which is the intended boundary check.
3. **Service-role admin clients** — used by the webhook route, engine modules (`lib/automations/admin-client.ts`, `lib/flows/admin-client.ts`, `lib/ai/admin-client.ts`), and the public API. These **bypass RLS**, so every query MUST be explicitly filtered by `account_id`. Never expose `SUPABASE_SERVICE_ROLE_KEY` to client code.

### Auth and multi-tenancy

Every install is account-scoped (multi-tenant since migration `017_account_sharing.sql`) with roles `owner > admin > agent > viewer`. Two calling conventions, both returning a loaded context and throwing typed errors that map to 401/403 responses:

- **Dashboard API routes**: `requireRole("admin")` from `@/lib/auth/account.ts` → `{ supabase (RLS client), userId, accountId, role }`.
- **Public API (`/api/v1`)**: `requireApiKey(request, "messages:send")` from `@/lib/auth/api-context.ts` → `{ supabase (service-role), accountId, scopes, keyId }`. API keys are SHA-256 hashed, account-scoped, scope-gated, and rate-limited (`@/lib/rate-limit.ts`); responses use the envelope helpers in `@/lib/api/v1/respond.ts`.

Role policy lives in one place: the predicates in `@/lib/auth/roles.ts` (mirrored by the SQL `is_account_member(account_id, min_role)` helper). Both API guards and UI gates (`use-can`) call these — don't open-code role checks.

`src/middleware.ts` refreshes Supabase sessions and handles auth redirects. Careful: any response returned in place of the default one must have the refreshed auth cookies copied onto it (`withRefreshedCookies`), or token rotation wedges the session.

### WhatsApp pipeline

- Outbound: `@/lib/whatsapp/meta-api.ts` wraps the Meta Cloud API (all Meta calls are server-side). Access tokens are stored AES-256-GCM-encrypted (`@/lib/whatsapp/encryption.ts`, key = `ENCRYPTION_KEY`).
- Inbound: `src/app/api/whatsapp/webhook/route.ts` is the single entry point. It verifies the HMAC-SHA256 signature (`META_APP_SECRET`), persists the message with a service-role client, then fans out to: Flows engine → Automations engine → AI auto-reply → outbound webhook delivery (`@/lib/webhooks/`). Heavy work runs in `after()` within the route's `maxDuration`.
- **Automations vs Flows are separate engines.** Automations (`@/lib/automations/engine.ts`) are trigger + step-list rules (keywords, tags, schedule → send/tag/wait/webhook/…). Flows (`@/lib/flows/engine.ts`) are interactive node-graph conversations (beta) that suspend at customer-input nodes; the flow runner tells the webhook whether automations should also fire. The flows engine has deliberate concurrency guards (idempotency on `meta_message_id`, optimistic `current_node_key` updates, one-active-run-per-contact index) — preserve them when touching it.

### Public API and MCP

`/api/v1` (docs: `docs/public-api.md`) is the stable machine-to-machine surface. The MCP server (`mcp-server/`, docs: `docs/mcp.md`) wraps it — read-only by default, opt-in writes. New public endpoints should follow the existing `requireApiKey` + account-scoping + envelope pattern in `src/app/api/v1/` and `@/lib/api/v1/`.

## Conventions

- Keep decision logic in `src/lib` as pure functions with colocated vitest tests (node environment, no network); route handlers stay thin.
- Comments in this codebase explain *why* (see the engine and middleware headers) — match that style.
- Security posture is a feature of the template: RLS everywhere, HMAC-verified webhooks, encrypted tokens, security headers + report-only CSP in `next.config.ts`, SSRF guard for user-supplied webhook URLs (`@/lib/webhooks/ssrf`). Don't weaken these when adding features.
- Commit messages: imperative, terse first line; body explains the why.
