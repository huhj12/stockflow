#!/bin/bash
# Real PostgreSQL tests. Only a fresh, uniquely named fixture database is modified.
set -euo pipefail
umask 077
ops_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
export ARCHIVE_DB_CONTAINER="${ARCHIVE_DB_CONTAINER:-stockflow-archive-db-1}"
export ARCHIVE_DB_USER="${ARCHIVE_DB_USER:-stockflow}"
export ARCHIVE_DB_NAME="stockflow_backup_test_$(date -u +%Y%m%d%H%M%S)_$$"
[[ "$ARCHIVE_DB_NAME" =~ ^stockflow_backup_test_[0-9]{14}_[0-9]+$ ]] || exit 1
work="$(mktemp -d /tmp/stockflow-backup-test.XXXXXXXX)"
export ARCHIVE_BACKUP_DIR="$work/backups"
created=0
writer_pid=''
cleanup() {
  result=$?
  trap - EXIT HUP INT TERM
  if [[ -n "$writer_pid" ]]; then wait "$writer_pid" || result=1; fi
  if [[ "$created" == 1 ]]; then docker exec "$ARCHIVE_DB_CONTAINER" dropdb --no-password -U "$ARCHIVE_DB_USER" --if-exists "$ARCHIVE_DB_NAME" || result=1; fi
  # This directory was allocated by mktemp, not supplied by the caller.
  if [[ "$work" =~ ^/tmp/stockflow-backup-test\.[a-zA-Z0-9]+$ && "$(realpath "$work")" == "$work" ]]; then rm -rf -- "$work"; fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' HUP TERM
docker exec "$ARCHIVE_DB_CONTAINER" createdb --no-password -U "$ARCHIVE_DB_USER" --template=template0 "$ARCHIVE_DB_NAME"
created=1
docker exec -i "$ARCHIVE_DB_CONTAINER" psql -w -X -q -v ON_ERROR_STOP=1 -U "$ARCHIVE_DB_USER" -d "$ARCHIVE_DB_NAME" <<'SQL'
CREATE TABLE records(id integer PRIMARY KEY, code text NOT NULL, amount bigint, at timestamptz, extra jsonb);
CREATE TABLE empty_records(id integer PRIMARY KEY);
INSERT INTO records VALUES(1,'005930',9007199254740991,'2026-11-28T00:00:00Z','{"name":"합성 테스트"}');
INSERT INTO records VALUES(2,'000660',NULL,NULL,NULL);
SQL
# Writes continue during the exported snapshot: the dump and manifest must still agree.
(
 for id in $(seq 3 14); do
  docker exec "$ARCHIVE_DB_CONTAINER" psql -w -X -q -v ON_ERROR_STOP=1 -U "$ARCHIVE_DB_USER" -d "$ARCHIVE_DB_NAME" -c "INSERT INTO records(id,code) VALUES($id,'005930');"
  sleep 0.05
 done
) > "$work/writer.log" 2>&1 &
writer_pid=$!
bash "$ops_dir/backup.sh"
wait "$writer_pid"
writer_pid=''
base="$(find "$ARCHIVE_BACKUP_DIR" -maxdepth 1 -name '*.sha256' -printf '%f\n' | sort | tail -1)"
base="${base%.sha256}"
# Later source changes must not make restoration of an older valid snapshot fail.
docker exec "$ARCHIVE_DB_CONTAINER" psql -w -X -q -v ON_ERROR_STOP=1 -U "$ARCHIVE_DB_USER" -d "$ARCHIVE_DB_NAME" -c "INSERT INTO records(id,code) VALUES(999,'005930');"
bash "$ops_dir/restore-check.sh" "$base"
[[ "$(stat -c %a "$ARCHIVE_BACKUP_DIR/$base.dump")" == 600 ]]
[[ "$(stat -c %a "$ARCHIVE_BACKUP_DIR")" == 700 ]]
before="$(find "$ARCHIVE_BACKUP_DIR" -name '*.sha256' | wc -l)"
flock "$ARCHIVE_BACKUP_DIR/.backup.lock" bash "$ops_dir/backup.sh" > "$work/locked.log"
grep -q '"backup":"locked"' "$work/locked.log"
[[ "$(find "$ARCHIVE_BACKUP_DIR" -name '*.sha256' | wc -l)" == "$before" ]]
mkdir "$work/corrupt"
cp "$ARCHIVE_BACKUP_DIR/$base.dump" "$ARCHIVE_BACKUP_DIR/$base.manifest.jsonl" "$ARCHIVE_BACKUP_DIR/$base.sha256" "$work/corrupt/"
printf 'invalid bytes' >> "$work/corrupt/$base.dump"
if ARCHIVE_BACKUP_DIR="$work/corrupt" bash "$ops_dir/restore-check.sh" "$base" > "$work/corrupt.log" 2>&1; then echo 'Corrupt backup was accepted' >&2; exit 1; fi
old='stockflow-archive-20200101T000000Z-RetentionFixture'
cp "$ARCHIVE_BACKUP_DIR/$base.dump" "$ARCHIVE_BACKUP_DIR/$old.dump"
cp "$ARCHIVE_BACKUP_DIR/$base.manifest.jsonl" "$ARCHIVE_BACKUP_DIR/$old.manifest.jsonl"
(cd "$ARCHIVE_BACKUP_DIR"; sha256sum "$old.dump" "$old.manifest.jsonl") > "$ARCHIVE_BACKUP_DIR/$old.sha256"
touch -d '20 days ago' "$ARCHIVE_BACKUP_DIR/$old.sha256"
printf 'preserve unrelated files\n' > "$ARCHIVE_BACKUP_DIR/keep.txt"
if ARCHIVE_DB_NAME="stockflow_missing_$$" bash "$ops_dir/backup.sh" > "$work/failure.log" 2>&1; then echo 'Missing database was accepted' >&2; exit 1; fi
[[ -f "$ARCHIVE_BACKUP_DIR/$old.sha256" && -f "$ARCHIVE_BACKUP_DIR/$base.sha256" ]]
[[ "$(find "$ARCHIVE_BACKUP_DIR" -maxdepth 1 -name '.pending.*' | wc -l)" == 0 ]]
bash "$ops_dir/backup.sh"
[[ ! -e "$ARCHIVE_BACKUP_DIR/$old.sha256" && ! -e "$ARCHIVE_BACKUP_DIR/$old.dump" && ! -e "$ARCHIVE_BACKUP_DIR/$old.manifest.jsonl" ]]
[[ -f "$ARCHIVE_BACKUP_DIR/$base.sha256" && -f "$ARCHIVE_BACKUP_DIR/keep.txt" ]]
bash "$ops_dir/restore-check.sh"
echo 'Backup integration passed: consistent snapshot, concurrent writes, restore fingerprints, permissions, lock, corruption rejection, failed-dump cleanup and retention'
