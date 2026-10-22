#!/usr/bin/env bash
# Full validation for this service: lint, build, build:ui and test.
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

echo "==> validate: OK"
