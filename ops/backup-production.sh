#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="/opt/CobroFutbol"
BACKUP_ROOT="${BACKUP_ROOT:-/opt/backups/cobrofutbol}"
COMPOSE_FILE="docker-compose.prod.yml"
DB_CONTAINER="cobrofutbol-postgres-1"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-cobrofutbol}"
DRY_RUN=0

usage() {
  cat <<USAGE
Usage: ./ops/backup-production.sh [--dry-run]

Creates a production backup under:
  ${BACKUP_ROOT}/<timestamp>

The script does not stop containers and does not delete anything.
Set BACKUP_ROOT, DB_USER or DB_NAME to override defaults.
USAGE
}

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $arg" >&2; usage; exit 2 ;;
  esac
done

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing required command: $1" >&2; exit 1; }
}

run_shell() {
  echo "+ $*"
  if [ "$DRY_RUN" -eq 0 ]; then
    sh -lc "$*"
  fi
}

cd "$PROJECT_DIR"
require_cmd docker
require_cmd tar
require_cmd gzip
require_cmd sha256sum

STAMP="$(date -u +%Y%m%d-%H%M%S)"
DEST="${BACKUP_ROOT}/${STAMP}"

echo "CobroFutbol backup preflight"
echo "timestamp=${STAMP}"
echo "project_dir=${PROJECT_DIR}"
echo "backup_dest=${DEST}"
echo "dry_run=${DRY_RUN}"

docker compose -f "$COMPOSE_FILE" ps >/tmp/cobrofutbol-compose-ps.txt
for service in app worker postgres redis caddy; do
  if ! grep -q "cobrofutbol-${service}-1" /tmp/cobrofutbol-compose-ps.txt; then
    echo "Expected service not listed: ${service}" >&2
    exit 1
  fi
done

if [ "$DRY_RUN" -eq 1 ]; then
  echo "Dry run only. Current service status:"
  cat /tmp/cobrofutbol-compose-ps.txt
  echo "Disk:"
  df -h "$PROJECT_DIR" "$BACKUP_ROOT" 2>/dev/null || df -h "$PROJECT_DIR"
  echo "Docker space:"
  docker system df
  exit 0
fi

install -d -m 700 "$DEST"

{
  echo "CobroFutbol production backup"
  echo "timestamp=${STAMP}"
  echo "project_dir=${PROJECT_DIR}"
  echo "compose_file=${PROJECT_DIR}/${COMPOSE_FILE}"
  echo "db_container=${DB_CONTAINER}"
  echo "db_name=${DB_NAME}"
  echo "db_user=${DB_USER}"
} > "${DEST}/MANIFEST.txt"

run_shell "docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' > '${DEST}/docker-ps.txt'"
run_shell "docker compose ls > '${DEST}/docker-compose-ls.txt'"
run_shell "docker system df > '${DEST}/docker-system-df.txt'"
run_shell "df -h > '${DEST}/df-h.txt'"
run_shell "free -h > '${DEST}/free-h.txt'"
run_shell "docker inspect cobrofutbol-app-1 cobrofutbol-worker-1 cobrofutbol-caddy-1 cobrofutbol-postgres-1 cobrofutbol-redis-1 > '${DEST}/docker-inspect.json'"
run_shell "docker compose -f '${COMPOSE_FILE}' config > '${DEST}/docker-compose-config.yml'"

run_shell "docker exec '${DB_CONTAINER}' pg_dump -U '${DB_USER}' -d '${DB_NAME}' -Fc > '${DEST}/postgres.dump'"
run_shell "docker exec '${DB_CONTAINER}' pg_dump -U '${DB_USER}' -d '${DB_NAME}' | gzip -9 > '${DEST}/postgres.sql.gz'"

run_shell "tar --exclude='./node_modules' --exclude='./.next' --exclude='./.git' --exclude='./storage' --exclude='./*.traineddata' --exclude='./ops/tmp' -czf '${DEST}/project.tar.gz' -C '${PROJECT_DIR}' ."

run_shell "docker run --rm -v cobrofutbol_storage_data:/data:ro -v '${DEST}:/backup' alpine sh -lc 'cd /data && tar czf /backup/volumes-storage.tar.gz .'"
run_shell "docker run --rm -v cobrofutbol_redis_data:/data:ro -v '${DEST}:/backup' alpine sh -lc 'cd /data && tar czf /backup/volumes-redis.tar.gz .'"
run_shell "docker run --rm -v cobrofutbol_caddy_data:/data:ro -v '${DEST}:/backup' alpine sh -lc 'cd /data && tar czf /backup/volumes-caddy-data.tar.gz .'"
run_shell "docker run --rm -v cobrofutbol_caddy_config:/data:ro -v '${DEST}:/backup' alpine sh -lc 'cd /data && tar czf /backup/volumes-caddy-config.tar.gz .'"

run_shell "cd '${DEST}' && sha256sum * > sha256sums.txt"
run_shell "chmod -R go-rwx '${DEST}'"

{
  echo
  echo "Files:"
  ls -lh "$DEST"
  echo
  echo "Verify with:"
  echo "  cd '${DEST}' && sha256sum -c sha256sums.txt"
} | tee -a "${DEST}/MANIFEST.txt"

echo "Backup completed: ${DEST}"
