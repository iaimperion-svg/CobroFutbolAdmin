---
name: backoffice-maestro-finanzas
description: Work on CobroFutbol master backoffice and platform finance. Use when changing or validating /backoffice/maestro, global school health, platform revenue, MRR/ARR, onboarding revenue, real CobroFutbol monthly billing, platform invoices/payments, school detail KPIs, attention scores, customer operational status, or separating CobroFutbol cash from money schools collect from guardians.
---

# Backoffice Maestro Finanzas

Use this skill for CobroFutbol's internal operator view and platform-money model.

## Required Context

Read [references/master-finance-flow.md](references/master-finance-flow.md) before changing maestro or platform finance behavior.

Then inspect only the files relevant to the task:

- `src/server/services/backoffice-master.service.ts`
- `src/app/backoffice/maestro/page.tsx`
- `src/app/backoffice/maestro/[school]/page.tsx`
- `src/app/backoffice/onboarding/proyecto/page.tsx`
- `src/server/services/onboarding.service.ts`
- `src/server/services/school-setup.service.ts`
- `prisma/schema.prisma`
- `tests/onboarding.service.test.ts`
- `tests/school-setup.service.test.ts`

## Workflow

1. Decide whether the task is operational health, platform revenue, school detail, billing model, or UI presentation.
2. Keep platform money separate from school collection money.
3. Distinguish expected revenue from real received revenue.
4. Preserve tenant boundaries and avoid aggregating unrelated schools into detail views.
5. If adding real monthly billing, model durable records instead of relying only on derived MRR.
6. Validate data labels carefully; finance UI should not imply money was collected when it is only expected.

## Core Rules

- "Cobrado por escuelas a apoderados" belongs to school operations.
- "Cobrado por CobroFutbol to schools" belongs to platform finance.
- Current `platformMonthlyExpectedCents` and ARR are expected values by plan, not proof of payment.
- Onboarding setup receipts can count as CobroFutbol onboarding revenue only when approved.
- The next durable finance step should model platform invoices/payments per school/month if real CobroFutbol mensualidad tracking is required.
- Backoffice health should prioritize incomplete setup, open reviews, current outstanding balance, onboarding in progress, and missing recent receipts.
- UI labels must be precise: expected, pending, collected, active, overdue, or review-open.

## Common Tests

There is no dedicated `backoffice-master.service.test.ts` yet. For adjacent coverage run:

```powershell
npm run test -- tests/onboarding.service.test.ts
npm run test -- tests/school-setup.service.test.ts
npm run lint
```

If changing shared reconciliation metrics, also run:

```powershell
npm run test -- tests/reconciliation.service.test.ts
npm run test -- tests/webhook-ingestion.service.test.ts
```

## Reporting

When reporting maestro/finance work, include:

- Whether numbers are expected, collected, pending, or overdue.
- Whether the money is platform money or school collection money.
- Which dashboard/detail KPIs changed.
- Tests run and exact failures/skips.
- Any missing durable model or production evidence.
