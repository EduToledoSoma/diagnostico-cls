#!/usr/bin/env bash
# Uso: ./diagnostico-cls.sh https://seu-site.com [largura=390] [altura=844]
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo 'É necessário instalar Node.js e npm antes de executar.' >&2
  exit 1
fi
if ! node -e "require.resolve('playwright')" >/dev/null 2>&1; then
  echo 'Instalando Playwright nesta pasta...'
  npm install --no-save playwright
fi
if ! node -e "const fs=require('fs'); const p=require('playwright'); process.exit(fs.existsSync(p.chromium.executablePath())?0:1)"; then
  echo 'Instalando o Chromium utilizado pelo Playwright...'
  npx playwright install chromium
fi
node ./diagnostico-cls.js "$@"
