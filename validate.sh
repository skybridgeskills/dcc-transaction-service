#!/usr/bin/env bash
# Full validation for this service and linked verifier-core (sibling repo).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
cd "$ROOT"

echo "==> dcc-transaction-service: lint"
pnpm lint
echo "==> dcc-transaction-service: build"
pnpm build
echo "==> dcc-transaction-service: build:ui"
pnpm build:ui
echo "==> dcc-transaction-service: test"
pnpm test

VERIFIER_CORE="$ROOT/../verifier-core"
if [[ -d "$VERIFIER_CORE" ]]; then
  echo "==> verifier-core: test (includes lint)"
  (cd "$VERIFIER_CORE" && pnpm test)
else
  echo "==> verifier-core: skip (not found at $VERIFIER_CORE)"
fi

echo "==> validate: OK"
