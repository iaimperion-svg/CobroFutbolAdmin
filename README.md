# CobroFutbol

CobroFutbol es un MVP SaaS multi-tenant para escuelas de futbol que automatiza la recepcion de comprobantes, la extraccion de datos, el matching contra deuda pendiente y la conciliacion asistida o automatica.

## Stack

- Next.js App Router con TypeScript estricto
- Prisma + PostgreSQL
- Redis + BullMQ para procesamiento background
- REST API para backoffice y webhooks
- Integracion real con Telegram Bot API para comprobantes entrantes
- Frontend inicial para dashboard, alumnos, comprobantes y revision manual

## Arquitectura

La arquitectura detallada y la estructura del repo estan en [docs/architecture.md](docs/architecture.md).  
La configuracion paso a paso de Telegram esta en [docs/telegram-integration.md](docs/telegram-integration.md).

## Primer arranque

1. Copia `.env.example` a `.env`.
2. Levanta infraestructura con `docker compose up -d postgres redis`.
3. Instala dependencias con `npm install`.
4. Genera Prisma Client con `npm run db:generate`.
5. Sincroniza el esquema con `npm run db:push`.
6. Si necesitas datos demo locales, define `ALLOW_DESTRUCTIVE_SEED=true` y ejecuta `npm run db:seed`.
7. Inicia la app con `npm run dev`.
8. En otra terminal inicia workers con `npm run worker`.

## Archivos de entorno

- `.env`: entorno local de desarrollo.
- `.env.example`: plantilla base para desarrollo local.
- `.env.production.example`: plantilla de referencia para Google Cloud o cualquier despliegue productivo.
- No subas `.env.production` ni archivos con secretos reales al repo.

## Variables Telegram

```env
TELEGRAM_ENABLED="false"
TELEGRAM_BOT_TOKEN=""
TELEGRAM_BOT_USERNAME=""
TELEGRAM_WEBHOOK_URL=""
TELEGRAM_WEBHOOK_SECRET=""
ONBOARDING_TELEGRAM_ENABLED="false"
ONBOARDING_TELEGRAM_BOT_TOKEN=""
ONBOARDING_TELEGRAM_BOT_USERNAME=""
ONBOARDING_TELEGRAM_WEBHOOK_URL=""
ONBOARDING_TELEGRAM_WEBHOOK_SECRET=""
ONBOARDING_PAYMENT_BANK_NAME=""
ONBOARDING_PAYMENT_ACCOUNT_TYPE=""
ONBOARDING_PAYMENT_ACCOUNT_NUMBER=""
ONBOARDING_PAYMENT_HOLDER_NAME=""
ONBOARDING_PAYMENT_HOLDER_RUT=""
ONBOARDING_PAYMENT_EMAIL=""
```

Cuando `TELEGRAM_ENABLED=true`, el endpoint real queda disponible en:

`/api/v1/webhooks/telegram?schoolSlug=<slug-de-la-escuela>`

Si completas `TELEGRAM_BOT_USERNAME`, el flujo de onboarding tambien puede reutilizar ese mismo bot para generar el deep link publico.

Cuando `ONBOARDING_TELEGRAM_ENABLED=true`, el bot de alta usa:

`/api/v1/onboarding/webhooks/telegram`

Cuando completes `ONBOARDING_PAYMENT_*`, la pantalla de exito de `/alta` mostrara banco,
tipo de cuenta, numero, titular y correo para que el cliente sepa donde transferir.

## Onboarding de escuelas

- La pagina publica de alta vive en `/alta`.
- Crea una solicitud, entrega un deep link de Telegram y espera el comprobante del Pre-calentamiento.
- El comprobante entra por el bot de onboarding y queda asociado a la solicitud.
- La revision manual se hace por endpoints protegidos con `ONBOARDING_REVIEW_SECRET`.
- Al aprobar, se crea la academia, el usuario admin queda en estado `INVITED` y se envia un link de activacion de 1 hora.
- La activacion final se completa en `/activar?token=<...>`.

### Endpoints internos de onboarding

- `POST /api/v1/onboarding/requests`
- `GET /api/v1/onboarding/review/requests` con header `x-onboarding-review-secret`
- `POST /api/v1/onboarding/review/requests/:requestId/approve` con header `x-onboarding-review-secret`
- `POST /api/v1/onboarding/review/requests/:requestId/reject` con header `x-onboarding-review-secret`
- `GET /api/v1/onboarding/review/receipts/:receiptId/file` con header `x-onboarding-review-secret`

## Seed local

- El seed demo esta bloqueado en `production`.
- Requiere `ALLOW_DESTRUCTIVE_SEED=true` y esta pensado para una base local desechable.
- Si `DATABASE_URL` no apunta a `localhost`, tambien exige `ALLOW_REMOTE_DESTRUCTIVE_SEED=true`.
- Al terminar imprime por consola el `schoolSlug`, el usuario admin y la password generada para ese entorno local.

## Flujo principal

1. WhatsApp o Telegram envia texto + comprobante.
2. Se crea `Message` y uno o mas `Receipt`.
3. El worker almacena el archivo, extrae texto y datos candidatos.
4. Se buscan coincidencias con alumnos, apoderados y cargos pendientes.
5. Si el score supera el umbral se reconcilia automaticamente.
6. Si no, se crea una tarea en revision manual con sugerencias.

## Despliegue en Google Cloud

- La misma imagen puede correr como web o como worker usando `APP_RUNTIME=web` o `APP_RUNTIME=worker`.
- Para Cloud Run, despliega al menos un servicio web y un servicio worker separados si quieres procesar la cola de BullMQ.
- No uses valores `localhost`, secretos placeholder ni URLs de tuneles temporales (`trycloudflare`, `ngrok`, `localtunnel`) en produccion.
- Puedes basarte en `.env.production.example` para cargar variables en Cloud Run y mover los secretos sensibles a Secret Manager.
