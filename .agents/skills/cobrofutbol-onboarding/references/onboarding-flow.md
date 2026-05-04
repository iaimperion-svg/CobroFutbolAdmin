# CobroFutbol Onboarding Flow

## Pipeline

1. Public page `/alta` creates an `OnboardingRequest`.
2. The request receives a public code like `PG-*`, expected setup amount, plan, and Telegram start token.
3. Access instructions are sent by email when possible; failures should be recorded as manual fallback, not fatal.
4. The onboarding Telegram bot links the request and receives the setup/pre-calentamiento receipt.
5. Receipt OCR/extraction assesses amount and reference.
6. Backoffice review approves or rejects the request.
7. Approval creates or links school, user, permissions, role, membership, approved receipt, and activation token.
8. Activation via `/activar?token=...` sets the password, activates the user, activates the school, consumes the token, and marks the request active.
9. School setup captures operations email and default bank account for ongoing receipt resolution.

## Important Models

- `OnboardingRequest`: public application, plan, public code, Telegram link, status, school/user links.
- `OnboardingPaymentReceipt`: setup receipt evidence and OCR result.
- `OnboardingActivationToken`: hashed activation token with expiry and `usedAt`.
- `School`: tenant created inactive on approval, active after activation.
- `User`, `Role`, `Permission`, `UserSchoolMembership`: access created during approval.
- `BankAccount`: default account used later by school resolution.

## Important Statuses

`OnboardingRequestStatus`:

- `PENDING_PAYMENT`
- `TELEGRAM_LINKED`
- `RECEIPT_RECEIVED`
- `UNDER_REVIEW`
- `APPROVED_PENDING_ACTIVATION`
- `ACTIVE`
- `REJECTED`
- `EXPIRED`
- `CANCELED`

`OnboardingReceiptStatus`:

- `RECEIVED`
- `UNDER_REVIEW`
- `APPROVED`
- `REJECTED`
- `FAILED`

## Safety Checks

- Do not approve a request without review access.
- Do not create duplicate users for the same email.
- Do not leave multiple unused activation tokens active after resend.
- Do not expose raw activation token hashes or review secrets.
- Do not activate the school before the user consumes the activation link.
- Do not store unmasked account numbers in UI-facing output.
- Do not lose the account reference needed for future destination-account matching.

## Regression Cases

- Create request with bot link and reference code.
- Email failure falls back to manual delivery metadata.
- Resend bot access for still-open requests.
- Telegram receipt with valid amount/reference moves to review.
- OCR failure creates/updates receipt without corrupting request state.
- Approve request creates school/user/access and activation link.
- Resend activation only for `APPROVED_PENDING_ACTIVATION`.
- Consume activation token activates request, user, and school.
- Reject request marks request and latest receipt rejected with reason.
- School setup requires operations email and account data.
