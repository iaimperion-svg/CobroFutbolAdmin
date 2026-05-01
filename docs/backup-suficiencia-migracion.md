# Suficiencia del backup para migrar CobroFutbol

Ultima actualizacion: 2026-05-01.

## Resumen

El backup generado por `ops/backup-production.sh` deberia ser suficiente para montar CobroFutbol en otro VPS, siempre que se copie fuera del VPS actual y se pruebe una restauracion.

## Que incluye el backup

El paquete de respaldo contempla las piezas criticas del sistema:

- Base de datos Postgres:
  - `postgres.dump`
  - `postgres.sql.gz`
- Codigo y configuracion del proyecto:
  - `project.tar.gz`
- Variables de entorno y secretos locales incluidos en el snapshot del proyecto:
  - `.env`
  - `.env.production`
  - otros archivos operativos locales que existan en `/opt/CobroFutbol`
- Configuracion de Caddy:
  - `deploy/Caddyfile`
- Skills y documentacion operativa:
  - `.agents/`
  - `docs/`
- Storage persistente:
  - `volumes-storage.tar.gz`
- Redis:
  - `volumes-redis.tar.gz`
- Datos/config de Caddy:
  - `volumes-caddy-data.tar.gz`
  - `volumes-caddy-config.tar.gz`
- Inventario operativo:
  - `docker-ps.txt`
  - `docker-compose-ls.txt`
  - `docker-compose-config.yml`
  - `docker-system-df.txt`
  - `df-h.txt`
  - `free-h.txt`
  - `docker-inspect.json`
- Integridad:
  - `sha256sums.txt`
  - `MANIFEST.txt`

## Condiciones para que sea suficiente

### 1. Copiar el backup fuera del VPS actual

Si el respaldo queda solo en `/opt/backups/cobrofutbol`, no protege contra perdida total del VPS.

Ejemplo desde una maquina externa:

```bash
scp -r root@38.7.199.232:/opt/backups/cobrofutbol/<timestamp> ./cobrofutbol-backup-<timestamp>
```

### 2. Verificar integridad

En la carpeta del backup:

```bash
sha256sum -c sha256sums.txt
```

### 3. Probar restauracion

Solo se puede declarar el backup como 100% suficiente despues de restaurarlo en un VPS nuevo o entorno de prueba y confirmar que la aplicacion responde.

Validacion minima tras restaurar:

```bash
cd /opt/CobroFutbol
docker compose -f docker-compose.prod.yml ps
curl -k -i https://app.cobrofutbol.cl/api/v1/health
```

## Lo que no viaja automaticamente en el backup

Aunque el backup contiene la app y sus datos, hay elementos externos que se deben configurar manualmente en el VPS nuevo:

- DNS de `app.cobrofutbol.cl`.
- Webhooks de Telegram/WhatsApp si apuntan a URLs publicas.
- Firewall y puertos:
  - `22` SSH
  - `80` HTTP
  - `443` HTTPS
- Docker y Docker Compose instalados en el nuevo VPS.
- Acceso SSH/usuarios/llaves del nuevo servidor.
- Eventuales reglas del proveedor cloud/VPS.

## Recomendacion operativa

El backup es suficiente como paquete tecnico, pero el siguiente paso sano es hacer un ensayo de restauracion en un VPS nuevo antes del corte real.

Flujo recomendado:

1. Generar backup en VPS actual.
2. Verificar checksums.
3. Copiar backup fuera del VPS actual.
4. Preparar VPS nuevo con Docker/Compose.
5. Restaurar proyecto, volumenes y base de datos.
6. Levantar stack.
7. Validar health, backoffice, worker, Postgres y Redis.
8. Reconfigurar DNS/webhooks solo cuando el VPS nuevo este validado.
9. Mantener VPS viejo encendido como rollback temporal.

## Veredicto

Con el contenido actual del backup, CobroFutbol deberia poder montarse en otro VPS. La unica advertencia es que la suficiencia final debe comprobarse con una restauracion real o ensayo controlado.
