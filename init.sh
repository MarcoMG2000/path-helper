#!/usr/bin/env bash
# init.sh — prepara el entorno y verifica que la suite pasa.
# Idempotente. Debe terminar en exit 0 para considerar el entorno sano.
#
# Stack: Node 22 LTS + npm. Mientras f0-project-skeleton no haya creado
# package.json no hay nada que instalar ni testear y el script solo avisa.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo "==> init"

if [ ! -f package.json ]; then
  echo "==> (sin package.json todavía: f0-project-skeleton aún no implementado)"
  echo "==> init OK"
  exit 0
fi

# 1. Entorno
# Windows (Git Bash): una sesión abierta antes de instalar Node no tiene su PATH.
if ! command -v node >/dev/null 2>&1 && [ -x "/c/Program Files/nodejs/node.exe" ]; then
  export PATH="/c/Program Files/nodejs:$PATH"
fi
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js no está instalado (se requiere Node 22 LTS)." >&2
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "ERROR: se requiere Node >= 22 (encontrado $(node --version))." >&2
  exit 1
fi

if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

# 2. Tests (suite no-integration). Se puede sobreescribir con TEST_CMD.
TEST_CMD="${TEST_CMD:-npm test --silent}"
echo "==> Ejecutando tests: $TEST_CMD"
eval "$TEST_CMD"

echo "==> init OK"
