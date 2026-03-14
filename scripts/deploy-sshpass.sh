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

echo "=== 7. Настройка nginx ==="
sshpass -p "$DEPLOY_PASS" scp deploy/nginx-musicvibe.conf "${HOST}:/tmp/nginx-musicvibe.conf"
sshpass -p "$DEPLOY_PASS" ssh "$HOST" "
  cp /tmp/nginx-musicvibe.conf ${NGINX_CONF} 2>/dev/null || cp /tmp/nginx-musicvibe.conf /etc/nginx/conf.d/musicvibe.conf
  nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null || echo 'Проверьте nginx вручную'
"

echo "=== 8. Настройка и запуск systemd сервиса ==="
sshpass -p "$DEPLOY_PASS" scp deploy/gtpconverter.service "${HOST}:/tmp/gtpconverter.service"
sshpass -p "$DEPLOY_PASS" ssh "$HOST" "sed -e 's|/opt/gtpconverter|${REMOTE_DIR}|g' /tmp/gtpconverter.service > /etc/systemd/system/gtpconverter.service && systemctl daemon-reload && systemctl enable gtpconverter && systemctl restart gtpconverter && systemctl status gtpconverter --no-pager || true"

echo "=== Готово! ==="
echo "Сервис: https://musicvibe.ru"
echo "API: https://musicvibe.ru/api/"
echo ""
echo "Если .env не был скопирован — создайте его на сервере с AUTH_REDIRECT_BASE, FRONTEND_URL, YANDEX_*, FIREBASE_SERVICE_ACCOUNT_JSON."
