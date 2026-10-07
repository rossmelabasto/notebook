#!/bin/bash
# Despliegue por SSH a tu servidor: npm run deploy
#  1. tests locales  2. push a origin  3. envía el commit al servidor (ref "incoming")
#  4. en el servidor: para el servicio, copia la base, actualiza código y dependencias, arranca
#  5. chequeo de salud; si falla, restaura base + código anterior y vuelve a arrancar
#
# Configuración en .deploy.env (no se versiona), por ejemplo:
#   DEPLOY_HOST=mi-servidor          # host o alias de ~/.ssh/config
#   DEPLOY_DIR=/opt/notebook         # clon del repo en el servidor
#   DEPLOY_SERVICE=notebook          # unidad systemd (el usuario necesita sudo -n para start/stop)
#   DEPLOY_PORT=8094
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .deploy.env ] && . ./.deploy.env
: "${DEPLOY_HOST:?Falta DEPLOY_HOST (ver .deploy.env)}"
: "${DEPLOY_DIR:?Falta DEPLOY_DIR (ver .deploy.env)}"
DEPLOY_SERVICE=${DEPLOY_SERVICE:-notebook}
DEPLOY_PORT=${DEPLOY_PORT:-8094}

[ -z "$(git status --porcelain)" ] || { echo "Hay cambios sin commitear"; exit 1; }
npm test
git push origin main
git push "$DEPLOY_HOST:$DEPLOY_DIR" main:refs/heads/incoming --force

ssh "$DEPLOY_HOST" 'bash -s' <<EOF
set -euo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/bin:/bin:\$PATH
cd $DEPLOY_DIR
PREV=\$(git rev-parse HEAD)
NEW=\$(git rev-parse incoming)
[ "\$PREV" = "\$NEW" ] && { echo "Ya está en \$NEW"; exit 0; }
SNAP=data/pre-deploy-\$(date +%Y%m%d-%H%M%S)-\${PREV:0:7}
echo "→ \${PREV:0:7} → \${NEW:0:7}"

sudo -n systemctl stop $DEPLOY_SERVICE
mkdir -p "\$SNAP"
cp -a data/notebook.db* "\$SNAP"/ 2>/dev/null || true

git reset --hard -q incoming
npm ci --omit=dev --no-audit --no-fund --silent
sudo -n systemctl start $DEPLOY_SERVICE

ok=0
for i in \$(seq 1 20); do
  sleep 1
  if curl -sf http://127.0.0.1:$DEPLOY_PORT/api/bootstrap >/dev/null; then ok=1; break; fi
done

if [ \$ok = 1 ]; then
  echo "✓ $DEPLOY_SERVICE arriba con \${NEW:0:7} (copia previa en \$SNAP)"
  ls -1dt data/pre-deploy-* | tail -n +6 | xargs -r rm -rf   # se guardan las 5 últimas
else
  echo "✗ no respondió: rollback a \${PREV:0:7}"
  journalctl -u $DEPLOY_SERVICE -n 30 --no-pager || true
  sudo -n systemctl stop $DEPLOY_SERVICE
  rm -f data/notebook.db-wal data/notebook.db-shm
  cp -a "\$SNAP"/notebook.db* data/
  git reset --hard -q "\$PREV"
  npm ci --omit=dev --no-audit --no-fund --silent
  sudo -n systemctl start $DEPLOY_SERVICE
  exit 1
fi
EOF
