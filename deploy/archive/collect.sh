#!/bin/sh
# Host cron uses the absolute repository path; credentials stay in a private env file.
set -eu
TASK_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
TASK_ENV="${STOCKFLOW_ARCHIVE_ENV:-$TASK_ROOT/deploy/archive/.env}"
[ -f "$TASK_ENV" ] || { echo 'Archive env file missing' >&2; exit 1; }
cd "$TASK_ROOT"
exec docker compose -p stockflow-archive --env-file "$TASK_ENV" -f compose.archive.yaml run --rm --no-deps collector
