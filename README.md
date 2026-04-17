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
TELEGRAM_WEBHOOK_URL=""
TELEGRAM_WEBHOOK_SECRET=""
ONBOARDING_TELEGRAM_ENABLED="false"
ONBOARDING_TELEGRAM_BOT_TOKEN=""
ONBOARDING_TELEGRAM_BOT_USERNAME=""
ONBOARDING_TELEGRAM_WEBHOOK_URL=""
ONBOARDING_TELEGRAM_WEBHOOK_SECRET=""
