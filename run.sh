#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
export PATH="${XDG_DATA_HOME:-$HOME/.local/share}/shellcraft/node/bin:$PATH"
if ! command -v node >/dev/null || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)'; then
  echo "Run ./install.sh first to set up Node.js 24 or newer." >&2
  exit 1
fi
exec node "$ROOT/scripts/serve.js" "${PORT:-8765}"
