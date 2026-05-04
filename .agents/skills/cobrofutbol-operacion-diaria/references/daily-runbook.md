# Daily Operations Runbook

## Purpose

This runbook keeps CobroFutbol operationally honest each day: production is up, payments are flowing, onboarding is not stuck, and CobroFutbol's own money is visible separately from school collections.

## First 5 Minutes

Check:

- Production app responds at `https://app.cobrofutbol.cl/backoffice/maestro`.
- Docker services are up on `/opt/CobroFutbol`: app, worker, postgres, redis, caddy.
- Worker logs show receipt processing when new receipts exist.
- No obvious app/worker crash loop.

Use `cobrofutbol-produccion` for exact VPS handling.

## Maestro Review

Open or inspect `/backoffice/maestro` and look for:

- Schools needing attention.
- Setup incomplete: missing operations email or default bank account.
- Open reviews.
- Current period outstanding balance.
- No receipts in the last 7 days.
- Onboarding still in progress.

Use `backoffice-maestro-finanzas` for metric meaning.

## Kapitan Review

Check:

- Latest receipts and statuses.
- `ReceiptResolutionPrompt` rows still `OPEN`.
- `ReviewTask` rows `OPEN` or `IN_PROGRESS`.
- Failed receipts.
- Payments received but not reconciled.
- Recent worker logs for `queued receipt for processing`, picked jobs, extraction, completion, or failures.

High priority:

- Real payment stuck in prompt.
- Receipt failed OCR or processing.
- Auto reconciliation created suspicious allocations.
- Manual review remains open after payment is already reconciled.

Use `kapitan-conciliacion` for behavior and `cobrofutbol-validar` for evidence.

## Onboarding Review

Check:

- Requests in `PENDING_PAYMENT`, `TELEGRAM_LINKED`, `RECEIPT_RECEIVED`, `UNDER_REVIEW`, `APPROVED_PENDING_ACTIVATION`.
- Setup receipts waiting for review.
- Approved requests whose activation link expired or was not used.
- Email/Telegram delivery fallback metadata.

Use `cobrofutbol-onboarding`.

## CobroFutbol Money

Separate:

- School collection money: what apoderados pay to schools.
- Platform money: what schools pay CobroFutbol.

Today, platform money includes approved onboarding/setup revenue and expected monthly plan MRR/ARR. Real monthly payment tracking still needs durable `PlatformInvoice` / `PlatformPayment` style records before calling monthly payments collected.

Use `backoffice-maestro-finanzas`.

## Priority Heuristic

1. Production down or worker stopped.
2. Real customer payment stuck or incorrectly reconciled.
3. Onboarding approved but not activated.
4. Setup incomplete for an active school.
5. CobroFutbol platform money not tracked or unclear.
6. UI/reporting polish.

## Daily Close

End every daily operation report with:

- What is healthy.
- What needs action today.
- What is waiting on a user/customer.
- What was not checked.
- Any IDs needed to resume quickly.
