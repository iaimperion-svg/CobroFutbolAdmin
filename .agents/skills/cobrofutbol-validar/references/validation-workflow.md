# Validation Workflow Reference

## Source Of Truth

`docs/validar.md` is the authoritative validation matrix. This reference only summarizes how to use it.

## Minimum Validation Evidence

Collect and report:

- Date/time of validation.
- Target environment and production URL/path.
- Relevant git state or deployed code evidence.
- Docker service status for app, worker, postgres, redis, and caddy.
- Production app response.
- App and worker evidence for the feature under validation.
- Database/schema evidence when enums or migrations matter.
- TypeScript or lint result.
- Automated test results by file.
- Manual case results by test case.
- Receipt, prompt, payment, reconciliation, allocation, or review-task IDs used as evidence.
- Logs that show queueing, processing, extraction, resolution, or reconciliation.

## Required Attitude

- Mark every check as `PASO`, `FALLO`, or `NO EJECUTADO`.
- A skipped check needs a concrete reason.
- A passing check needs an observed value.
- A failing check needs the observed failure and the next recommended action.

## High-Risk Cases

Pay special attention to:

- OCR extracting amount, date, reference, bank, text, and confidence.
- School resolution by destination bank account without relying on `schoolSlug`.
- Ambiguous destination accounts not being auto-assigned.
- Exact single-student payments.
- Family payments for N students or N periods, not hard-coded sibling counts.
- `SELECT_PAYER`, `SELECT_STUDENT`, `SELECT_PERIOD`, partial payment, and overpayment prompts.
- Telegram webhook image flow through app and worker.
- Backoffice showing closed/open states correctly.

## 100 Percent Claim

Only say the module is 100 percent validated when all criteria in `docs/validar.md` are satisfied or explicitly scoped out by the user. Otherwise, state the current confidence and the missing evidence.
