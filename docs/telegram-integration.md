# Integracion Telegram en local

Esta fase deja a `CobroFutbol` listo para recibir comprobantes reales desde Telegram y conectarlos al pipeline actual de mensajes, comprobantes, colas y conciliacion.

## Requisitos

- Bot de Telegram creado con `@BotFather`
- Token del bot
- URL publica HTTPS para tu entorno local
- App web corriendo en `http://localhost:3000`
- Worker corriendo con `npm run worker`
- PostgreSQL y Redis activos

## 1. Crear el bot

1. Abre Telegram y conversa con `@BotFather`.
2. Ejecuta `/newbot`.
3. Define nombre y username del bot.
4. Guarda el token entregado por BotFather.

## 2. Configurar variables

Completa estas variables en `.env`:

```env
TELEGRAM_ENABLED="true"
TELEGRAM_BOT_TOKEN="123456:ABCDEF..."
TELEGRAM_WEBHOOK_SECRET="telegram-dev-secret"
TELEGRAM_WEBHOOK_URL="https://tu-url-publica.ngrok-free.app/api/v1/webhooks/telegram?schoolSlug=academia-central"
```

Notas:

- `TELEGRAM_WEBHOOK_URL` debe apuntar al endpoint real del proyecto e incluir `schoolSlug`.
- `TELEGRAM_WEBHOOK_SECRET` debe ser el mismo secret que registraras en Telegram.
- `TELEGRAM_ENABLED=false` desactiva el webhook sin tocar el resto del sistema.

## 3. Exponer localhost con HTTPS

Telegram exige una URL publica HTTPS para el webhook. Puedes usar una tuneladora como `ngrok` o `cloudflared`.

Ejemplo con `ngrok`:

```bash
ngrok http 3000
```

Toma la URL HTTPS publica y usala en `TELEGRAM_WEBHOOK_URL`.

## 4. Registrar el webhook

Con el bot, el secret y la URL publica ya listos:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://tu-url-publica.ngrok-free.app/api/v1/webhooks/telegram?schoolSlug=academia-central",
    "secret_token": "telegram-dev-secret",
    "allowed_updates": ["message", "edited_message"]
  }'
```

Para revisar el estado actual:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

## 5. Levantar el entorno

```bash
docker compose up -d postgres redis
npm run db:generate
npm run db:push
npm run dev
npm run worker
```

## 6. Probar desde Telegram

Pruebas recomendadas:

1. Envia una foto con caption.
2. Envia una imagen como documento.
3. Envia un PDF con caption.
4. Envia solo texto.

Comportamiento esperado:

- Si llega foto o PDF, se crea `Message` inbound y uno o mas `Receipt`.
- El archivo se descarga desde Telegram al storage local.
- El comprobante entra a BullMQ para procesamiento.
- El sistema responde por Telegram que el comprobante fue recibido.
- Luego responde segun el resultado:
  - validado automaticamente
  - quedo en revision
  - no pudimos identificar el pago automaticamente

## 7. Verificacion en el panel

Abre `http://localhost:3000/app/receipts`.

Deberias ver:

- canal de origen `Telegram`
- chat de origen
- username si existe
- texto o caption del mensaje
- nombre del archivo recibido
- estado del procesamiento
- detalle lateral con adjunto y trazabilidad

## 8. Flujo tecnico implementado

1. Telegram envia el `Update` al webhook.
2. El backend valida el secret y normaliza el payload.
3. Se crea o reutiliza la conversacion por `chat_id`.
4. Se registra el `Message` inbound con chat, user, username y fecha original.
5. Si hay archivo, se crea `Receipt`.
6. Se encola `process-receipt` en BullMQ.
7. El worker descarga el archivo desde Telegram y lo guarda en `storage`.
8. Corre OCR/extraccion actual, matching y conciliacion.
9. La bandeja muestra origen Telegram, contenido y resultado.
