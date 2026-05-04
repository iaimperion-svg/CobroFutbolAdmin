---
name: cobrofutbol-datos-prisma
description: Work on CobroFutbol Prisma schema, migrations, seeds, tenant data, database safety, enum changes, production schema verification, destructive seed guards, school/account/user relationships, receipt/payment/reconciliation data models, or any task involving prisma/schema.prisma, prisma/seed.ts, db:generate, db:push, migrations, or SQL evidence.
---

# CobroFutbol Datos Prisma

Use this skill for data model, migration, and database safety work.

## Required Context

Read [references/data-model-safety.md](references/data-model-safety.md) before changing schema, seed, or production data.

Then inspect only the files relevant to the task:

- `prisma/schema.prisma`
- `prisma/seed.ts`
- `package.json`
- `docs/validar.md`
- `docs/codex-context.md`
- Service/tests touching the changed models.

## Workflow

1. Identify whether the task is schema design, migration, generated client, seed, data repair, or production query.
2. Check local schema, migrations, and production reality when production behavior matters. Do not assume local `schema.prisma` is fully current if docs or deployed code indicate a recent hotfix.
3. Preserve tenant boundaries. Most operational rows must remain scoped by `schoolId`.
4. Use Prisma relations and transactions instead of ad hoc data mutation when implementing app behavior.
5. For schema changes, update Prisma schema, generate client, and add focused tests.
6. For production data changes, gather evidence first and request explicit approval for destructive or corrective writes.

## Core Rules

- Never run destructive seed against production.
- `prisma/seed.ts` is intentionally guarded by `ALLOW_DESTRUCTIVE_SEED=true` and remote protection.
- Do not delete schools, users, students, guardians, charges, bank accounts, or real receipts unless explicitly authorized with exact scope.
- Preserve `schoolId` on tenant-owned records and index query paths used by dashboards/workers.
- Enum changes require both schema/client changes and production DB verification before declaring deployed behavior ready.
- Treat `docs/validar.md` and production DB checks as source of truth for deployed enum/state validation.
- Be alert for local/prod drift. Example risk: recent prompt enum additions may exist in production docs/code before local schema display catches up.

## Common Commands

```powershell
npm run db:generate
npm run db:push
npm run test
npm run lint
```

Run DB commands only against the intended environment. For production, prefer explicit Docker/Postgres evidence and avoid writes unless the user requested them.

## Reporting

When reporting data work, include:

- Models/enums changed or inspected.
- Whether client generation was run.
- Whether the target DB was local or production.
- Any migration/push/test command results.
- Destructive actions not run, or explicit approval if they were run.
