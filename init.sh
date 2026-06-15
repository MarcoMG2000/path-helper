#!/usr/bin/env bash
# init.sh — prepara el entorno y verifica que la suite pasa.
# Idempotente. Debe terminar en exit 0 para considerar el entorno sano.
#
# Plantilla neutra: adapta los pasos al stack real del proyecto. El comando de
# tests es configurable vía la variable de entorno TEST_CMD.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo "==> init"

# 1. Preparación del entorno
#    Añade aquí lo específico del stack (instalar deps, crear venv, build, etc.).
#    Ejemplo (Python):   python3 -m venv .venv && source .venv/*/activate && pip install -r requirements.txt
#    Ejemplo (Node):     npm install
echo "==> (sin pasos de entorno configurados todavía)"

# 2. Tests
#    Define TEST_CMD con el comando de test del proyecto.
#    Ejemplo: TEST_CMD="pytest -q -m 'not integration'"  o  TEST_CMD="npm test"
if [ -n "${TEST_CMD:-}" ]; then
  echo "==> Ejecutando tests: $TEST_CMD"
  eval "$TEST_CMD"
else
  echo "==> (sin TEST_CMD definido todavía; se configurará al implementar features)"
fi

echo "==> init OK"
