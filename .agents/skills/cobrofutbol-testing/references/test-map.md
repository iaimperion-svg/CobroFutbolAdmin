# CobroFutbol Test Map

## Scripts

- `npm run lint`: TypeScript check with `tsc --noEmit`.
- `npm run test`: all Vitest tests.
- `npm run test -- tests/<file>.test.ts`: focused Vitest run.
- `npm run build`: Prisma generate plus Next build; use for deploy/build confidence.

## Test Files By Area

Kapitan/OCR/reconciliation:

- `tests/ocr.service.test.ts`
- `tests/extraction.service.test.ts`
- `tests/matching.service.test.ts`
- `tests/reconciliation.service.test.ts`
- `tests/receipt-resolution.service.test.ts`
- `tests/manual-review.service.test.ts`
- `tests/receipts.service.test.ts`

Webhooks/messaging:

- `tests/webhook-ingestion.service.test.ts`
- `tests/telegram.service.test.ts`
- `tests/whatsapp-webhook.route.test.ts`
- `tests/messaging.service.test.ts`

Onboarding/setup:

- `tests/onboarding.service.test.ts`
- `tests/school-setup.service.test.ts`

Students/charges/auth:

- `tests/students.service.test.ts`
- `tests/charges.service.test.ts`
- `tests/session.service.test.ts`

## Recommended Sets

Changing OCR/extraction:

```powershell
npm run test -- tests/ocr.service.test.ts
npm run test -- tests/extraction.service.test.ts
npm run lint
```

Changing matching/reconciliation/prompts:

```powershell
npm run test -- tests/matching.service.test.ts
npm run test -- tests/reconciliation.service.test.ts
npm run test -- tests/receipt-resolution.service.test.ts
npm run lint
```

Changing Telegram/WhatsApp:

```powershell
npm run test -- tests/webhook-ingestion.service.test.ts
npm run test -- tests/telegram.service.test.ts
npm run test -- tests/whatsapp-webhook.route.test.ts
npm run lint
```

Changing onboarding:

```powershell
npm run test -- tests/onboarding.service.test.ts
npm run test -- tests/school-setup.service.test.ts
npm run lint
```

Changing students/charges:

```powershell
npm run test -- tests/students.service.test.ts
npm run test -- tests/charges.service.test.ts
npm run lint
```

Changing Prisma schema:

```powershell
npm run db:generate
npm run test
npm run lint
```

Changing UI pages/components:

```powershell
npm run lint
```

If behavior depends on server actions or services, also run the relevant service tests.

## Missing Coverage To Call Out

- No dedicated `backoffice-master.service.test.ts` currently appears in the test list.
- UI visual regression is not automated; visual checks need browser/manual review.
- Production webhook/OCR validation requires live evidence from `docs/validar.md`, not only unit tests.

## Ejecucion en VPS productivo

Comando oficial para correr la suite sin modificar el contenedor productivo:

```bash
cd /opt/CobroFutbol
docker compose -f docker-compose.test.yml run --rm test
```

Notas:

- No usar `npm test` directamente en el host del VPS, porque el host no necesariamente tiene Node/npm instalados.
- No copiar `tests/` manualmente a `cobrofutbol-app-1`; eso solo fue una validacion puntual durante la migracion.
- El servicio `test` usa el target Docker `test-runner`, que incluye `tests/`, `vitest.config.ts`, `src/`, `prisma/` y genera Prisma Client antes de ejecutar Vitest.
- La imagen runtime productiva sigue sin incluir tests para mantener el contenedor de app liviano.

Ultima validacion en VPS nuevo `45.236.90.21`: `15` archivos de test pasados, `54` tests pasados.
