---
name: cobrofutbol-validar
description: Validate CobroFutbol end-to-end with concrete evidence. Use when the user says validar, validar produccion, revisar si esta listo, comprobar OCR, webhooks, conciliacion, Kapitan, prompts, backoffice, worker, tests, or asks for a readiness/100 percent validation of the current project.
---

# CobroFutbol Validar

Use this skill to execute or prepare the CobroFutbol validation matrix without hand-waving.

## Rule

Never answer "ok", "listo", or "validado" without evidence. Each validation item must be marked `PASO`, `FALLO`, or `NO EJECUTADO`, with the observed fact.

## Required Context

Read [references/validation-workflow.md](references/validation-workflow.md) before executing validation.

Then read the current source of truth:

- `docs/validar.md`
- `docs/codex-context.md`
- `docs/continuar.md`

Use `docs/codex-secrets.local.md` only if credentials are needed to connect to production. Do not expose secret values.

## Validation Workflow

1. Establish timestamp, repo state, and target environment.
2. Confirm production services are up: app, worker, postgres, redis, caddy.
3. Confirm the app responds at the production URL.
4. Confirm app and worker contain the expected code for the feature under validation.
5. Confirm Prisma/Postgres schema or enums needed by the feature are present.
6. Run the automated tests listed in `docs/validar.md` when available.
7. Execute manual or database-backed test cases from `docs/validar.md` when the user has asked for full validation.
8. Inspect worker/app logs for receipt processing, OCR, school resolution, prompts, and reconciliation evidence.
9. Verify no unexpected open review tasks or pending prompts remain after successful reconciliation cases.
10. Report every skipped item as `NO EJECUTADO` with the reason.

## Safety

- Do not delete production data unless the user explicitly authorizes the exact cleanup scope.
- If cleanup is needed, limit it to test receipts and dependent records described in `docs/validar.md`.
- Do not delete schools, students, guardians, charges, bank accounts, or real operational history.
- Do not claim 100 percent validation unless all criteria in `docs/validar.md` pass or are explicitly declared out of scope by the user.

## Evidence Template

Use this structure for the final report:

```markdown
## Resultado
- Fecha/hora:
- Entorno:
- Git/imagen:
- Veredicto:

## Precheck
- [PASO/FALLO/NO EJECUTADO] Contenedores:
- [PASO/FALLO/NO EJECUTADO] App:
- [PASO/FALLO/NO EJECUTADO] Worker/codigo:
- [PASO/FALLO/NO EJECUTADO] DB/schema:

## Tests Automatizados
- [PASO/FALLO/NO EJECUTADO] TypeScript:
- [PASO/FALLO/NO EJECUTADO] Tests:

## Casos Funcionales
- [PASO/FALLO/NO EJECUTADO] OCR:
- [PASO/FALLO/NO EJECUTADO] Escuela por cuenta destino:
- [PASO/FALLO/NO EJECUTADO] Pago exacto:
- [PASO/FALLO/NO EJECUTADO] Pago familiar:
- [PASO/FALLO/NO EJECUTADO] Pago parcial:
- [PASO/FALLO/NO EJECUTADO] Excedente/varios meses:
- [PASO/FALLO/NO EJECUTADO] Ambiguo/prompts:
- [PASO/FALLO/NO EJECUTADO] Backoffice:

## Evidencia
- Receipts/prompts/reconciliations:
- Logs clave:
- Consultas o salidas relevantes:

## Pendientes
- ...
```
