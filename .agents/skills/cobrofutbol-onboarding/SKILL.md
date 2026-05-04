---
name: cobrofutbol-onboarding
description: Work on CobroFutbol school onboarding. Use when changing or validating /alta, onboarding Telegram bot, setup payment receipts, onboarding review, approve/reject flows, activation links, activation tokens, user/school creation, school setup, operations email, default bank account, onboarding emails, or ONBOARDING_* environment behavior.
---

# CobroFutbol Onboarding

Use this skill for the ingreso/pre-calentamiento flow that turns a public application into an activated school tenant.

## Required Context

Read [references/onboarding-flow.md](references/onboarding-flow.md) before changing onboarding behavior.

Then inspect only the files relevant to the task:

- `src/server/services/onboarding.service.ts`
- `src/server/services/school-setup.service.ts`
- `src/server/auth/onboarding-review.ts`
- `src/app/alta`
- `src/app/activar`
- `src/app/backoffice/onboarding`
- `src/components/onboarding`
- `prisma/schema.prisma`
- `tests/onboarding.service.test.ts`
- `tests/school-setup.service.test.ts`

## Workflow

1. Identify the stage: public request, bot access, Telegram receipt, review, approval, activation, setup, or resend.
2. Preserve status transitions across `OnboardingRequest`, `OnboardingPaymentReceipt`, `OnboardingActivationToken`, `School`, `User`, roles, memberships, and permissions.
3. Keep onboarding review protected by `ONBOARDING_REVIEW_SECRET`.
4. Do not expose activation tokens, passwords, Telegram tokens, review secrets, or payment credentials in logs or responses.
5. Prefer focused tests in `tests/onboarding.service.test.ts` or `tests/school-setup.service.test.ts`.
6. For production validation, combine this skill with `cobrofutbol-validar`.

## Core Rules

- Creating a request should not fail just because email delivery fails; preserve a manual delivery fallback.
- Telegram linking and receipt intake should keep the request in a recoverable status.
- OCR/extraction failures should not leave the flow half-updated; receipt should remain reviewable.
- Approval creates or reuses the school/user safely, marks the latest receipt approved, creates a fresh activation token, and moves the request to `APPROVED_PENDING_ACTIVATION`.
- Activation token TTL is short; resends should invalidate unused previous tokens.
- Consuming an activation token activates the user, activates the school, marks the token used, and moves the request to `ACTIVE`.
- School setup is complete only with operations email, default bank account, and setup completion timestamp.
- Bank account numbers should be masked for display but preserve the reference needed for school resolution.

## Common Tests

Run the narrow tests that match the changed area:

```powershell
npm run test -- tests/onboarding.service.test.ts
npm run test -- tests/school-setup.service.test.ts
```

For broader confidence:

```powershell
npm run lint
npm run test
```

## Reporting

When reporting onboarding work, include:

- Which stage changed.
- Status transitions affected.
- Whether access/activation delivery is email, Telegram, manual fallback, or not executed.
- Tests run and exact failures/skips.
- Any production evidence still needed.
