---
name: kapitan-conciliacion
description: Work on Kapitan receipt reconciliation in CobroFutbol. Use when changing or validating OCR/extraction, school resolution by destination account, matching scores, auto reconciliation, manual review, payer prompts, SELECT_PAYER, SELECT_STUDENT, SELECT_PERIOD, partial payments, overpayments, family payments, receipt allocations, or Telegram/WhatsApp payment receipt flows.
---

# Kapitan Conciliacion

Use this skill for the CobroFutbol payment-receipt pipeline from incoming message to final payment allocation.

## Required Context

Read [references/reconciliation-flow.md](references/reconciliation-flow.md) before changing or validating reconciliation behavior.

Then inspect only the files relevant to the task:

- `src/server/services/ocr.service.ts`
- `src/server/services/extraction.service.ts`
- `src/server/services/school-resolution.service.ts`
- `src/server/services/matching.service.ts`
- `src/server/services/reconciliation.service.ts`
- `src/server/services/receipt-resolution.service.ts`
- `src/server/services/webhook-ingestion.service.ts`
- `src/server/workers/handlers.ts`
- `prisma/schema.prisma`
- `tests/extraction.service.test.ts`
- `tests/matching.service.test.ts`
- `tests/reconciliation.service.test.ts`
- `tests/receipt-resolution.service.test.ts`
- `tests/school-setup.service.test.ts`
- `tests/webhook-ingestion.service.test.ts`

## Workflow

1. Identify the pipeline stage: OCR/extraction, school resolution, candidate matching, automatic reconciliation, prompt creation, prompt answer handling, manual review, or UI evidence.
2. Trace the receipt status transitions and dependent records: `Receipt`, `Payment`, `Reconciliation`, `ReconciliationAllocation`, `Charge`, `ReceiptResolutionPrompt`, `ReviewTask`, and `ReceiptCandidateMatch`.
3. Preserve tenant boundaries through `schoolId`.
4. Prefer adding or updating focused Vitest coverage for every behavior change.
5. For production validation, combine this skill with `cobrofutbol-validar` and collect database/log evidence.

## Core Rules

- Do not special-case a fixed number of siblings. Family payments must work for N students and N periods by summing open balances under the relevant guardian/group.
- Do not auto-assign a school when destination-account resolution is ambiguous.
- Do not auto-reconcile amount-only matches unless the confidence and identity signals satisfy the service rules.
- Treat ambiguous top candidates as prompt/manual-review cases, not automatic success.
- Keep prompt answers strict: accept option number or unambiguous label; invalid replies should ask the payer to respond with a valid option.
- When a payer confirms partial payment, reconcile against the selected charge with partial-payment metadata.
- When a payer confirms overpayment/multi-month distribution, apply to the intended oldest debts and persist allocations.
- Closed or reconciled receipts should not remain actionable in manual review.

## Common Tests

Run the narrow tests that match the changed area:

```powershell
npm run test -- tests/extraction.service.test.ts
npm run test -- tests/matching.service.test.ts
npm run test -- tests/reconciliation.service.test.ts
npm run test -- tests/receipt-resolution.service.test.ts
npm run test -- tests/webhook-ingestion.service.test.ts
```

For broad confidence, also run:

```powershell
npm run lint
npm run test
```

## Reporting

When reporting Kapitan work, include:

- Which pipeline stage changed.
- Receipt statuses or prompt types affected.
- Strategies used, such as `payer_identified_household_distribution`, `payer_confirmed_partial_payment`, or `payer_confirmed_overpayment_distribution`.
- Tests run and exact failures/skips.
- Any remaining production evidence still needed.
