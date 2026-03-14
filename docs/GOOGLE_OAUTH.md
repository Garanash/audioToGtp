# Google OAuth для musicvibe.ru

## Откуда взять GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET

**Вариант 1 (проще):** Firebase Console  
1. [Firebase Console](https://console.firebase.google.com/) → проект musicians-d63be  
2. **Authentication** → **Sign-in method** → **Google**  
3. Включите провайдер, если ещё не включён  
4. Раскройте **Web SDK configuration**  
5. Скопируйте **Web client ID** → `GOOGLE_CLIENT_ID`  
6. Скопируйте **Web client secret** → `GOOGLE_CLIENT_SECRET`  

**Вариант 2:** Google Cloud Console  
1. [Google Cloud Console](https://console.cloud.google.com/) → проект, связанный с Firebase  
2. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**  
3. Тип: Web application  
4. **Authorized redirect URIs** — добавьте оба:
   ```
   https://musicvibe.ru/api/auth/google/callback
   http://localhost:8000/auth/google/callback
   ```

## Переменные окружения

Добавьте в `.env` (локально и на сервере):
```
GOOGLE_CLIENT_ID=<Web client ID из Firebase>
GOOGLE_CLIENT_SECRET=<Web client secret из Firebase>
```

**Важно:** `FIREBASE_SERVICE_ACCOUNT_JSON` уже используется для Яндекса — тот же JSON нужен и для Google.

## Локальная разработка

```bash
cp .env.local.example .env.local
```

Файл `.env.local` переопределит `AUTH_REDIRECT_BASE` и `FRONTEND_URL` для localhost. Добавьте в Google OAuth Client redirect URI: `http://localhost:8000/auth/google/callback`.

## Firebase Console

- **Authorized domains:** добавьте `musicvibe.ru` и `www.musicvibe.ru`
- **Sign-in method:** Google можно не включать — мы используем backend OAuth, а не Firebase Redirect
