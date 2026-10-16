#!/bin/zsh
cd -- "${0:A:h}"
if curl -fsS http://localhost:4321/api/health >/dev/null 2>&1; then
  open http://localhost:4321
  exit 0
fi
if [[ ! -d dist ]]; then
  npm run build || exit 1
fi
node --env-file-if-exists=.env server/index.mjs
