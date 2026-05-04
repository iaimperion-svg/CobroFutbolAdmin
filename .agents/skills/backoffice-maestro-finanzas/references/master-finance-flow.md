# Backoffice Maestro And Platform Finance

## Current Maestro Purpose

The master backoffice gives CobroFutbol an internal operator view across schools:

- Active/configured schools.
- Onboarding pipeline.
- Open manual reviews.
- Recent receipt flow.
- Auto-reconciliation rate.
- Current-period outstanding balances.
- School setup completeness.
- Expected platform revenue by plan.
- Approved onboarding setup revenue.

## Important Files

- `backoffice-master.service.ts`: aggregates global and per-school metrics.
- `/backoffice/maestro`: global master dashboard.
- `/backoffice/maestro/[school]`: per-school detail view.
- `school-setup.service.ts`: operations email and default bank account completeness.
- `onboarding.service.ts`: setup payment and plan source.

## Money Separation

There are two money domains:

1. School collection money:
   - Guardians pay the school.
   - Stored through `Receipt`, `Payment`, `Charge`, `Reconciliation`, and allocations.
   - Used for current outstanding, collected last 30 days, reviews, and auto reconciliation.

2. CobroFutbol platform money:
   - Schools pay CobroFutbol.
   - Currently represented mainly by approved onboarding setup receipts and expected MRR/ARR by plan.
   - Needs durable monthly invoice/payment records before saying a monthly platform payment was actually paid.

## Current Plan Prices

- `SEMILLERO`: 29,990 CLP monthly.
- `ACADEMIA`: 59,990 CLP monthly.
- `CLUB_PRO`: 89,990 CLP monthly.
- Setup/pre-calentamiento currently uses 39,990 CLP.

## Real Monthly Billing Direction

If asked to implement real CobroFutbol monthly tracking, prefer a model similar to:

- `PlatformInvoice`: school, period, plan, amount, due date, status.
- `PlatformPayment`: invoice, amount, paid date, receipt/reference, status.

Statuses should make operator meaning explicit: draft/open, pending, paid, overdue, waived/canceled, failed/rejected.

## Attention Score Inputs

Current operational priority should consider:

- Setup incomplete.
- Open reviews.
- Current-period outstanding balances.
- Onboarding request still open.
- No recent receipts.
- Unreconciled payments.

## Regression Cases

- Global dashboard distinguishes expected MRR/ARR from real collected onboarding revenue.
- School detail separates platform revenue from school collections.
- Setup completeness requires operations email and default bank account.
- Current period balance and future open balance are not mixed.
- Open review counts only open/in-progress manual tasks.
- Auto-reconciliation rate uses recent receipt status, not all-time counts.
- Search/filter preserves visible rows and does not hide health warnings accidentally.
