---
name: cobrofutbol-produccion
description: Operate CobroFutbol production safely. Use when working on deploys, VPS checks, production debugging, Docker services, environment handling, backoffice URLs, remote validation, or any task that mentions produccion, VPS, Cloud Run, app.cobrofutbol.cl, /opt/CobroFutbol, deploy, rebuild, worker, postgres, redis, caddy, or secrets.
---

# CobroFutbol Produccion

Use this skill to orient production work before running commands or making operational claims.

## First Principles

- Treat CobroFutbol as a real production SaaS, not a local-only app.
- Default to the production VPS when the user asks for operational validation, deploy, production debugging, or real app behavior.
- Do not assume `localhost` for internal app checks. Prefer `https://app.cobrofutbol.cl`.
- Do not expose secrets in responses, files, commits, logs, screenshots, or skill content.
- Do not copy values from `docs/codex-secrets.local.md` into generated files or chat unless the user explicitly asks for a secret handling task and it is safe to reference indirectly.

## Required Context

Read [references/production-ops.md](references/production-ops.md) before production operations, deployments, or remote validation.

If the task needs the latest project state, also read:

- `docs/codex-context.md`
- `docs/continuar.md`
- `README.md`

Read `docs/codex-secrets.local.md` only when credentials are required to perform a user-requested operation. Never summarize or persist its secret values.

## Production Workflow

1. Confirm the user's task is operational or production-facing.
2. Read the required context above.
3. Identify whether the task is read-only, code-changing, deployment, data-changing, or destructive.
4. For read-only checks, gather evidence from the VPS, Docker services, logs, database, or production URL as appropriate.
5. For code changes intended for production, modify the appropriate source, then rebuild production images. A container restart alone is not enough when production runs built images.
6. For destructive operations, database cleanup, or credential changes, stop and request explicit confirmation.
7. Report evidence, not impressions. Include command outcomes, service status, URLs, relevant IDs, test names, and remaining risks.

## Gotchas

- Production deploy path is `/opt/CobroFutbol`.
- The app uses separate web and worker runtimes; validate both when changing receipt processing, OCR, reconciliation, prompts, queues, or webhooks.
- Production image rebuilds matter because production does not simply mount the local source tree.
- `docs/codex-secrets.local.md` is intentionally ignored by git and must stay local-only.
- Telegram webhook behavior may be production-specific; avoid assuming a fixed `schoolSlug`.
- Bank-account-based school resolution must not silently pick the wrong school when ambiguous.

## Output Expectations

When reporting production work, include:

- The environment checked.
- The production path or URL used.
- The services touched or inspected.
- Evidence gathered.
- Whether app and worker are running the expected code.
- Any commands that were not run and why.
