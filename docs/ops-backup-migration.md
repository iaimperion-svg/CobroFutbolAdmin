# Operacion: backup y migracion VPS

Ultima actualizacion: 2026-05-01.

Este runbook prepara a CobroFutbol para respaldo, recuperacion y migracion a un VPS mas grande sin interferir con produccion.

## Objetivo

Respaldar de forma verificable:

- base de datos Postgres productiva,
- storage persistente de Docker,
- Redis si se decide conservar colas/estado temporal,
- configuracion de deploy,
- variables de entorno y secretos locales,
- Caddyfile y material operativo,
- codigo actual del VPS, incluyendo cambios no committeados,
- inventario Docker y estado del servidor.

## Principios de seguridad

- No detener servicios para el backup normal.
- No ejecutar `docker compose down` durante respaldo.
- No ejecutar `docker volume prune` como parte del proceso.
- No imprimir secretos en consola ni reportes.
- No copiar backups a terceros sin cifrado o canal seguro.
- Tratar `/opt/CobroFutbol/.env`, `.env.production` y `docs/codex-secrets.local.md` como material sensible.
- Si hay otro agente trabajando en front/deploy, coordinar antes de hacer un backup final de corte.

## Rutas importantes

- Proyecto: `/opt/CobroFutbol`
- Compose productivo: `/opt/CobroFutbol/docker-compose.prod.yml`
- Caddyfile: `/opt/CobroFutbol/deploy/Caddyfile`
- Backups sugeridos: `/opt/backups/cobrofutbol`
- Volumen Postgres: `cobrofutbol_postgres_data`
- Volumen Redis: `cobrofutbol_redis_data`
- Volumen storage: `cobrofutbol_storage_data`
- Volumen Caddy data: `cobrofutbol_caddy_data`
- Volumen Caddy config: `cobrofutbol_caddy_config`

## Preflight antes de respaldar

```bash
cd /opt/CobroFutbol
./ops/backup-production.sh --dry-run
```

Debe confirmar:

- Docker disponible.
- Proyecto Docker `cobrofutbol` corriendo.
- Contenedores `app`, `worker`, `postgres`, `redis`, `caddy` listados.
- Espacio disponible en disco.
- Uso actual de Docker.

## Backup operativo

```bash
cd /opt/CobroFutbol
./ops/backup-production.sh
```

El script genera una carpeta con timestamp bajo `/opt/backups/cobrofutbol`, por ejemplo:

```text
/opt/backups/cobrofutbol/20260501-001500/
```

Contenido esperado:

- `postgres.dump`: dump custom de Postgres para restaurar con `pg_restore`.
- `postgres.sql.gz`: dump SQL comprimido para inspeccion/portabilidad.
- `project.tar.gz`: snapshot del proyecto y archivos operativos, excluyendo `node_modules`, `.next`, `.git`, `storage` y caches pesadas.
- `volumes-storage.tar.gz`: respaldo del volumen de storage.
- `volumes-redis.tar.gz`: respaldo del volumen Redis.
- `volumes-caddy-data.tar.gz` y `volumes-caddy-config.tar.gz`: respaldo de Caddy.
- `docker-ps.txt`, `docker-compose-ls.txt`, `docker-system-df.txt`, `df-h.txt`, `free-h.txt`: inventario operativo.
- `sha256sums.txt`: checksums para verificar integridad.
- `MANIFEST.txt`: resumen del backup.

## Verificacion rapida del backup

```bash
cd /opt/backups/cobrofutbol/<timestamp>
sha256sum -c sha256sums.txt
ls -lh
```

Verificar que existan al menos:

```text
postgres.dump
postgres.sql.gz
project.tar.gz
volumes-storage.tar.gz
MANIFEST.txt
sha256sums.txt
```

## Copia fuera del VPS

Despues de generar el backup, copiarlo a un destino externo seguro:

```bash
scp -r root@45.236.90.21:/opt/backups/cobrofutbol/<timestamp> ./cobrofutbol-backup-<timestamp>
```

Si el backup contiene `.env` o secretos, mantenerlo fuera de repos publicos y preferir almacenamiento cifrado.

## Restauracion en VPS nuevo

1. Preparar Ubuntu y Docker/Compose.
2. Copiar el backup al nuevo VPS.
3. Restaurar proyecto:

```bash
mkdir -p /opt/CobroFutbol
tar xzf project.tar.gz -C /opt/CobroFutbol
```

4. Crear volumenes Docker:

```bash
docker volume create cobrofutbol_postgres_data
docker volume create cobrofutbol_redis_data
docker volume create cobrofutbol_storage_data
docker volume create cobrofutbol_caddy_data
docker volume create cobrofutbol_caddy_config
```

5. Restaurar storage/redis/caddy si corresponde:

```bash
docker run --rm -v cobrofutbol_storage_data:/data -v /ruta/backup:/backup alpine sh -lc "cd /data && tar xzf /backup/volumes-storage.tar.gz"
docker run --rm -v cobrofutbol_redis_data:/data -v /ruta/backup:/backup alpine sh -lc "cd /data && tar xzf /backup/volumes-redis.tar.gz"
docker run --rm -v cobrofutbol_caddy_data:/data -v /ruta/backup:/backup alpine sh -lc "cd /data && tar xzf /backup/volumes-caddy-data.tar.gz"
docker run --rm -v cobrofutbol_caddy_config:/data -v /ruta/backup:/backup alpine sh -lc "cd /data && tar xzf /backup/volumes-caddy-config.tar.gz"
```

6. Levantar Postgres y restaurar DB:

```bash
cd /opt/CobroFutbol
docker compose -f docker-compose.prod.yml up -d postgres
docker cp /ruta/backup/postgres.dump cobrofutbol-postgres-1:/tmp/postgres.dump
docker compose -f docker-compose.prod.yml exec -T postgres pg_restore -U postgres -d cobrofutbol --clean --if-exists /tmp/postgres.dump
```

7. Levantar app completa:

```bash
cd /opt/CobroFutbol
docker compose -f docker-compose.prod.yml up -d --build
```

8. Validar:

```bash
docker compose -f docker-compose.prod.yml ps
curl -k -i https://app.cobrofutbol.cl/api/v1/health
```

## Corte DNS

Antes del corte:

- bajar TTL DNS si es posible,
- pausar cambios operativos si hay alto trafico,
- evitar dos workers procesando el mismo flujo en paralelo,
- generar backup final justo antes de apuntar DNS,
- levantar el VPS nuevo y validar internamente,
- apuntar `app.cobrofutbol.cl` al nuevo VPS,
- verificar HTTPS, login, webhooks, worker y DB.

Mantener el VPS anterior encendido como rollback durante algunas horas/dias.

## Rollback

Si el VPS nuevo falla tras el corte:

1. Apuntar DNS de vuelta al VPS anterior.
2. Verificar `https://app.cobrofutbol.cl/api/v1/health`.
3. Revisar que no haya dos workers activos procesando mensajes.
4. Registrar la ventana de datos que pudo entrar al VPS nuevo para decidir reconciliacion manual.

## Mantenimiento recomendado

Semanal:

```bash
docker system df
df -h
```

Limpieza segura cuando el stack este estable:

```bash
docker system prune -a -f --volumes=false
```

Nunca correr sin backup/confirmacion:

```bash
docker volume prune
docker compose down -v
rm -rf /opt/CobroFutbol
```
