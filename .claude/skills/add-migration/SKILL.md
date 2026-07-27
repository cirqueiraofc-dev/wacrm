---
name: add-migration
description: Add or change database schema in wacrm — new tables, columns, indexes, RLS policies, RPCs, enums, or storage buckets. Use this skill whenever a task touches supabase/migrations/, mentions the database schema, Postgres, RLS, row-level security, or requires persisting a new kind of data, even if the user doesn't say the word "migration".
---

# Adding a Supabase migration

Schema changes ship as numbered SQL files in `supabase/migrations/`. Users apply them by hand (SQL editor or CLI) on live databases that already ran every earlier file — which drives every convention below.

## Workflow

1. Find the highest existing number: `ls supabase/migrations/ | sort | tail -1`.
2. Create `NNN_short_name.sql` with the next zero-padded number. Never renumber or edit an already-merged migration — forks have already applied it; corrections go in a new file (see `032_fix_ai_knowledge_membership.sql`, `034_fix_profiles_update_rls.sql` for precedent).
3. Write the migration following the conventions below.
4. If the change affects TypeScript, update `src/types/index.ts` and any `@/lib` domain module in the same commit so JS and SQL stay aligned.

## File conventions (read a recent migration first, e.g. 026)

- **Header comment block** explaining what the migration adds and *why* the design is what it is — design notes, RLS rationale, cross-references to related migrations. This is the primary documentation for the schema; match the depth of existing files.
- **Idempotent**: safe to run twice. `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DROP POLICY IF EXISTS` before every `CREATE POLICY` (Postgres has no `CREATE POLICY IF NOT EXISTS`), `CREATE OR REPLACE FUNCTION`.
- **Account-scoped**: every tenant-owned table carries `account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE` plus an index on it. Data belongs to the account, not the user; user references (`created_by` etc.) are audit-only and `ON DELETE SET NULL` so removing a teammate never destroys account data.
- **Comment the non-obvious**: why an index exists, why a policy has the shape it has.

## RLS — required on every table

```sql
ALTER TABLE my_table ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS my_table_select ON my_table;
CREATE POLICY my_table_select ON my_table FOR SELECT
  USING (is_account_member(account_id));            -- any member (viewer+)

DROP POLICY IF EXISTS my_table_insert ON my_table;
CREATE POLICY my_table_insert ON my_table FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin')); -- admin+ writes
```

`is_account_member(account_id, min_role)` (from `017_account_sharing.sql`) is the single authorization primitive; roles are `viewer < agent < admin < owner`. Pick the minimum role per operation and mirror the choice in the TypeScript predicates in `src/lib/auth/roles.ts` — RLS and the app must express the same policy. Typical patterns: settings-class tables (tags, custom fields, API keys) are member-read / admin-write; operational data (contacts, messages, deals) is agent-write.

Server-side engines (webhook, automations, flows, public API) use service-role clients that **bypass RLS** — RLS protects the dashboard path, while engine code must filter by `account_id` explicitly. Don't assume a policy protects engine queries.

## Testing

There is no migration test harness. Sanity-check by reading: idempotency (run-twice safety), RLS present, `account_id` indexed. Then run `npm run typecheck && npm test` to catch drift in the TypeScript that mirrors the schema.
