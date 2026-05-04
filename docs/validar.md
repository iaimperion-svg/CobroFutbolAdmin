# Plan de Validacion CobroFutbol

Este documento define el plan que Codex debe ejecutar cuando el usuario diga: **validar**.

Objetivo: comprobar con evidencia que OCR, webhooks, resolucion de escuela, conciliacion, prompts conversacionales, app, worker y backoffice estan operando correctamente en produccion antes de declarar el modulo listo.

Regla principal: no responder "ok" sin mostrar evidencia concreta. Cada punto debe quedar como `PASO`, `FALLO` o `NO EJECUTADO`, con el dato observado.

## Alcance

- VPS productivo: `/opt/CobroFutbol`.
- URL interna: `https://app.cobrofutbol.cl`.
- Backoffice: `https://app.cobrofutbol.cl/backoffice`.
- Servicios: `app`, `worker`, `postgres`, `redis`, `caddy`.
- Base de datos productiva Postgres del stack Docker.

## Precheck Obligatorio

1. Confirmar contenedores arriba.
   - Comando:
     ```bash
     cd /opt/CobroFutbol
     docker compose -f docker-compose.prod.yml ps
     ```
   - Esperado: `app`, `worker`, `postgres`, `redis`, `caddy` en `Up`.

2. Confirmar que app responde.
   - Comando:
     ```bash
     curl -sS -I https://app.cobrofutbol.cl/backoffice/maestro
     ```
   - Esperado: `200`, `302` o `307` hacia login/onboarding interno, sin `500`.

3. Confirmar que el worker tiene el codigo actual, no imagen vieja.
   - Comando:
     ```bash
     docker exec cobrofutbol-worker-1 sh -lc "grep -n 'SELECT_PAYER\|createPayerSelectionPrompt' /app/src/server/services/reconciliation.service.ts /app/src/server/services/receipt-resolution.service.ts /app/prisma/schema.prisma"
     ```
   - Esperado: aparecen `SELECT_PAYER` y `createPayerSelectionPrompt`.

4. Confirmar enum en Postgres.
   - Comando:
     ```bash
     cd /opt/CobroFutbol
     docker compose -f docker-compose.prod.yml exec -T postgres psql -U postgres -d cobrofutbol -c "select enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='ReceiptResolutionPromptType' order by enumsortorder;"
     ```
   - Esperado: incluye `SELECT_PAYER`, `SELECT_STUDENT`, `SELECT_PERIOD`, `CONFIRM_PARTIAL_PAYMENT`, `CONFIRM_OVERPAYMENT`.

## Test Cases Funcionales

### TC-01 OCR Basico

Probar que un comprobante legible extrae:

- monto,
- fecha,
- referencia,
- banco,
- texto OCR,
- confianza.

Evidencia DB:

```sql
select id, status, "extractedAmountCents", "extractedPaidAt", "extractedSenderName",
       "extractedReference", "extractedBankName", "extractionConfidence",
       "receivedAt", "processedAt"
from "Receipt"
order by "receivedAt" desc
limit 5;
```

Esperado:

- `extractedAmountCents` no nulo.
- `extractionConfidence` razonable.
- `processedAt` no nulo.
- Si falla OCR, estado debe explicar fallo y no quedar silencioso.

### TC-02 Resolucion De Escuela Por Cuenta Destino

Enviar comprobante sin `schoolSlug`, pero con cuenta destino de una escuela.

Esperado:

- webhook acepta el comprobante,
- `Receipt.schoolId` corresponde a la escuela correcta,
- no queda asociado a `academia-demo` por defecto.

Evidencia:

```sql
select r.id, s.name, s.slug, r.status, r."extractedAmountCents",
       r."extractedText", r."receivedAt"
from "Receipt" r
join "School" s on s.id = r."schoolId"
order by r."receivedAt" desc
limit 5;
```

### TC-03 Cuenta Destino Ambigua

Validar que si dos escuelas tienen una cuenta destino compatible, el sistema no asigna al azar.

Esperado:

- no autoasignar escuela,
- responder al chat que no se pudo identificar escuela,
- registrar log claro.

Evidencia:

