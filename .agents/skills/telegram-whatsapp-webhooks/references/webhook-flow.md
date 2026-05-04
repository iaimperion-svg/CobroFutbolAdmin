# Telegram And WhatsApp Webhook Flow

## Telegram

Route: `/api/v1/webhooks/telegram`.

Important behavior:

- Requires `TELEGRAM_ENABLED`.
- Validates `x-telegram-bot-api-secret-token` when `TELEGRAM_WEBHOOK_SECRET` is configured.
- Accepts optional `schoolSlug`, but production should not depend on a fixed slug.
- Parses supported Telegram message shapes through `parseTelegramUpdate`.
- Supports photos and image/PDF documents.
- Uses `telegram://file_id` placeholders that later resolve through the Bot API.
- Returns accepted response after ingestion.

## WhatsApp

Route: `/api/v1/webhooks/whatsapp`.

Important behavior:

- GET verification checks `hub.mode`, `hub.challenge`, and `hub.verify_token`.
- POST requires `WHATSAPP_WEBHOOK_SECRET`.
- POST validates `x-hub-signature-256` with HMAC SHA-256 over the raw body.
- Supports optional `schoolSlug`, but generic school resolution should remain possible when attachments contain a destination account.

## Shared Ingestion

`webhook-ingestion.service.ts` coordinates shared behavior:

- Onboarding Telegram update detection and handling.
- Prompt reply detection for text-only messages.
- School resolution by explicit slug or destination account.
- Inbound message and receipt creation.
- Telegram acknowledgement after non-duplicate receipts.

## Data Records

- `Conversation`: per-school channel chat identity.
- `Message`: inbound/outbound chat message.
- `Receipt`: one per supported attachment.
- `ReceiptResolutionPrompt`: pending questions answered by chat text.

## Outbound Replies

`queueSystemReply` creates an outbound `Message` and enqueues `deliver-message`.

`deliverOutboundMessage`:

- Sends Telegram messages through Bot API when token and chat handle exist.
- Sends WhatsApp messages through `WHATSAPP_REPLY_URL` when configured.
- Marks messages `SENT` or `FAILED`.

## Regression Cases

- Telegram photo with caption creates one receipt using largest photo.
- Telegram document PDF is accepted.
- Unsupported Telegram update is ignored without acknowledgement.
- Onboarding `/start onb_*` routes to onboarding, not school receipt ingestion.
- Text-only reply to an open prompt is handled before new receipt flow.
- WhatsApp invalid signature returns `403`.
- WhatsApp valid signature calls ingestion with parsed raw body.
- Duplicate external message returns existing message/receipts.
- Missing school resolution returns ignored reason rather than assigning a default school.
