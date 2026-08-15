#!/usr/bin/env bash
# Daily logical backup of the Supabase Postgres database -> Cloudflare R2.
#
# Required env:
#   SUPABASE_DB_URL         session-pooler / direct connection string (postgresql://...)
#   R2_ACCOUNT_ID           Cloudflare account id
#   R2_ACCESS_KEY_ID        R2 API token access key
#   R2_SECRET_ACCESS_KEY    R2 API token secret
# Optional env:
#   R2_BUCKET                    bucket name (default: practice-web-backups)
#   R2_PREFIX                    object key prefix (default: supabase)
#   BACKUP_RETENTION_DAYS        keep backups for N days (default: 30)
#   BACKUP_ENCRYPTION_PASSPHRASE if set, the dump is AES-256 encrypted before upload

set -euo pipefail

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is required}"
: "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID is required}"
: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID is required}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY is required}"

R2_BUCKET="${R2_BUCKET:-practice-web-backups}"
R2_PREFIX="${R2_PREFIX:-supabase}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"

# Use the version-matched pg binaries (PG_BIN set by the workflow install step).
if [[ -n "${PG_BIN:-}" ]]; then
  PG_DUMP="$PG_BIN/pg_dump"
  PG_RESTORE="$PG_BIN/pg_restore"
else
  PG_DUMP="$(command -v pg_dump)"
  PG_RESTORE="$(command -v pg_restore)"
fi
[[ -x "$PG_DUMP" ]] || { echo "error: pg_dump not found" >&2; exit 1; }
[[ -x "$PG_RESTORE" ]] || { echo "error: pg_restore not found" >&2; exit 1; }
command -v rclone >/dev/null || { echo "error: rclone not found" >&2; exit 1; }

RAW_DUMP="practice-web-${TIMESTAMP}.dump"
echo ">> pg_dump -> ${RAW_DUMP}"
"$PG_DUMP" "$SUPABASE_DB_URL" -Fc --no-owner --no-privileges -f "$RAW_DUMP"

echo ">> verifying dump integrity"
"$PG_RESTORE" -l "$RAW_DUMP" >/dev/null

if [[ -n "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ]]; then
  ARCHIVE="${RAW_DUMP}.enc"
  echo ">> encrypting (AES-256-CBC) -> ${ARCHIVE}"
  openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -salt -pass "env:BACKUP_ENCRYPTION_PASSPHRASE" -in "$RAW_DUMP" -out "$ARCHIVE"
  rm -f "$RAW_DUMP"
else
  ARCHIVE="$RAW_DUMP"
fi

sha256sum "$ARCHIVE" > "${ARCHIVE}.sha256"

export RCLONE_CONFIG_BACKUP_TYPE=s3
export RCLONE_CONFIG_BACKUP_PROVIDER=Cloudflare
export RCLONE_CONFIG_BACKUP_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_BACKUP_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_BACKUP_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
R2_PATH="backup:${R2_BUCKET}/${R2_PREFIX}"

echo ">> uploading ${ARCHIVE} + checksum -> r2://${R2_BUCKET}/${R2_PREFIX}/"
rclone copy "$ARCHIVE" "$R2_PATH"
rclone copy "${ARCHIVE}.sha256" "$R2_PATH"

echo ">> removing backups older than ${BACKUP_RETENTION_DAYS} days"
rclone delete "$R2_PATH" --min-age "${BACKUP_RETENTION_DAYS}d" --include "practice-web-*"

echo ">> done, remote files:"
rclone lsl "$R2_PATH"
