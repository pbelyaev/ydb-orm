#!/usr/bin/env bash
set -euo pipefail

base="${BASE_URL:-http://localhost:3000}"

curl -sS -X POST "$base/users" \
  -H 'content-type: application/json' \
  -d '{"id":"1","email":"a@b.com","name":"Pavel"}' >/dev/null

curl -sS "$base/users" | grep -q 'a@b.com'

curl -sS -X POST "$base/posts" \
  -H 'content-type: application/json' \
  -d '{"id":"p1","userId":"1","title":"Hello","body":"World"}' >/dev/null

curl -sS "$base/posts" | grep -q '"id":"p1"'

echo "smoke ok"
