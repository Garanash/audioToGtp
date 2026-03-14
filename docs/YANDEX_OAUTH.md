# Настройка Yandex OAuth для musicvibe.ru

## Платформы приложений (Шаг 2 из 4)

### Redirect URI
```
https://musicvibe.ru/api/auth/yandex/callback
```

Яндекс перенаправляет сюда пользователя после авторизации. Точное совпадение URL обязательно.

### Suggest Hostname
```
musicvibe.ru
```

Домен, на котором размещена кнопка «Войти через Яндекс». Если используется `www`, добавьте и `www.musicvibe.ru`.

---

## Переменные окружения на сервере

В `.env` (копируется при деплое из локального .env):
```
AUTH_REDIRECT_BASE=https://musicvibe.ru/api
FRONTEND_URL=https://musicvibe.ru
YANDEX_CLIENT_ID=<ваш Client ID>
YANDEX_CLIENT_SECRET=<ваш Client Secret>
FIREBASE_SERVICE_ACCOUNT_JSON=<JSON из Firebase Console → Service accounts → Generate key>
```

**Важно:** Для входа через Яндекс обязателен `FIREBASE_SERVICE_ACCOUNT_JSON` — без него бэкенд не сможет создать custom token.
