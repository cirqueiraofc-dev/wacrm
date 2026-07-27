---
name: add-api-route
description: Add or modify an HTTP endpoint in wacrm — dashboard routes under src/app/api/* or public REST endpoints under /api/v1. Use this skill whenever a task adds a route handler, exposes data to the frontend or to external integrators, or touches authentication/authorization on an endpoint, even if the user just says "add an endpoint" or "let the UI fetch X".
---

# Adding an API route

wacrm has two distinct route surfaces with different auth, response shapes, and Supabase clients. Pick the right one first — mixing their conventions is the main way new routes go wrong.

| | Dashboard (`/api/*`) | Public (`/api/v1/*`) |
|---|---|---|
| Caller | Signed-in human (cookie session) | Machine with API key (`Authorization: Bearer wacrm_live_…`) |
| Auth helper | `getCurrentAccount()` / `requireRole(role)` from `@/lib/auth/account` | `requireApiKey(request, 'scope:name')` from `@/lib/auth/api-context` |
| Supabase client | RLS-scoped user client from context | Service-role client from context — **bypasses RLS** |
| Response shape | Internal `{ error: string }` / ad-hoc JSON | Versioned envelope `{ data }` / `{ error: { code, message } }` via `@/lib/api/v1/respond` |
| Stability | Free to change with the UI | Public contract — don't break integrators |

## Dashboard route pattern

Copy the shape of `src/app/api/quick-replies/route.ts`:

```ts
export async function POST(request: Request) {
  let ctx
  try {
    ctx = await requireRole('agent')   // minimum role for this operation
  } catch (err) {
    return toErrorResponse(err)        // maps typed errors → 401/403
  }
  // validate body by hand (no zod in app routes), then query via
  // ctx.supabase (RLS-scoped) or a service-role client if the
  // operation crosses what RLS allows — after the explicit role check.
}
```

- Reads: `getCurrentAccount()` + the RLS client is usually enough — the policies scope rows.
- Role choice must match the predicates in `@/lib/auth/roles.ts` and the table's RLS policies. Don't open-code role comparisons.
- UI gating uses the same predicates via the `use-can` hook — update both sides if the policy changes.

## Public v1 route pattern

Copy the shape of `src/app/api/v1/contacts/route.ts`:

```ts
export async function GET(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'contacts:read');
    // ctx.supabase is SERVICE-ROLE: every query MUST filter
    // .eq('account_id', ctx.accountId) — nothing else scopes it.
    return okList(items, page);
  } catch (err) {
    return toApiErrorResponse(err);    // ApiError → envelope + status
  }
}
```

- One scope per operation; new scopes are added in `src/lib/api-keys/scopes.ts` (code change, not a migration).
- Responses only through `ok / okList / fail / toApiErrorResponse` in `@/lib/api/v1/respond.ts` — external clients parse one shape.
- Lists use keyset pagination from `@/lib/api/v1/pagination.ts`, not offsets.
- Rate limiting comes with `requireApiKey`; don't add a second layer.
- Shared serialization/query logic lives in `@/lib/api/v1/<domain>.ts` with colocated tests — keep the route file thin.
- Document the endpoint in `docs/public-api.md`, and check whether `mcp-server/src/tools/` should expose it.

## Both surfaces

- Route handlers stay thin; put decision logic in `src/lib` as pure functions with `*.test.ts` beside them (vitest, node env, no network).
- Start each route file with a header comment stating method(s), path, scope/role, and any non-obvious design choice — that's the house style.
- User-supplied URLs that the server will fetch (webhooks etc.) must pass the SSRF guard in `@/lib/webhooks/ssrf`.
- Webhook receivers (Meta) are the exception to all of the above: they authenticate by HMAC signature, not session or key — see `src/app/api/whatsapp/webhook/route.ts`.
- Finish with `npm run lint && npm run typecheck && npm test`.