- logs de `app` o `worker`,
- ausencia de `Receipt` mal asignado.

### TC-04 Pago Exacto De Un Alumno

Enviar comprobante cuyo monto y señales calzan con una mensualidad de un alumno.

Esperado:

- `Receipt.status = AUTO_RECONCILED`,
- `Payment.status = RECONCILED`,
- `Reconciliation.status = AUTO_CONFIRMED`,
- `Charge.outstandingCents = 0`,
- respuesta al chat confirmando validacion.

Consultas:

```sql
select r.id, r.status, p.status as payment_status, rec.status as reconciliation_status,
       rec.strategy, rec."matchScore"
from "Receipt" r
left join "Payment" p on p."receiptId" = r.id
left join "Reconciliation" rec on rec."receiptId" = r.id
order by r."receivedAt" desc
limit 5;
```

### TC-05 Pago Familiar Exacto Con N Alumnos

Caso critico general: un mismo apoderado puede tener `2`, `3`, `4` o `N` alumnos, o puede pagar `N` mensualidades combinadas entre alumnos y periodos. El sistema no debe tener una regla especial para `3 hermanos`; debe resolver por suma de saldos pendientes y grupo familiar.

Caso de regresion actual: `Academia 3 palitos`, apoderado `juan`, alumnos `pedro`, `diego`, `maxi`, cada uno con mensualidad de `$30.000`, comprobante por `$90.000`. Este caso representa `N = 3`, pero el criterio real es variable.

Esperado si el comprobante identifica bien al apoderado/alumnos:

- propone aplicar a las `N` mensualidades detectadas, o
- concilia automaticamente si las señales son suficientes.

Esperado si el comprobante no identifica pagador:

- NO debe ir directo a revision manual.
- Debe crear `ReceiptResolutionPrompt.type = SELECT_PAYER`.
- Debe enviar mensaje preguntando por pagador/opcion.

Evidencia:

```sql
select r.id, r.status, r."extractedAmountCents", r."extractedSenderName",
       p.type as prompt_type, p.status as prompt_status, p."questionText"
from "Receipt" r
left join "ReceiptResolutionPrompt" p on p."receiptId" = r.id
join "School" s on s.id = r."schoolId"
where s.slug = 'academia-3-palitos'
order by r."receivedAt" desc
limit 5;
```

Al responder `juan` o el numero correcto:

```sql
select r.id, r.status, p.status as payment_status, rec.status as reconciliation_status,
       rec.strategy
from "Receipt" r
left join "Payment" p on p."receiptId" = r.id
left join "Reconciliation" rec on rec."receiptId" = r.id
join "School" s on s.id = r."schoolId"
where s.slug = 'academia-3-palitos'
order by r."receivedAt" desc
limit 5;
```

Esperado final:

- `Receipt.status = AUTO_RECONCILED`,
- `Payment.status = RECONCILED`,
- `Reconciliation.strategy = payer_identified_household_distribution`,
- cargos incluidos en el grupo familiar quedan pagados o parcialmente pagados segun el monto aplicado.

### TC-06 Pago Parcial

Enviar comprobante por menos que la mensualidad pendiente.

Esperado:

- Kapitan pregunta si corresponde a abono parcial,
- si el pagador confirma, aplica monto parcial,
- cargo queda `PARTIALLY_PAID` u `OVERDUE` con saldo actualizado.

### TC-07 Excedente O Varios Meses

Enviar comprobante mayor a una mensualidad pero compatible con varias mensualidades del mismo alumno o grupo familiar.

Esperado:

- Kapitan pregunta confirmacion de aplicacion a mensualidades mas antiguas,
- tras confirmacion, crea allocations por cada cargo,
- respuesta al chat describe cantidad de mensualidades/alumnos.

### TC-08 Candidato Ambiguo

Enviar comprobante donde dos alumnos o cargos compiten con confianza similar.

Esperado:

- no auto conciliacion insegura,
- prompt `SELECT_STUDENT` o `SELECT_PERIOD`,
- respuesta invalida genera mensaje solicitando numero correcto,
- expiracion deja revision manual.

### TC-09 Webhook Telegram

Validar:

