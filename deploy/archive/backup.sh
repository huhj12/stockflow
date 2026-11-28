#!/bin/bash
# Consistent DB snapshot, atomic publication, and retention of verified bundles only.
set -euo pipefail
umask 077
ops_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
backup_dir="${ARCHIVE_BACKUP_DIR:-/var/backups/stockflow}"
db_container="${ARCHIVE_DB_CONTAINER:-stockflow-archive-db-1}"
db_name="${ARCHIVE_DB_NAME:-stockflow_archive}"
db_user="${ARCHIVE_DB_USER:-stockflow}"
retention="${ARCHIVE_BACKUP_RETENTION_DAYS:-14}"
[[ "$backup_dir" == /* && "$backup_dir" != / && ! -L "$backup_dir" ]] || { echo 'Invalid backup directory' >&2; exit 1; }
[[ "$db_container" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ && "$db_name" =~ ^[a-zA-Z][a-zA-Z0-9_]*$ && "$db_user" =~ ^[a-zA-Z][a-zA-Z0-9_]*$ ]] || exit 1
[[ "$retention" =~ ^[0-9]+$ && "$retention" -ge 1 && "$retention" -le 365 ]] || exit 1
mkdir -p -- "$backup_dir"
backup_dir="$(realpath -- "$backup_dir")"
chmod 700 "$backup_dir"
exec 9>"$backup_dir/.backup.lock"
if ! flock -n 9; then echo '{"backup":"locked"}'; exit 0; fi
work="$(mktemp -d "$backup_dir/.pending.XXXXXXXX")"
snapshot_pid=''
snapshot_in=''
snapshot_out=''
cleanup() {
  result=$?
  trap - EXIT HUP INT TERM
  # A failed psql startup can close its input before cleanup writes \q.
  trap '' PIPE
  if [[ -n "$snapshot_pid" ]]; then
    printf '\\q\n' >&"$snapshot_in" 2>/dev/null || true
    exec {snapshot_in}>&- || true
    exec {snapshot_out}<&- || true
    wait "$snapshot_pid" 2>/dev/null || true
  fi
  rm -f -- "$work/archive.dump" "$work/manifest.jsonl" "$work/checksum.sha256"
  rmdir -- "$work" 2>/dev/null || true
  if [[ "$result" != 0 ]]; then echo '{"backup":"failed"}' >&2; fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' HUP TERM
coproc SNAPSHOT { docker exec -i "$db_container" psql -w -X -qAt -v ON_ERROR_STOP=1 -U "$db_user" -d "$db_name"; }
snapshot_pid=$SNAPSHOT_PID
exec {snapshot_in}>&"${SNAPSHOT[1]}"
exec {snapshot_out}<&"${SNAPSHOT[0]}"
printf 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSELECT pg_export_snapshot();\n' >&"$snapshot_in"
IFS= read -r -t 30 snapshot_id <&"$snapshot_out"
[[ "$snapshot_id" =~ ^[A-Fa-f0-9]+-[A-Fa-f0-9]+-[0-9]+$ ]] || { echo 'Invalid database snapshot' >&2; exit 1; }
timeout 300 docker exec "$db_container" pg_dump --no-password -U "$db_user" -d "$db_name" --lock-wait-timeout=15s --format=custom --no-owner --no-acl --exclude-schema='archive_test_*' --snapshot="$snapshot_id" > "$work/archive.dump"
[[ -s "$work/archive.dump" ]]
cat "$ops_dir/manifest.sql" >&"$snapshot_in"
printf '\n\\echo STOCKFLOW_MANIFEST_END\n' >&"$snapshot_in"
manifest_done=0
while IFS= read -r -t 60 row <&"$snapshot_out"; do
  if [[ "$row" == STOCKFLOW_MANIFEST_END ]]; then manifest_done=1; break; fi
  [[ "$row" == '{'* ]] || { echo 'Invalid manifest output' >&2; exit 1; }
  printf '%s\n' "$row" >> "$work/manifest.jsonl"
done
[[ "$manifest_done" == 1 && -s "$work/manifest.jsonl" ]]
printf 'ROLLBACK;\n\\q\n' >&"$snapshot_in"
exec {snapshot_in}>&-
exec {snapshot_out}<&-
wait "$snapshot_pid"
snapshot_pid=''
docker exec -i "$db_container" pg_restore --list < "$work/archive.dump" >/dev/null
base="stockflow-archive-$(date -u +%Y%m%dT%H%M%SZ)-$(basename "$work" | cut -d. -f3)"
mv -- "$work/archive.dump" "$backup_dir/$base.dump"
mv -- "$work/manifest.jsonl" "$backup_dir/$base.manifest.jsonl"
(cd "$backup_dir"; sha256sum "$base.dump" "$base.manifest.jsonl") > "$work/checksum.sha256"
# The checksum file is the commit marker. Incomplete publications are never restored/pruned.
mv -- "$work/checksum.sha256" "$backup_dir/$base.sha256"
while IFS= read -r -d '' old; do
  name="$(basename "$old" .sha256)"
  [[ "$name" =~ ^stockflow-archive-[0-9]{8}T[0-9]{6}Z-[a-zA-Z0-9]+$ && "$name" != "$base" ]] || continue
  [[ -f "$backup_dir/$name.dump" && ! -L "$backup_dir/$name.dump" && -f "$backup_dir/$name.manifest.jsonl" && ! -L "$backup_dir/$name.manifest.jsonl" ]] || continue
  if (cd "$backup_dir"; sha256sum --check --status "$name.sha256"); then
    rm -f -- "$backup_dir/$name.dump" "$backup_dir/$name.manifest.jsonl" "$old"
  fi
done < <(find "$backup_dir" -maxdepth 1 -type f -name 'stockflow-archive-*.sha256' -mtime +"$((retention-1))" -print0)
printf '{"backup":"success","bundle":"%s","bytes":%s,"retentionDays":%s}\n' "$base" "$(stat -c %s "$backup_dir/$base.dump")" "$retention"
