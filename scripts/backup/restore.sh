#!/usr/bin/env bash
# Restore a backup from R2 into a target Postgres database.
#
# Usage:
#   RESTORE_TARGET_URL=<postgresql://...> \
#   R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
#   ./restore.sh [backup-key]
#
#   backup-key: object key under the bucket, e.g. "supabase/practice-web-20250401T020000Z.dump[.enc]"
#               or "latest" (default) to restore the most recent backup.
#
# WARNING: never point RESTORE_TARGET_URL at a production database.
# Restore into a fresh instance first, verify, then promote.
# If the backup was encrypted, BACKUP_ENCRYPTION_PASSPHRASE must match
# the passphrase used at backup time.

set -euo pipefail

: "${RESTORE_TARGET_URL:?RESTORE_TARGET_URL is required}"
: "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID is required}"
: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID is required}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY is required}"

R2_BUCKET="${R2_BUCKET:-practice-web-backups}"
R2_PREFIX="${R2_PREFIX:-supabase}"
KEY="${1:-latest}"

# Use the version-matched pg binaries (PG_BIN set by the workflow install step).
if [[ -n "${PG_BIN:-}" ]]; then
  PG_RESTORE="$PG_BIN/pg_restore"
else
  PG_RESTORE="$(command -v pg_restore)"
fi
[[ -x "$PG_RESTORE" ]] || { echo "error: pg_restore not found" >&2; exit 1; }
command -v rclone >/dev/null || { echo "error: rclone not found" >&2; exit 1; }

export RCLONE_CONFIG_BACKUP_TYPE=s3
export RCLONE_CONFIG_BACKUP_PROVIDER=Cloudflare
export RCLONE_CONFIG_BACKUP_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_BACKUP_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_BACKUP_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
R2_PATH="backup:${R2_BUCKET}/${R2_PREFIX}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if [[ "$KEY" == "latest" ]]; then
  echo ">> resolving latest backup"
  FILE="$(rclone lsf "$R2_PATH" --files-only | grep -E '^practice-web-.*\.dump(\.enc)?$' | sort | tail -n1)"
  [[ -n "$FILE" ]] || { echo "error: no backups found" >&2; exit 1; }
else
  FILE="$(basename "$KEY")"
fi
echo ">> restoring ${FILE}"

rclone copyto "${R2_PATH}/${FILE}" "${WORK}/${FILE}"

DUMP="${WORK}/${FILE}"
if [[ "$FILE" == *.enc ]]; then
  : "${BACKUP_ENCRYPTION_PASSPHRASE:?BACKUP_ENCRYPTION_PASSPHRASE is required to decrypt}"
  DUMP="${WORK}/${FILE%.enc}"
  echo ">> decrypting"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -salt -pass "env:BACKUP_ENCRYPTION_PASSPHRASE" -in "${WORK}/${FILE}" -out "$DUMP"
fi

echo ">> verifying archive"
"$PG_RESTORE" -l "$DUMP" >/dev/null

echo ">> restoring into ${RESTORE_TARGET_URL}"
"$PG_RESTORE" --clean --if-exists --no-owner --no-privileges -d "$RESTORE_TARGET_URL" "$DUMP"
echo ">> restore finished"
