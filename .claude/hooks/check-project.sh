#!/usr/bin/env bash
# PostToolUse — fast feedback loop. Runs the project's own checker on the file
# that just changed and feeds any errors straight back to Claude, so it fixes
# them in the same turn instead of me finding them later.
#
# Exit 2 + stderr = Claude sees the message and must respond to it.
set -uo pipefail

TMP=$(mktemp); cat > "$TMP"; trap 'rm -f "$TMP"' EXIT
FILE=$(/usr/bin/python3 -c '
import json,sys
d=json.load(open(sys.argv[1])); ti=d.get("tool_input") or {}
print(ti.get("file_path") or "")' "$TMP" 2>/dev/null)

[ -z "$FILE" ] || [ ! -f "$FILE" ] && exit 0
ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
OUT=""

case "$FILE" in
  *.ts|*.tsx)
    if [ -f "$ROOT/tsconfig.json" ] && command -v npx >/dev/null 2>&1; then
      OUT=$(cd "$ROOT" && npx --no-install tsc --noEmit 2>&1 | head -30)
    fi ;;
  *.js|*.jsx|*.mjs)
    if command -v npx >/dev/null 2>&1 && ls "$ROOT"/.eslintrc* "$ROOT"/eslint.config.* >/dev/null 2>&1; then
      OUT=$(cd "$ROOT" && npx --no-install eslint "$FILE" 2>&1 | head -30)
    else
      OUT=$(node --check "$FILE" 2>&1 | head -20)
    fi ;;
  *.py)
    if command -v ruff >/dev/null 2>&1; then
      OUT=$(cd "$ROOT" && ruff check "$FILE" 2>&1 | head -30)
    else
      OUT=$(/usr/bin/python3 -m py_compile "$FILE" 2>&1 | head -20)
    fi ;;
  *.json)
    OUT=$(/usr/bin/python3 -m json.tool "$FILE" >/dev/null 2>&1 || echo "Invalid JSON in $FILE") ;;
  *.sh)
    command -v shellcheck >/dev/null 2>&1 && OUT=$(shellcheck -S error "$FILE" 2>&1 | head -20) ;;
esac

if [ -n "${OUT// /}" ]; then
  echo "Checks failed for $FILE — fix these before continuing:" >&2
  echo "$OUT" >&2
  exit 2
fi
exit 0
