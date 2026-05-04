# Kapitan Reconciliation Flow

## Pipeline

1. WhatsApp or Telegram receives text and/or an image.
2. Webhook ingestion creates `Message` and `Receipt` records.
3. Worker persists media, runs OCR, and extracts payment data.
4. If no school slug is supplied, school resolution can infer the school from the destination account in the receipt.
5. Matching ranks open charges for that school.
6. Reconciliation either auto-confirms, creates a payer prompt, or opens manual review.
7. Prompt replies can reprocess with forced student/charge IDs or distribute payment across multiple charges.
8. Final state should update `Receipt`, `Payment`, `Reconciliation`, `ReconciliationAllocation`, and `Charge` consistently.

## Important Services

- `ocr.service.ts`: text extraction and OCR fallback.
- `extraction.service.ts`: amount, date, sender, bank, reference, destination account, confidence.
- `school-resolution.service.ts`: destination-account-to-school inference.
- `matching.service.ts`: charge ranking and confidence signals.
- `reconciliation.service.ts`: auto/manual reconciliation, household plans, partial/overpayment prompts, allocations.
- `receipt-resolution.service.ts`: payer prompt reply handling.
- `webhook-ingestion.service.ts`: inbound message and receipt creation.
- `workers/handlers.ts`: background processing entry point.

## Matching Signals

`matching.service.ts` scores candidates using:

- Exact or close amount.
- Sender versus guardian name.
- Sender or OCR text versus student name.
- Paid date versus due date.
- OCR text containing the charge period label.

The score alone is not enough. Reconciliation also checks identity signals and candidate ambiguity before auto-confirming.

## Prompt Types

- `SELECT_PAYER`: asks who paid when amount/school are known but payer identity is not reliable.
- `SELECT_STUDENT`: asks which student to apply the payment to.
- `SELECT_PERIOD`: asks which charge/period to apply.
- `CONFIRM_PARTIAL_PAYMENT`: asks whether a smaller amount is an abono.
- `CONFIRM_OVERPAYMENT`: asks whether a larger amount should apply to oldest debts/multiple charges.

Prompt answers should mark the prompt answered, store `selectedOption` and `freeTextAnswer`, then call the appropriate reconciliation path.

## Family Payments

Family payment behavior must generalize:

- Same guardian can have 2, 3, 4, or N students.
- A single receipt can cover multiple students, multiple periods, or both.
- The plan should select relevant open charges whose outstanding balances explain the receipt amount.
- Do not encode business rules like "three siblings" as a special case.

Known important strategy names:

- `payer_identified_household_distribution`
- `payer_confirmed_overpayment_distribution`
- `payer_confirmed_partial_payment`
- `payer_confirmed_period`

## Safety Checks

- School resolution requires a clear best bank-account candidate. If the top two candidates are too close, return null rather than assigning randomly.
- Manual review should be created when signals are weak, candidates are ambiguous, or payer rejects automated application.
- Reprocessing from prompts must avoid infinite prompt loops; respect `source: "payer_reply"` and forced IDs.
- Updating reconciliation should restore previous allocations before applying new ones.
- Charge status should reflect remaining balance: `PAID`, `PARTIALLY_PAID`, `PENDING`, or `OVERDUE`.

## Regression Cases

Cover these before calling Kapitan ready:

- OCR extracts amount/reference/text from a real-looking receipt.
- Destination account resolves the correct school without `schoolSlug`.
- Ambiguous destination account does not resolve.
- Exact payment for one student auto-reconciles.
- Payment for N students under one guardian prompts or reconciles correctly.
- Partial payment prompts, then confirmation applies partial balance.
- Overpayment/multi-month payment prompts, then confirmation creates allocations.
- Invalid prompt reply asks for a valid option and does not reconcile.
- Expired prompt moves the receipt to manual review.
- Already reconciled/approved receipts are not actionable in manual-review UI.
