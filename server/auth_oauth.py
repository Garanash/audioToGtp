"""
OAuth для Яндекса и Google: обмен кода на Firebase custom token.
Требует: YANDEX_* / GOOGLE_*, FIREBASE_SERVICE_ACCOUNT_JSON, AUTH_REDIRECT_BASE, FRONTEND_URL.
"""

import base64 as b64
import json
import os
import urllib.parse

from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse

router = APIRouter(prefix="/auth", tags=["auth"])

# Env
YANDEX_CLIENT_ID = os.environ.get("YANDEX_CLIENT_ID", "")
YANDEX_CLIENT_SECRET = os.environ.get("YANDEX_CLIENT_SECRET", "")
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
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


def _build_redirect_url(custom_token: str, profile_b64: str) -> str:
    return f"{FRONTEND_URL}#auth_token={urllib.parse.quote(custom_token)}&auth_profile={urllib.parse.quote(profile_b64)}"


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

        display_name = (
            profile.get("real_name")
            or profile.get("display_name")
            or profile.get("first_name", "")
            + (" " + profile.get("last_name", "") if profile.get("last_name") else "")
            or profile.get("login", "")
        ).strip() or None
        photo_url = None
        avatar_id = profile.get("default_avatar_id") or profile.get("avatar_id")
        if avatar_id and not profile.get("is_avatar_empty"):
            photo_url = f"https://avatars.yandex.net/get-yapic/{avatar_id}/islands-200"
        email = profile.get("default_email") or profile.get("email")

        profile_data = {"displayName": display_name, "photoURL": photo_url, "email": email}
        profile_b64 = b64.urlsafe_b64encode(json.dumps(profile_data, ensure_ascii=False).encode()).decode()
        redirect_url = _build_redirect_url(custom_token, profile_b64)
        return RedirectResponse(redirect_url)


# --- Google OAuth ---

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"


@router.get("/google")
def auth_google_start():
    """Редирект на страницу авторизации Google."""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=503,
            detail="Google OAuth не настроен. Добавьте GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET в .env",
        )
    redirect_uri = f"{AUTH_REDIRECT_BASE}/auth/google/callback"
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "consent",
    }
    url = f"{GOOGLE_AUTH_URL}?{urllib.parse.urlencode(params)}"
    return RedirectResponse(url)


@router.get("/google/callback")
async def auth_google_callback(code: str | None = None, error: str | None = None):
    """Обмен кода на токен, получение профиля, создание Firebase custom token."""
    if error:
        return RedirectResponse(f"{FRONTEND_URL}#auth_error={urllib.parse.quote(error)}")
    if not code:
        return RedirectResponse(f"{FRONTEND_URL}#auth_error=no_code")
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        return RedirectResponse(f"{FRONTEND_URL}#auth_error=config")

    redirect_uri = f"{AUTH_REDIRECT_BASE}/auth/google/callback"

    import httpx

    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if token_resp.status_code != 200:
            return RedirectResponse(f"{FRONTEND_URL}#auth_error=token_exchange")
        token_data = token_resp.json()
        access_token = token_data.get("access_token")
        if not access_token:
            return RedirectResponse(f"{FRONTEND_URL}#auth_error=no_token")

        user_resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if user_resp.status_code != 200:
            return RedirectResponse(f"{FRONTEND_URL}#auth_error=user_info")
        profile = user_resp.json()
        sub = profile.get("id") or profile.get("sub")
        if not sub:
            return RedirectResponse(f"{FRONTEND_URL}#auth_error=no_uid")

        firebase_uid = f"google_{sub}"
        custom_token = _create_custom_token(firebase_uid)
        if not custom_token:
            return RedirectResponse(f"{FRONTEND_URL}#auth_error=firebase_token")

        display_name = profile.get("name") or profile.get("email", "").split("@")[0] or None
        photo_url = profile.get("picture")
        email = profile.get("email")

        profile_data = {"displayName": display_name, "photoURL": photo_url, "email": email}
        profile_b64 = b64.urlsafe_b64encode(json.dumps(profile_data, ensure_ascii=False).encode()).decode()
        redirect_url = _build_redirect_url(custom_token, profile_b64)
        return RedirectResponse(redirect_url)
