#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
NODE_HOME="${XDG_DATA_HOME:-$HOME/.local/share}/shellcraft/node"
export PATH="$NODE_HOME/bin:$PATH"
if ! command -v node >/dev/null || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)'; then
  if [[ $(uname -s) != Linux ]]; then
    echo "Install Node.js 24 or newer from https://nodejs.org, then run this installer again." >&2
    exit 1
  fi
  for tool in curl tar xz sha256sum; do
    command -v "$tool" >/dev/null || { echo "Please install $tool, then run this installer again." >&2; exit 1; }
  done
  case $(uname -m) in
    x86_64) arch=x64; checksum=fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6 ;;
    aarch64|arm64) arch=arm64; checksum=6ad1325edbdb5649c379b75a237147a666c95d4f9ae8d340fef2d1575d289ad2 ;;
    *) echo "Install Node.js 24 or newer for your architecture, then run this again." >&2; exit 1 ;;
  esac
  temp=$(mktemp -d)
  trap 'rm -rf "$temp"' EXIT
  archive="node-v24.21.0-linux-$arch.tar.xz"
  curl --fail --silent --show-error --location "https://nodejs.org/dist/v24.21.0/$archive" --output "$temp/$archive"
  printf '%s  %s\n' "$checksum" "$temp/$archive" | sha256sum --check --strict
  mkdir -p "$NODE_HOME"
  tar -xJf "$temp/$archive" --strip-components=1 -C "$NODE_HOME"
fi
cd "$ROOT"
npm ci --ignore-scripts --no-audit --no-fund
echo "Ready. Run ./run.sh and open http://127.0.0.1:8765 in your browser."
