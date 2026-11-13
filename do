#!/bin/sh

set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
scripts="$root/scripts"

tasks() {
  echo "usage: ./do <task> [args]"
  echo
  echo "Tasks:"
  for file in "$scripts"/*; do
    name=$(basename "$file")
    case "$name" in _* | *.test.*) continue ;; esac
    [ -f "$file" ] && [ -x "$file" ] || continue
    summary=$(sed -n 's/^# help: //p' "$file" | head -n 1)
    printf '  %-14s %s\n' "$name" "$summary"
  done
}

task=${1:-}
case "$task" in
'' | help)
  tasks
  exit 0
  ;;
_* | */* | *.test.*)
  printf '%s is not a task.\n\n' "$task" >&2
  tasks >&2
  exit 2
  ;;
esac

if [ ! -f "$scripts/$task" ] || [ ! -x "$scripts/$task" ]; then
  printf 'no task called %s.\n\n' "$task" >&2
  tasks >&2
  exit 2
fi

shift
exec "$scripts/$task" "$@"
