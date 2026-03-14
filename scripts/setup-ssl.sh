#!/bin/bash
# Настройка HTTPS на сервере через Certbot
# Запуск: DEPLOY_PASS='...' ./scripts/setup-ssl.sh

set -e
HOST="root@37.252.22.95"

if [ -z "$DEPLOY_PASS" ]; then
  echo -n "Пароль для $HOST: "
  read -s DEPLOY_PASS
  echo
fi

if ! command -v sshpass &>/dev/null; then
  echo "Установите sshpass: brew install sshpass"
  exit 1
fi

echo "=== 1. Создание /var/www/certbot на сервере ==="
sshpass -p "$DEPLOY_PASS" ssh "$HOST" "mkdir -p /var/www/certbot"

echo "=== 2. Временный nginx (только 80, для ACME) ==="
sshpass -p "$DEPLOY_PASS" scp deploy/nginx-musicvibe.conf "$HOST:/etc/nginx/sites-available/musicvibe"
sshpass -p "$DEPLOY_PASS" ssh "$HOST" "
  ln -sf /etc/nginx/sites-available/musicvibe /etc/nginx/sites-enabled/musicvibe 2>/dev/null || true
  nginx -t && systemctl reload nginx
"

echo "=== 3. Установка Certbot (если нужно) и получение сертификата ==="
sshpass -p "$DEPLOY_PASS" ssh "$HOST" "
  if ! command -v certbot &>/dev/null; then
    apt-get update -qq && apt-get install -y -qq certbot
  fi
  certbot certonly --webroot -w /var/www/certbot -d musicvibe.ru -d www.musicvibe.ru --non-interactive --agree-tos --email admin@musicvibe.ru
"

echo "=== 4. Применение SSL-конфига ==="
sshpass -p "$DEPLOY_PASS" scp deploy/nginx-musicvibe-ssl.conf "$HOST:/etc/nginx/sites-available/musicvibe"
sshpass -p "$DEPLOY_PASS" ssh "$HOST" "
  nginx -t && systemctl reload nginx
  echo 'HTTPS настроен: https://musicvibe.ru'
"
