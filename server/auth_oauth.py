"""
OAuth для Яндекса: обмен кода на Firebase custom token.
Требует: YANDEX_CLIENT_ID, YANDEX_CLIENT_SECRET, FIREBASE_SERVICE_ACCOUNT_JSON,
AUTH_REDIRECT_BASE, FRONTEND_URL.
"""

import json
import os
import urllib.parse

from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse

router = APIRouter(prefix="/auth", tags=["auth"])

# Env
YANDEX_CLIENT_ID = os.environ.get("YANDEX_CLIENT_ID", "")
YANDEX_CLIENT_SECRET = os.environ.get("YANDEX_CLIENT_SECRET", "")
AUTH_REDIRECT_BASE = os.environ.get("AUTH_REDIRECT_BASE", "http://localhost:8000")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")
FIREBASE_SERVICE_ACCOUNT_JSON = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON", "")

_firebase_admin = None


def _get_firebase_admin():
    global _firebase_admin
    if _firebase_admin is not None:
        return _firebase_admin
    if not FIREBASE_SERVICE_ACCOUNT_JSON:
        return None
    try:
        import firebase_admin
        from firebase_admin import auth as firebase_auth, credentials

        if not firebase_admin._apps:
            data = json.loads(FIREBASE_SERVICE_ACCOUNT_JSON)
            cred = credentials.Certificate(data)
            firebase_admin.initialize_app(cred)
        _firebase_admin = firebase_auth
        return _firebase_admin
    except Exception:
        return None


def _create_custom_token(uid: str) -> str | None:
    fb = _get_firebase_admin()
    if not fb:
        return None
    try:
        return fb.create_custom_token(uid)
    except Exception:
        return None


# --- Yandex OAuth ---

YANDEX_AUTH_URL = "https://oauth.yandex.ru/authorize"
YANDEX_TOKEN_URL = "https://oauth.yandex.ru/token"
YANDEX_USER_INFO_URL = "https://login.yandex.ru/info"


@router.get("/yandex")
def auth_yandex_start():
    """Редирект на страницу авторизации Яндекса."""
    if not YANDEX_CLIENT_ID:
        raise HTTPException(
            status_code=503,
            detail="Yandex OAuth не настроен. Добавьте YANDEX_CLIENT_ID и YANDEX_CLIENT_SECRET в .env",
        )
    redirect_uri = f"{AUTH_REDIRECT_BASE}/auth/yandex/callback"
    params = {
        "response_type": "code",
        "client_id": YANDEX_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "force_confirm": "yes",
    }
    url = f"{YANDEX_AUTH_URL}?{urllib.parse.urlencode(params)}"
    return RedirectResponse(url)


@router.get("/yandex/callback")
async def auth_yandex_callback(code: str | None = None, error: str | None = None):
    """Обмен кода на токен, получение профиля, создание Firebase custom token."""
    if error:
        return RedirectResponse(f"{FRONTEND_URL}#auth_error={urllib.parse.quote(error)}")
    if not code:
        return RedirectResponse(f"{FRONTEND_URL}#auth_error=no_code")
    if not YANDEX_CLIENT_ID or not YANDEX_CLIENT_SECRET:
        return RedirectResponse(f"{FRONTEND_URL}#auth_error=config")

    redirect_uri = f"{AUTH_REDIRECT_BASE}/auth/yandex/callback"
    body = {
        "grant_type": "authorization_code",
        "code": code,
        "client_id": YANDEX_CLIENT_ID,
        "client_secret": YANDEX_CLIENT_SECRET,
    }

    import httpx

    async with httpx.AsyncClient() as client:
        resp = await client.post(YANDEX_TOKEN_URL, data=body)
        if resp.status_code != 200:
            return RedirectResponse(f"{FRONTEND_URL}#auth_error=token_exchange")
        data = resp.json()
        access_token = data.get("access_token")
        if not access_token:
            return RedirectResponse(f"{FRONTEND_URL}#auth_error=no_token")

        user_resp = await client.get(
            YANDEX_USER_INFO_URL,
            headers={"Authorization": f"OAuth {access_token}"},
            params={"format": "json"},
        )
        if user_resp.status_code != 200:
            return RedirectResponse(f"{FRONTEND_URL}#auth_error=user_info")
        profile = user_resp.json()
        uid = profile.get("id")
        if not uid:
            return RedirectResponse(f"{FRONTEND_URL}#auth_error=no_uid")

        firebase_uid = f"yandex_{uid}"
        custom_token = _create_custom_token(firebase_uid)
        if not custom_token:
            return RedirectResponse(f"{FRONTEND_URL}#auth_error=firebase_token")

        return RedirectResponse(f"{FRONTEND_URL}#auth_token={urllib.parse.quote(custom_token)}")
