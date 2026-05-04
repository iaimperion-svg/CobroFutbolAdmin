# CobroFutbol UI Map

## Main Routes

Public:

- `/`
- `/alta`
- `/activar`
- `/login`

School portal:

- `/app`
- `/app/reviews`
- `/app/reviews/monthly`
- `/app/receipts`
- `/app/receipts/[receiptId]`
- `/app/students`
- `/app/students/new`
- `/app/students/[studentId]`

Internal backoffice:

- `/backoffice`
- `/backoffice/onboarding`
- `/backoffice/onboarding/proyecto`
- `/backoffice/maestro`
- `/backoffice/maestro/[school]`

## Shared Components

- `components/app/app-shell.tsx`: sidebar/nav shell for school portal.
- `components/ui/status-badge.tsx`: status labels and tones.
- `components/ui/empty-state.tsx`: empty cards.
- `components/ui/section-header.tsx`: common section heading.
- `components/receipts/receipt-drawer-actions.tsx`: manual receipt actions and locked state.
- `components/onboarding/*`: public onboarding and activation.
- `components/students/*`: student CRUD.
- `components/reviews/review-resolve-form.tsx`: manual review resolution.

## Visual Language

- Brand green/dark/silver tokens live in `src/app/globals.css`.
- Many screens use dense operational cards, tables, pills, and shell sections.
- Cards and panels are already styled through global classes; prefer reusing them.
- Internal tools should prioritize scanning and repeated action over decorative hero layouts.

## Important UI States

- Empty state.
- Loading/pending action.
- Error feedback.
- Success feedback.
- Locked/closed receipt.
- Manual review open/in progress/resolved.
- Receipt `AUTO_RECONCILED`, `MANUAL_REVIEW`, `AWAITING_PAYER_REPLY`, `FAILED`.
- Onboarding `APPROVED_PENDING_ACTIVATION`, `ACTIVE`, `REJECTED`.
- Setup incomplete.

## Risks

- Some existing text may contain mojibake from encoding issues. If touching nearby text, preserve intent and fix only the scoped visible copy.
- Global CSS is large; narrow changes are safer.
- Manual review UI can affect money state. Do not enable actions for closed receipts.
- Backoffice finance screens must separate platform money from school collections.
- Dashboard numbers are operational; labels must not overclaim.

## Visual Verification Checklist

- Desktop and mobile layout do not overlap.
- Buttons and tabs fit their labels.
- Disabled states are obvious.
- Tables remain scannable.
- Empty/error states explain next action.
- Actions match the underlying receipt/onboarding status.
