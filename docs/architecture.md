# Arquitectura CobroFutbol

## Estructura del repositorio

```text
.
|-- prisma/
|-- src/app/
|-- src/components/
|-- src/server/
|-- tests/
|-- Dockerfile
`-- docker-compose.yml
```

## Capas principales

- `School` es el tenant raiz y toda entidad operacional queda acotada por `schoolId`.
- Next.js aloja frontend, API REST y webhooks en un solo deploy.
- BullMQ desacopla recepcion y procesamiento de comprobantes.
- Prisma concentra acceso a datos y consistencia transaccional.
- La revision manual opera sobre `ReviewTask` y sugerencias persistidas.

## Servicios del dominio

- `ocr.service.ts`: OCR con fallback heuristico.
- `extraction.service.ts`: extrae monto, fecha, remitente, banco y referencia.
- `matching.service.ts`: calcula score contra deuda pendiente.
- `reconciliation.service.ts`: auto-concilia o deriva a revision manual.
- `messaging.service.ts`: registra y envia respuestas salientes.
