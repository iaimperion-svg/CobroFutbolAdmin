---
name: telegram-whatsapp-webhooks
description: Work on CobroFutbol Telegram and WhatsApp webhook messaging. Use when changing or validating /api/v1/webhooks/telegram, /api/v1/webhooks/whatsapp, Telegram Bot API setup, webhook secrets, WhatsApp signatures, inbound messages, outbound replies, Conversation/Message records, receipt attachments, prompt replies via chat, onboarding Telegram updates, or webhook tests/logs.
---

# Telegram WhatsApp Webhooks

Use this skill for chat-channel ingestion and replies.

## Required Context

Read [references/webhook-flow.md](references/webhook-flow.md) before changing webhook behavior.

Then inspect only the files relevant to the task:

- `src/app/api/v1/webhooks/telegram/route.ts`
- `src/app/api/v1/webhooks/whatsapp/route.ts`
- `src/server/services/webhook-ingestion.service.ts`
- `src/server/services/telegram.service.ts`
- `src/server/services/messaging.service.ts`
- `src/server/services/receipts.service.ts`
- `src/server/services/receipt-resolution.service.ts`
- `src/server/services/onboarding.service.ts`
- `src/server/services/school-resolution.service.ts`
- `src/server/workers/handlers.ts`
- `src/scripts/telegram-webhook-set.ts`
- `src/scripts/telegram-webhook-info.ts`
- `tests/webhook-ingestion.service.test.ts`
- `tests/telegram.service.test.ts`
- `tests/whatsapp-webhook.route.test.ts`

## Workflow

1. Identify the channel: Telegram, WhatsApp, or shared ingestion.
2. Validate authentication first: Telegram secret header or WhatsApp HMAC signature/verify token.
3. Parse inbound payload into a normalized message and attachments.
4. Route onboarding updates before normal receipt ingestion.
5. Resolve pending prompt replies before treating text as a new receipt.
6. Resolve school from `schoolSlug` when supplied, otherwise by destination account from attachments.
7. Create `Conversation`, `Message`, and `Receipt` records through shared services.
8. Queue receipt processing and outbound replies rather than doing long work inside the HTTP route.

## Core Rules

- Telegram route returns `202` when the update is accepted for processing.
- WhatsApp GET verification must only return the challenge when verify token matches.
- WhatsApp POST must reject missing/invalid `x-hub-signature-256`.
- Do not log or expose bot tokens, webhook secrets, verify tokens, or raw credentials.
- Do not assume `schoolSlug` is present in production; generic webhook resolution by destination account is important.
- Onboarding Telegram updates take priority over normal receipt ingestion.
- Text-only messages can be prompt replies. Try prompt resolution before creating new receipt work.
- Duplicate external messages should not create duplicate receipts.
- Acknowledgements should be queued and failure to enqueue should not crash the accepted webhook.

## Common Tests

```powershell
npm run test -- tests/webhook-ingestion.service.test.ts
npm run test -- tests/telegram.service.test.ts
npm run test -- tests/whatsapp-webhook.route.test.ts
npm run test -- tests/receipt-resolution.service.test.ts
```

For end-to-end receipt behavior, also run:

```powershell
npm run test -- tests/school-setup.service.test.ts
npm run test -- tests/reconciliation.service.test.ts
```

## Reporting

When reporting webhook work, include:

- Channel and route affected.
- Auth/signature behavior.
- Whether update was ignored, accepted, queued, or handled as prompt reply.
- Message/receipt IDs when available.
- Tests run and exact failures/skips.
- Production webhook URL or Telegram webhook info only when verified.
