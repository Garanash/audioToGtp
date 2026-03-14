#!/bin/bash
# Деплой на сервер через sshpass
# Использование:
#   DEPLOY_PASS='yourpassword' ./scripts/deploy-sshpass.sh
#   или
#   ./scripts/deploy-sshpass.sh  # запросит пароль
#
# Сервер: root@37.252.22.95
# Домен: musicvibe.ru

set -e

HOST="root@37.252.22.95"
REMOTE_DIR="/opt/gtpconverter"
NGINX_CONF="/etc/nginx/sites-available/musicvibe"

# Проверка sshpass
if ! command -v sshpass &>/dev/null; then
  echo "Установите sshpass: brew install sshpass (macOS) или apt install sshpass (Linux)"
  exit 1
fi

# Пароль из переменной или интерактивно
if [ -z "$DEPLOY_PASS" ]; then
  echo -n "Пароль для $HOST: "
  read -s DEPLOY_PASS
  echo
fi

if [ -z "$DEPLOY_PASS" ]; then
  echo "Ошибка: укажите DEPLOY_PASS или введите пароль"
  exit 1
fi

echo "=== 1. Сборка фронтенда ==="
npm run build

# Сборка использует .env локально — убедитесь, что VITE_FIREBASE_* заполнены

echo "=== 3. Загрузка на сервер ==="
sshpass -p "$DEPLOY_PASS" rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.venv' \
  --exclude '.git' \
  --exclude 'server/data' \
  --exclude '__pycache__' \
  --exclude '*.pyc' \
  --exclude '.env' \
  --exclude 'gtp_tabs' \
  --exclude '.cursor' \
  . "${HOST}:${REMOTE_DIR}/"

echo "=== 4. Копирование .env на сервер (если есть) ==="
if [ -f .env ]; then
  sshpass -p "$DEPLOY_PASS" scp .env "${HOST}:${REMOTE_DIR}/.env"
  echo "  .env скопирован"
else
  echo "  .env не найден локально — создайте его на сервере вручную"
fi

echo "=== 5. Копирование собранного фронтенда в dist ==="
sshpass -p "$DEPLOY_PASS" ssh "$HOST" "mkdir -p ${REMOTE_DIR}/dist"
sshpass -p "$DEPLOY_PASS" rsync -avz --delete dist/ "${HOST}:${REMOTE_DIR}/dist/"

echo "=== 6. Установка зависимостей Python на сервере ==="
sshpass -p "$DEPLOY_PASS" ssh "$HOST" "cd ${REMOTE_DIR} && (test -d .venv || python3 -m venv .venv) && .venv/bin/pip install -q -r server/requirements.txt"

echo "=== 6.1. Redis и Celery worker ==="
sshpass -p "$DEPLOY_PASS" ssh "$HOST" "
  (command -v redis-server >/dev/null || apt-get update && apt-get install -y redis-server) 2>/dev/null || true
  (systemctl start redis-server 2>/dev/null || systemctl start redis 2>/dev/null || true)
  (systemctl enable redis-server 2>/dev/null || systemctl enable redis 2>/dev/null || true)
  touch ${REMOTE_DIR}/.env
  sed -i.bak 's/^USE_CELERY=.*/USE_CELERY=1/' ${REMOTE_DIR}/.env 2>/dev/null || true
  grep -q '^USE_CELERY=' ${REMOTE_DIR}/.env 2>/dev/null || echo 'USE_CELERY=1' >> ${REMOTE_DIR}/.env
  sed -i.bak 's|^REDIS_URL=.*|REDIS_URL=redis://127.0.0.1:6379/0|' ${REMOTE_DIR}/.env 2>/dev/null || true
  grep -q '^REDIS_URL=' ${REMOTE_DIR}/.env 2>/dev/null || echo 'REDIS_URL=redis://127.0.0.1:6379/0' >> ${REMOTE_DIR}/.env
"

echo "=== 7. Настройка nginx ==="
if sshpass -p "$DEPLOY_PASS" ssh "$HOST" "test -f /etc/letsencrypt/live/musicvibe.ru/fullchain.pem" 2>/dev/null; then
  sshpass -p "$DEPLOY_PASS" scp deploy/nginx-musicvibe-ssl.conf "${HOST}:/tmp/nginx-musicvibe.conf"
else
  sshpass -p "$DEPLOY_PASS" scp deploy/nginx-musicvibe.conf "${HOST}:/tmp/nginx-musicvibe.conf"
fi
sshpass -p "$DEPLOY_PASS" ssh "$HOST" "
  cp /tmp/nginx-musicvibe.conf ${NGINX_CONF} 2>/dev/null || cp /tmp/nginx-musicvibe.conf /etc/nginx/conf.d/musicvibe.conf
  nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null || echo 'Проверьте nginx вручную'
"

echo "=== 8. Настройка и запуск systemd сервисов ==="
sshpass -p "$DEPLOY_PASS" scp deploy/gtpconverter.service "${HOST}:/tmp/gtpconverter.service"
sshpass -p "$DEPLOY_PASS" scp deploy/celery-worker.service "${HOST}:/tmp/celery-worker.service"
sshpass -p "$DEPLOY_PASS" ssh "$HOST" "
  sed -e 's|/opt/gtpconverter|${REMOTE_DIR}|g' /tmp/gtpconverter.service > /etc/systemd/system/gtpconverter.service
  sed -e 's|/opt/gtpconverter|${REMOTE_DIR}|g' /tmp/celery-worker.service > /etc/systemd/system/celery-worker.service
  systemctl daemon-reload
  systemctl enable gtpconverter celery-worker 2>/dev/null || systemctl enable gtpconverter
  systemctl restart gtpconverter
  systemctl restart celery-worker 2>/dev/null || true
  systemctl status gtpconverter --no-pager || true
  systemctl status celery-worker --no-pager 2>/dev/null || true
"
echo "=== 9. Резервное копирование БД (cron 2 раза в сутки) ==="
sshpass -p "$DEPLOY_PASS" ssh "$HOST" "
  chmod +x ${REMOTE_DIR}/scripts/backup-db.sh 2>/dev/null || true
  (crontab -l 2>/dev/null | grep -v backup-db.sh; echo '0 6,18 * * * ${REMOTE_DIR}/scripts/backup-db.sh') | crontab - 2>/dev/null || true
"

echo "=== Готово! ==="
echo "Сервис: https://musicvibe.ru"
echo "API: https://musicvibe.ru/api/"
echo ""
echo "Если .env не был скопирован — создайте его на сервере с AUTH_REDIRECT_BASE, FRONTEND_URL, YANDEX_*, FIREBASE_SERVICE_ACCOUNT_JSON."
