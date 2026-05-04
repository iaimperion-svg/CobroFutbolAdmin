# Codex Context

## Operacion remota

- El proyecto se opera habitualmente en un VPS y no solo en entorno local.
- Salvo que el usuario indique lo contrario, los cambios, builds, reinicios y verificaciones deben hacerse directamente en el VPS nuevo `app.cobrofutbol.cl`.
- Para revisar la app interna no asumir `localhost`; usar la URL productiva `https://app.cobrofutbol.cl`.
- La entrada base del backoffice interno es `https://app.cobrofutbol.cl/backoffice`.
- El acceso al VPS puede requerir credenciales externas, pero ya se valido conectividad SSH y acceso remoto en una sesion de trabajo.
- Si en un hilo futuro hace falta revisar el servidor real, conviene partir por este archivo y por `docs/codex-secrets.local.md`.

## VPS principal nuevo

- Hostname: `app.cobrofutbol.cl`
- IP publica: `45.236.90.21`
- VPSID: `3959`
- URL app principal reportada por el usuario: `https://app.cobrofutbol.cl/backoffice/onboarding`
- URL de provision inicial reportada por el usuario: `https://1.vz.zgh.cl:4083`
- URL alternativa reportada por el usuario: `http://1.vz.zgh.cl:4082`
- Deploy productivo encontrado en el servidor: `/opt/CobroFutbol`
- Archivo de entorno productivo encontrado en el servidor: `/opt/CobroFutbol/.env.production`

## VPS anterior

- IP historica antes de la migracion: `38.7.199.232`.
- Usar solo para auditoria o recuperacion puntual; la operacion actual va contra `45.236.90.21`.

## Backoffice onboarding

- La pantalla de `Clave interna` en `/backoffice/onboarding` valida contra la variable `ONBOARDING_REVIEW_SECRET`.
- La validacion ocurre en `src/server/auth/onboarding-review.ts`.
- En este repo existe una clave local de desarrollo y no necesariamente coincide con produccion.
- La clave real de produccion y otras credenciales operativas quedaron guardadas solo en `docs/codex-secrets.local.md`.

## Precios CobroFutbol

- Plan Semillero: `$29.990` mensual, hasta 40 alumnos activos.
- Plan Academia: `$59.990` mensual, de 41 a 120 alumnos activos.
- Plan Club Pro: `$89.990` mensual, desde 121 alumnos activos.
- Setup / onboarding personalizado: `$39.990` pago unico.

## Datos de transferencia CobroFutbol

- Titular: `Vanessa Alejandra Espinoza Vilo`.
- RUT: `13604642K`.
- Banco: `Mercado Pago`.
- Tipo de cuenta: `Cuenta Vista`.
- Numero de cuenta: `1024747540`.
- Correo de pago: `pagos@cobrofutbol.cl`.

## Manejo de secretos

- No guardar passwords reales, claves VPS, VNC ni secretos productivos en archivos versionados.
- Si hace falta persistir secretos solo para uso local, usar el archivo ignorado `docs/codex-secrets.local.md`.
- Ese archivo esta ignorado por git para reducir el riesgo de exponer credenciales.

## Cierre del dia 23 de abril de 2026

- Se configuro `MAUROP FC` en produccion con correo operativo y cuenta bancaria reales.
- El usuario de acceso al portal validado para esa operacion fue `ia.imperion@gmail.com`.
- El webhook de Telegram quedo apuntando a la ruta generica `/api/v1/webhooks/telegram` para resolver escuela por cuenta destino.
- Se corrigio la extraccion de comprobantes Tapp para priorizar la cuenta destino correcta.
- Ya se puede crear mas de un alumno con el mismo apoderado principal reutilizando el contacto existente.
- Se implemento conciliacion familiar general para pagos de `2` o mas hermanos bajo un mismo apoderado.
- Se genero horizonte de mensualidades futuras por alumno para soportar pagos multi-mes de forma mas real.
- El caso real validado hoy fue `5 meses Gabriel + 5 meses Mateo = 1000 pesos`, conciliado automaticamente en produccion.
- El bot ahora explica mejor cuando aplica un pago a varias mensualidades del mismo grupo familiar.
- La UI del detalle de comprobantes ahora muestra la aplicacion del pago por alumno y por periodos.
- La hoja de avance del proyecto se actualizo a `81%` general en `src/app/backoffice/onboarding/proyecto/page.tsx`.

## Estado operativo al cerrar hoy

- Ingreso / Representante: practicamente cerrado y operativo.
- Kapitan / Mensualidades: ya validado en una escuela real con cuenta destino y pago familiar.
- Panel de escuela: operativo con setup bancario y visualizacion de aplicacion del pago.
- Backoffice maestro global: sigue pendiente como frente aparte.

## Cierre del dia 30 de abril de 2026

