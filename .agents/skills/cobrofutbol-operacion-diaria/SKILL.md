---
name: cobrofutbol-operacion-diaria
description: Run CobroFutbol's daily operations checklist. Use when the user asks what to review today, operacion diaria, revisar el negocio, estado diario, rutina, pendientes, alertas, casos abiertos, prompts pendientes, altas en curso, escuelas sin movimiento, caja CobroFutbol, or wants a lightweight daily production health report.
---

# CobroFutbol Operacion Diaria

Use this skill to run the daily operator rhythm for CobroFutbol.

## Required Context

Read [references/daily-runbook.md](references/daily-runbook.md) before producing or executing a daily operations checklist.

When live evidence is needed, also use:

- `cobrofutbol-produccion`
- `cobrofutbol-validar`
- `kapitan-conciliacion`
- `cobrofutbol-onboarding`
- `backoffice-maestro-finanzas`

Read current project notes if the user asks for priorities:

- `docs/continuar.md`
- `docs/codex-context.md`
- `docs/validar.md`

## Daily Workflow

1. Confirm whether the user wants a read-only report or actual fixes.
2. Start from production, not localhost, unless the user explicitly asks for local-only.
3. Check technical health: containers, app response, worker/log noise, queue symptoms.
4. Check backoffice maestro: schools needing attention, setup incomplete, reviews open, no recent movement.
5. Check Kapitan: recent receipts, pending prompts, manual reviews, failed receipts, unreconciled payments.
6. Check onboarding: open requests, setup receipts under review, approved-pending-activation, resend needs.
7. Check CobroFutbol money: onboarding revenue collected, expected MRR/ARR, missing real monthly platform payments if not yet modeled.
8. End with a short priority list: today, next, blocked.

## Rules

- Do not expose secrets from local docs or production env.
- Do not mutate production data in a daily check unless the user explicitly asks for the fix.
- Mark unknowns as unknown; do not infer production health from local files alone.
- Prefer evidence with timestamps, IDs, counts, and URLs.
- Keep platform money separate from school collection money.
- Escalate urgent issues first: app down, worker down, failed receipts, open prompts blocking real payments, school setup missing, approved onboarding not activated.

## Output Shape

Use this concise format for reports:

```markdown
## Estado Diario
- Fecha/hora:
- Entorno:
- Veredicto:

## Salud Tecnica
- App:
- Worker:
- DB/Redis:
- Logs:

## Operacion
- Escuelas con atencion:
- Revisiones abiertas:
- Prompts pendientes:
- Comprobantes fallidos:

## Ingresos
- Onboarding abierto:
- Aprobadas sin activar:
- Caja CobroFutbol:
- MRR/ARR esperado:

## Prioridades
1. ...
2. ...
3. ...
```

If no live checks were run, say so clearly and provide a planned checklist instead.
