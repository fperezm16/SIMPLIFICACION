#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${APP_DIR}/.env"
BACKUP_DIR="${1:-/opt/backups/tramites}"

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "Error: pg_dump no está instalado en este servidor." >&2
  exit 1
fi
if ! command -v pg_restore >/dev/null 2>&1; then
  echo "Error: pg_restore no está instalado en este servidor." >&2
  exit 1
fi
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Error: no se encontró ${ENV_FILE}." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Error: DATABASE_URL no está configurado." >&2
  exit 1
fi

install -d -m 700 "${BACKUP_DIR}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/tramites-${STAMP}.dump"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"

umask 077
pg_dump --format=custom --no-owner --no-privileges --file="${BACKUP_FILE}" "${DATABASE_URL}"
pg_restore --list "${BACKUP_FILE}" >/dev/null
sha256sum "${BACKUP_FILE}" > "${CHECKSUM_FILE}"

echo "Respaldo creado y validado: ${BACKUP_FILE}"
echo "Checksum: ${CHECKSUM_FILE}"
