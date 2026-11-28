#!/bin/bash
# Restore only into a newly created disposable database; never into the source DB.
set -euo pipefail
umask 077
ops_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
backup_dir="${ARCHIVE_BACKUP_DIR:-/var/backups/stockflow}"
db_container="${ARCHIVE_DB_CONTAINER:-stockflow-archive-db-1}"
db_name="${ARCHIVE_DB_NAME:-stockflow_archive}"
db_user="${ARCHIVE_DB_USER:-stockflow}"
[[ "$backup_dir" == /* && "$backup_dir" != / && -d "$backup_dir" && ! -L "$backup_dir" ]] || exit 1
[[ "$db_container" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ && "$db_name" =~ ^[a-zA-Z][a-zA-Z0-9_]*$ && "$db_user" =~ ^[a-zA-Z][a-zA-Z0-9_]*$ ]] || exit 1
backup_dir="$(realpath -- "$backup_dir")"
exec 9>"$backup_dir/.backup.lock"
if ! flock -n 9; then echo '{"restore":"locked"}'; exit 0; fi
if [[ $# -gt 1 ]]; then echo 'Use at most one backup bundle basename' >&2; exit 1; fi
if [[ $# == 1 ]]; then base="$1"; else
  base="$(find "$backup_dir" -maxdepth 1 -type f -name 'stockflow-archive-*.sha256' -printf '%f\n' | sort | tail -1)"
  base="${base%.sha256}"
fi
[[ "$base" =~ ^stockflow-archive-[0-9]{8}T[0-9]{6}Z-[a-zA-Z0-9]+$ ]] || { echo 'No valid completed backup bundle' >&2; exit 1; }
for suffix in dump manifest.jsonl sha256; do [[ -f "$backup_dir/$base.$suffix" && ! -L "$backup_dir/$base.$suffix" ]] || exit 1; done
(cd "$backup_dir"; sha256sum --check --status "$base.sha256") || { echo 'Backup checksum mismatch' >&2; exit 1; }
restore_db="stockflow_restore_check_$(date -u +%Y%m%d%H%M%S)_$$"
[[ "$restore_db" =~ ^stockflow_restore_check_[0-9]{14}_[0-9]+$ && "$restore_db" != "$db_name" ]] || exit 1
work="$(mktemp -d "$backup_dir/.restore.XXXXXXXX")"
created=0
cleanup() {
  result=$?
  trap - EXIT HUP INT TERM
  if [[ "$created" == 1 ]]; then
    docker exec "$db_container" dropdb --no-password -U "$db_user" --if-exists "$restore_db" || result=1
  fi
  rm -f -- "$work/restored.jsonl"
  rmdir -- "$work" 2>/dev/null || true
  if [[ "$result" != 0 ]]; then echo '{"restore":"failed"}' >&2; fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' HUP TERM
docker exec "$db_container" createdb --no-password -U "$db_user" --template=template0 "$restore_db"
created=1
docker exec -i "$db_container" pg_restore --no-password -U "$db_user" -d "$restore_db" --no-owner --no-acl --single-transaction --exit-on-error < "$backup_dir/$base.dump"
docker exec -i "$db_container" psql -w -X -qAt -v ON_ERROR_STOP=1 -U "$db_user" -d "$restore_db" < "$ops_dir/manifest.sql" > "$work/restored.jsonl"
cmp --silent "$backup_dir/$base.manifest.jsonl" "$work/restored.jsonl" || { echo 'Restored data manifest mismatch' >&2; exit 1; }
printf '{"restore":"success","bundle":"%s","tables":%s,"manifest":"matched"}\n' "$base" "$(wc -l < "$work/restored.jsonl")"
