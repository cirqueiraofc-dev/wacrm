---
name: preflight
description: Verify wacrm changes locally before committing or pushing — the exact checks CI runs, plus the environment-variable gotchas that make builds and tests fail confusingly. Use this skill whenever you are about to commit, push, or open a PR in this repo, or when `npm run build` / `npm test` fails with missing-env or Supabase errors.
---

# Preflight checks

CI (`.github/workflows/ci.yml`) runs exactly four checks on every PR. Run them all locally in this order — later ones are slower, so fail fast:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

All four must pass. Prettier is *not* CI-enforced but `npm run format` is expected by CONTRIBUTING.md before a PR.

## Environment gotchas

Several modules read env vars **at import time**, so missing values fail in confusing places:

- **Tests need nothing**: `vitest.config.ts` injects dummy `ENCRYPTION_KEY` and `META_APP_SECRET`. If a new module reads another env var at module load, add a dummy for it in `vitest.config.ts` *and* the CI workflow's `env:` block, keeping the values lexically identical in both.
- **`npm run build` needs** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the client factories use `!` assertions read at build time). Without a `.env.local`, dummies are fine:

  ```bash
  NEXT_PUBLIC_SUPABASE_URL=https://ci.example.supabase.co \
  NEXT_PUBLIC_SUPABASE_ANON_KEY=ci-dummy-anon-key \
  ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000 \
  META_APP_SECRET=ci-dummy-meta-secret \
  npm run build
  ```

- If you add a new required env var, document it in `.env.local.example` (it is the canonical env reference) and add dummies to CI + vitest as above.

## Running a subset

```bash
npx vitest run src/lib/whatsapp/encryption.test.ts   # one file
npx vitest run src/lib/flows/                        # one domain
```

Tests are colocated `*.test.ts` files, node environment, no network — they exercise pure logic in `src/lib`. If your change is untestable because logic lives in a route handler or component, that's the signal to extract it into `src/lib` first.

## The mcp-server package

`mcp-server/` is a separate npm package that main CI does not cover. If you touched it: `cd mcp-server && npm run typecheck && npm run build`.

## Commit style

First line imperative and terse; body explains the *why* (the diff shows the what). One logical change per PR.