- Se implemento y desplego en produccion la pregunta de pagador para comprobantes con escuela y monto detectados, pero sin identidad confiable del pagador.
- El flujo usa `ReceiptResolutionPromptType.SELECT_PAYER` y confirma contra grupos familiares cuyos saldos abiertos suman el monto del comprobante; no hay regla fija para 2, 3 o N alumnos.
- Se reconstruyeron las imagenes productivas `app` y `worker` con `docker-compose.prod.yml`; reiniciar solo no bastaba porque produccion no monta el codigo fuente del host.
- Caso real validado: `Academia 3 palitos`, comprobante `cmokv3nyv0005oy0jl5cm8hlj` por `$90.000`.
- El pago quedo `AUTO_RECONCILED`, `Payment.RECONCILED`, `Reconciliation.AUTO_CONFIRMED`, estrategia `payer_identified_household_distribution`.
- Allocations aplicadas: `diego`, `maxi` y `pedro`, periodo `2026-04`, `$30.000` cada uno, saldo `0`, estado `PAID`.
- La escuela quedo sin casos abiertos ni prompts pendientes tras la conciliacion.
- Se creo `docs/validar.md` como plan operativo: cuando el usuario diga `validar`, ejecutar esa matriz de pruebas y reportar evidencia, no solo afirmaciones.
- Se ejecuto `validar` en VPS con evidencia real: contenedores arriba, `SELECT_PAYER` desplegado en `app` y `worker`, lint/TypeScript OK, tests de OCR/webhook/resolucion de escuela/reconciliacion/backoffice OK, DB del caso `3 palitos` sin revisiones ni prompts abiertos.
- Se bloqueo la UI de revision para comprobantes ya conciliados o aprobados, evitando acciones manuales sobre pagos cerrados.
- La hoja de avance del proyecto se actualizo a `95%` general en `src/app/backoffice/onboarding/proyecto/page.tsx`.
- Tras instalar el set base de 10 Agent Skills local y en VPS, la hoja de avance del proyecto se actualizo a `96%` general.

## Skills operativas instaladas

- Se implemento un set base de Agent Skills del proyecto en `.agents/skills`.
- El mismo set quedo copiado y verificado en produccion en `/opt/CobroFutbol/.agents/skills`.
- Estas skills son runbooks/contexto operativo para agentes compatibles; no cambian runtime, app, base de datos ni contenedores.
- No contienen secretos reales. Las credenciales siguen solo en `docs/codex-secrets.local.md`.
- Skills instaladas:
  - `cobrofutbol-produccion`: operacion segura del VPS, deploy, servicios y secretos.
  - `cobrofutbol-validar`: matriz de validacion con evidencia de produccion.
  - `kapitan-conciliacion`: OCR, matching, prompts, pagos familiares, parciales, excedentes y allocations.
  - `cobrofutbol-onboarding`: alta, bot de onboarding, pago de setup, revision, aprobacion y activacion.
  - `backoffice-maestro-finanzas`: maestro global, caja CobroFutbol, MRR/ARR esperado y separacion de plata plataforma vs escuela.
  - `telegram-whatsapp-webhooks`: rutas webhook, firmas, mensajes, prompts por chat y respuestas salientes.
  - `cobrofutbol-datos-prisma`: schema, seeds, enums, migraciones y seguridad de DB.
  - `cobrofutbol-operacion-diaria`: pauta diaria de revision operativa.
  - `cobrofutbol-testing`: mapa de tests por modulo.
  - `cobrofutbol-ui-app`: frontend, portal, backoffice, CSS, estados visuales y acciones bloqueadas.

## Punto de partida para manana

- Resolver el bloqueo DNS publico de `app.cobrofutbol.cl`: `ns1`, `ns2` y `ns3` responden `45.236.90.21`, pero `ns4.zglobalhost.com` debe sincronizarse porque aun puede responder la IP historica.
- Crear y registrar la primera mensualidad CobroFutbol real de una escuela desde el maestro.
- Agregar test automatizado especifico para `receipt-resolution.service` y resolucion de prompts `SELECT_PAYER`.
- Ejecutar pruebas reales de pago parcial, excedente y comprobante ambiguo usando `docs/validar.md`.
- Usar `cobrofutbol-operacion-diaria` para revisar alertas, ingresos, pagos CF y clientes pendientes.

## Cierre del dia 4 de mayo de 2026

- Se integro `/backoffice/onboarding` al shell del backoffice maestro con `MasterSidebar`, dejando menu lateral, navegacion interna y salida unificadas.
- Se ajusto el contraste visual del onboarding interno para que los textos, tarjetas, inputs y tablas sean legibles sobre el layout claro del maestro.
- Se desplego el cambio en el VPS nuevo `45.236.90.21`, ruta productiva `/opt/CobroFutbol`, reconstruyendo la imagen `app`.
- Git local, GitHub y VPS quedaron sincronizados en branch `prod`, commit `b4946fb Add backoffice onboarding sidebar`.
- La app responde internamente en Docker y el contenedor `cobrofutbol-app-1` quedo arriba; el problema de carga publica se identifico como DNS desincronizado en `ns4.zglobalhost.com`, no como app caida.
- La hoja de avance del proyecto se actualizo a `97%` general en `src/app/backoffice/maestro/proyecto/page.tsx`.

## Pendientes backoffice maestro para manana

- Implementar mensualidad real de CobroFutbol: registrar si cada escuela pago su mensualidad a CobroFutbol, no solo MRR/ARR esperado por plan.
- Modelar una caja interna CobroFutbol separada de la plata que la escuela cobra a apoderados.
- Crear historial mensual tipo `PlatformInvoice` / `PlatformPayment`: cobrado, pendiente, vencido, fecha, comprobante y estado.
- Hacer el detalle de escuela mas accionable: seguimiento, contacto, resolver bloqueo y nota interna.
- Revisar visualmente el maestro en produccion y ajustar fino contraste, altura de filas, secciones y responsive.
- Validar flujos reales de pago parcial, pago ambiguo, excedente, varios meses y varios alumnos.
- Crear cobertura automatizada para respuesta de prompts de resolucion de comprobantes, especialmente `SELECT_PAYER`.
- La mini guia operativa diaria ya quedo documentada como skill `cobrofutbol-operacion-diaria`.
- Prioridad sugerida: partir por la mensualidad real de CobroFutbol, porque convierte el backoffice en control financiero operativo.

## Regla operativa persistente

- Si se implementa algo para operacion real, aplicar la modificacion en `/opt/CobroFutbol`.
- Si se documenta un acceso interno, priorizar siempre la URL productiva del VPS por sobre rutas locales.
- Solo usar entorno local cuando el usuario lo pida explicitamente.
