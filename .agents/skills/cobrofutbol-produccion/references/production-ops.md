# Production Operations Reference

## Production Target

- VPS host: `app.cobrofutbol.cl`.
- Public IP: `45.236.90.21`.
- Previous VPS host/IP: `vps-app.cobrofutbol.cl` / `38.7.199.232`. Treat it as historical only; do not operate on it unless the user explicitly asks for old-server recovery/audit.
- Production deploy path: `/opt/CobroFutbol`.
- Main internal URL: `https://app.cobrofutbol.cl`.
- Backoffice URL: `https://app.cobrofutbol.cl/backoffice`.
- Production stack file: `docker-compose.prod.yml`.

## Operational Defaults

- Use the VPS for real production checks unless the user explicitly asks for local-only work.
- Web and worker are separate runtime concerns. Validate both for changes involving webhooks, OCR, queues, reconciliation, prompts, or messaging.
- Rebuild production containers after code changes intended for production. Restarting existing containers is insufficient when code is baked into images.
- Prefer evidence from Docker status, production HTTP responses, logs, tests, and database queries.

## Secret Handling

- `docs/codex-secrets.local.md` may contain local-only operational credentials.
- Never copy secret values into skills, committed docs, generated reports, or chat.
- If a command requires credentials, use them only for the requested operation and report that credentials were used without printing them.

## Common Evidence Sources

- `docker compose -f docker-compose.prod.yml ps`
- `docker logs cobrofutbol-app-1 --since 15m`
- `docker logs cobrofutbol-worker-1 --since 15m`
- Production HTTP headers from `https://app.cobrofutbol.cl/backoffice` or the relevant route.
- Postgres queries through the production Docker stack.
- Automated tests run inside the app container when validating deployed behavior.

## Data Safety

- Treat production database contents as real customer/business data.
- Do not perform destructive cleanup unless the user explicitly approves the exact target.
- If test cleanup is approved, prefer deleting only receipt-related test records and dependent rows, preserving schools, students, guardians, charges, and bank accounts.
