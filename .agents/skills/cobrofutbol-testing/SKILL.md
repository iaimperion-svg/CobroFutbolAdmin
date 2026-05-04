---
name: cobrofutbol-testing
description: Choose and run CobroFutbol verification commands. Use when deciding which tests to run, validating changes, fixing failures, checking TypeScript, mapping tests by module, investigating CI-like failures, or after edits to Kapitan, onboarding, webhooks, Prisma, workers, auth, students, receipts, manual review, backoffice, or UI behavior.
---

# CobroFutbol Testing

Use this skill to choose the smallest useful verification set for a change.

## Required Context

Read [references/test-map.md](references/test-map.md) before deciding the test plan.

Then inspect:

- `package.json`
- `vitest.config.ts`
- Relevant test files under `tests/`
- Relevant service/page/component files changed

## Workflow

1. Identify the changed module or risk area.
2. Run focused tests first.
3. Run `npm run lint` after TypeScript, Prisma, route, component, or shared type changes.
4. Run broader `npm run test` when touching shared services, Prisma schema, auth/session, queues/workers, or multiple domains.
5. If production behavior matters, combine with `cobrofutbol-produccion` and `cobrofutbol-validar`.
6. Report exact commands, pass/fail status, and skipped commands with reasons.

## Common Commands

```powershell
npm run lint
npm run test
npm run test -- tests/reconciliation.service.test.ts
```

## Rules

- Prefer targeted tests while iterating, then broader verification before finalizing risky work.
- Do not claim a flow is validated if only TypeScript passed.
- Do not replace a missing test with a vague assertion; name the missing coverage.
- For production fixes, local tests are not enough; include deployed evidence when the user asks for production readiness.
- When a test fails, summarize the failing assertion and relevant file before making changes.

## Reporting

Use concise verification notes:

```markdown
Verificacion:
- `npm run test -- tests/...`: PASO/FALLO/NO EJECUTADO
- `npm run lint`: PASO/FALLO/NO EJECUTADO
```
