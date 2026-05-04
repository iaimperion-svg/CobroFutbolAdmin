# CobroFutbol Data Model And Safety

## Main Domains

- Tenant: `School`.
- Access: `User`, `UserSchoolMembership`, `Role`, `Permission`.
- School operations: `Guardian`, `Student`, `Charge`, `BankAccount`.
- Messaging: `Conversation`, `Message`.
- Receipt pipeline: `Receipt`, `Payment`, `Reconciliation`, `ReconciliationAllocation`, `ReceiptCandidateMatch`, `ReviewTask`, `ReceiptResolutionPrompt`.
- Onboarding: `OnboardingRequest`, `OnboardingPaymentReceipt`, `OnboardingActivationToken`.

## Tenant Boundary

Keep operational data scoped by `schoolId`:

- Messages, conversations, receipts, payments, charges, reviews, prompts, bank accounts, students, guardians.
- Cross-school queries are only for internal backoffice/master views.
- Do not use a default school fallback in production ingestion.

## Seed Safety

`prisma/seed.ts` intentionally deletes many records and recreates demo data. It must remain guarded:

- Block in `NODE_ENV=production`.
- Require `ALLOW_DESTRUCTIVE_SEED=true`.
- Require `ALLOW_REMOTE_DESTRUCTIVE_SEED=true` when `DATABASE_URL` does not look local.

Do not weaken these guards.

## Schema Change Checklist

1. Add or modify Prisma model/enum/index/relation.
2. Update affected services and tests.
3. Run `npm run db:generate`.
4. Apply migration/push only to the intended environment.
5. Run focused tests.
6. For production, verify the actual DB state with SQL evidence.

## High-Risk Areas

- Enum changes used by deployed app and worker.
- Receipt status transitions.
- Prompt types/statuses.
- Payment/reconciliation/charge allocation transactions.
- Bank account fields used for school resolution.
- Onboarding activation tokens.
- Platform finance models if monthly invoices/payments are introduced.

## Production Verification Patterns

Use SQL evidence for production state, for example:

- Enumerate enum labels through `pg_enum` and `pg_type`.
- Check pending prompts/reviews by `schoolId` or slug.
- Check latest receipts with status, amount, extracted text, and processed timestamp.
- Check reconciliations, payments, allocations, and charge outstanding balances after tests.

## Data Repair Safety

- Prefer read-only queries first.
- Show exact intended row scope before any write.
- Use transactions for multi-table repairs.
- Do not clean broad tables without a test-only identifier.
- Preserve schools, students, guardians, charges, bank accounts, and real history unless the user explicitly approves otherwise.