- webhook configurado en Telegram apunta a `/api/v1/webhooks/telegram`,
- no usa `schoolSlug` fijo,
- mensaje con imagen crea `Message` y `Receipt`,
- worker toma job.

Evidencia:

```bash
docker logs cobrofutbol-app-1 --since 15m
docker logs cobrofutbol-worker-1 --since 15m
```

Buscar:

- `queued receipt for processing`,
- `picked job`,
- `extraction finished`,
- `processing completed`.

### TC-10 Webhook WhatsApp

Si WhatsApp esta configurado:

- validar verify token,
- validar recepcion de imagen o payload,
- validar creacion de `Message` y `Receipt`,
- validar respuesta saliente.

Si no esta operativo, marcar `NO EJECUTADO` con razon.

### TC-11 Backoffice Casos Abiertos

Despues de cada prueba:

- revisar que casos que deben conciliar no queden abiertos,
- revisar que casos ambiguos si queden abiertos o esperando respuesta.

Consulta:

```sql
select s.slug, rt.id, rt.status, rt.reason, rt."receiptId", rt."createdAt"
from "ReviewTask" rt
join "School" s on s.id = rt."schoolId"
where rt.status in ('OPEN', 'IN_PROGRESS')
order by rt."createdAt" desc;
```

### TC-12 Limpieza De Pruebas

Antes de repetir pruebas, limpiar solo recibos de prueba, sin tocar alumnos/cargos salvo que el test lo requiera.

Debe eliminar:

- `ReviewTask`,
- `ReceiptResolutionPrompt`,
- `ReceiptCandidateMatch`,
- `ReconciliationAllocation`,
- `Reconciliation`,
- `Payment`,
- `Receipt`.

No eliminar:

- `School`,
- `Student`,
- `Guardian`,
- `Charge`,
- `BankAccount`.

## Tests Automatizados A Ejecutar

Cuando se diga **validar**, correr al menos:

```bash
cd /opt/CobroFutbol
docker compose -f docker-compose.prod.yml exec -T app npm run lint
docker compose -f docker-compose.prod.yml exec -T app npm run test -- tests/extraction.service.test.ts
docker compose -f docker-compose.prod.yml exec -T app npm run test -- tests/webhook-ingestion.service.test.ts
docker compose -f docker-compose.prod.yml exec -T app npm run test -- tests/school-resolution.service.test.ts
docker compose -f docker-compose.prod.yml exec -T app npm run test -- tests/reconciliation.service.test.ts
docker compose -f docker-compose.prod.yml exec -T app npm run test -- tests/receipt-resolution.service.test.ts
```

Si algun archivo de test no existe, marcarlo como `NO EJECUTADO` y recomendar crearlo. No reemplazarlo por una afirmacion generica.

## Evidencia Minima Del Resultado

La respuesta final de Codex debe incluir:

- fecha/hora de validacion,
- commit/estado git relevante,
- contenedores arriba,
- resultado de TypeScript,
- resultado de cada test automatizado,
- resultado de cada test manual ejecutado,
- IDs de receipts/prompts/reconciliations usados,
- logs clave del worker,
- pendientes o fallas encontradas.

## Criterio Para Decir 100%

El modulo OCR/webhook/conciliacion solo puede considerarse `100% validado` si:

- OCR extrae monto/referencia/texto en casos reales y de prueba.
- Escuela se resuelve por cuenta destino sin `schoolSlug`.
- No hay asignacion silenciosa cuando la cuenta es ambigua.
- Pago exacto de un alumno concilia.
- Pago familiar de `N` alumnos o `N` mensualidades concilia o pregunta pagador correctamente, sin reglas fijas para una cantidad especifica.
- Pago parcial pregunta y aplica correctamente.
- Excedente o varios meses pregunta y aplica correctamente.
- Webhook Telegram procesa imagen real de punta a punta.
- WhatsApp queda validado o declarado fuera de alcance con razon.
- Backoffice refleja estados reales.
- No quedan casos abiertos inesperados.
- Los contenedores productivos ejecutan la imagen reconstruida con el codigo actual.

Si cualquiera de esos puntos falla, el modulo no esta al 100%.
