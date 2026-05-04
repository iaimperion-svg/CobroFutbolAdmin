# Continuar CobroFutbol

Ultima actualizacion: 4 de mayo de 2026.

## Regla operativa

- Trabajar contra el VPS, no asumir entorno local.
- VPS: `app.cobrofutbol.cl` / `45.236.90.21`.
- Deploy productivo: `/opt/CobroFutbol`.
- Para conectarse usar Paramiko y las credenciales locales ignoradas en `docs/codex-secrets.local.md`.
- Si se modifica codigo productivo, reconstruir con `docker compose -f docker-compose.prod.yml up -d --build ...`; reiniciar solo no basta porque produccion usa imagenes.

## Estado actual

- Proyecto actualizado a `97%` en `/backoffice/onboarding/proyecto` y `/backoffice/maestro/proyecto`.
- Backoffice onboarding integrado al menu lateral del maestro y desplegado en el VPS nuevo.
- Git local, GitHub y VPS sincronizados en branch `prod`, commit `b4946fb Add backoffice onboarding sidebar`.
- App productiva arriba internamente; bloqueo publico actual: DNS desincronizado, porque `ns4.zglobalhost.com` debe responder `45.236.90.21` para `app.cobrofutbol.cl`.
- `docs/validar.md` existe y debe ejecutarse cuando el usuario diga `validar`.
- Set base de 10 Agent Skills instalado localmente en `.agents/skills` y en el VPS en `/opt/CobroFutbol/.agents/skills`.
- Las skills son contexto/runbooks para agentes compatibles; no modifican runtime, app, DB ni contenedores.
- Skills disponibles:
  - `cobrofutbol-produccion`
  - `cobrofutbol-validar`
  - `kapitan-conciliacion`
  - `cobrofutbol-onboarding`
  - `backoffice-maestro-finanzas`
  - `telegram-whatsapp-webhooks`
  - `cobrofutbol-datos-prisma`
  - `cobrofutbol-operacion-diaria`
  - `cobrofutbol-testing`
  - `cobrofutbol-ui-app`
- Caso productivo validado: `Academia 3 palitos`.
- Recibo `cmokv3nyv0005oy0jl5cm8hlj` por `$90.000` quedo `AUTO_RECONCILED`.
- Pago `cmokvaroq0009oy0jpzc0cn0p` quedo `RECONCILED`.
- Reconciliacion `cmokvarpe000boy0jy7ns5wad` quedo `AUTO_CONFIRMED`.
- Estrategia usada: `payer_identified_household_distribution`.
- Se aplicaron `$30.000` a `pedro`, `diego` y `maxi`, periodo `2026-04`, saldo `0`, estado `PAID`.
- No quedaron revisiones ni prompts abiertos para `Academia 3 palitos`.
- La UI de detalle de comprobante bloquea acciones cuando el pago ya esta conciliado/aprobado.

## Lo que sigue recomendado

1. Corregir DNS publico de `app.cobrofutbol.cl`.
   - Solicitar a ZGlobalHost sincronizar `ns4.zglobalhost.com`.
   - El registro A correcto es `app.cobrofutbol.cl -> 45.236.90.21`.
   - No tocar registros de mail, cPanel, DKIM, SPF ni el A raiz `cobrofutbol.cl`.
   - Validar que `ns1`, `ns2`, `ns3` y `ns4` respondan todos `45.236.90.21`.

2. Agregar test automatizado para `receipt-resolution.service`.
   - Cubrir respuesta de prompt `SELECT_PAYER`.
   - Verificar que una opcion de pagador valida cree pago/reconciliacion/asignaciones.
   - Verificar que la opcion de rechazo o no identificacion mande a revision manual.
   - Repetir `validar` despues.

3. Ejecutar pruebas reales de casos raros de Kapitan.
   - Pago parcial.
   - Pago con excedente.
   - Comprobante ambiguo.
   - Varios meses para un alumno.
   - Varios alumnos y varios meses.
   - Confirmar que cada caso aparece bien en chat, DB y UI.

4. Implementar/validar mensualidad real CobroFutbol desde el maestro.
   - Registrar invoice mensual por escuela.
   - Registrar pago real recibido por CobroFutbol.
   - Separar caja CobroFutbol de la plata que la escuela cobra a apoderados.
   - Verificar estados: pendiente, vencido, pagado.

5. Usar la pauta operativa diaria ya creada.
   - Skill: `cobrofutbol-operacion-diaria`.
   - Revisar salud tecnica, maestro, Kapitan, onboarding y caja CobroFutbol.
   - Reportar siempre con evidencia, pendientes y bloqueos.

## Comando mental para el proximo hilo

Si el usuario dice "sigamos", partir por el punto 1: resolver/validar DNS publico de `app.cobrofutbol.cl`, salvo que indique otra prioridad. Usar las skills del proyecto como contexto operativo antes de actuar.
