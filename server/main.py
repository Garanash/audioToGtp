#!/usr/bin/env python3
"""
Backend: разделение аудио (Demucs) и API проектов пользователей.
Запуск: pip install -r requirements.txt && uvicorn main:app --reload
"""

import base64
import json
import os
import shutil
import subprocess
import sys
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

try:
    from google.oauth2 import id_token
    from google.auth.transport import requests as google_requests
    AUTH_AVAILABLE = True
except ImportError:
    AUTH_AVAILABLE = False

app = FastAPI(title="Audio Separation API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PROJECTS_DB = Path(__file__).resolve().parent / "data" / "projects.db"
UPLOADS_DIR = Path(__file__).resolve().parent / "data" / "uploads"


def get_user_id_from_token(authorization: str | None) -> str | None:
    """Извлекает и верифицирует Firebase ID token, возвращает uid или None."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization[7:].strip()
    if not token or not AUTH_AVAILABLE:
        return None
    try:
        request = google_requests.Request()
        claims = id_token.verify_firebase_token(token, request)
        return claims.get("sub")
    except Exception:
        return None


def require_auth(authorization: str | None = Header(None, alias="Authorization")):
    """Зависимость: требует авторизацию, иначе 401."""
    uid = get_user_id_from_token(authorization)
    if not uid:
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    return uid


def _init_db():
    PROJECTS_DB.parent.mkdir(parents=True, exist_ok=True)
    import sqlite3
    conn = sqlite3.connect(PROJECTS_DB)
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            payload TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
    """)
    conn.commit()
    conn.close()


def _get_conn():
    import sqlite3
    _init_db()
    return sqlite3.connect(PROJECTS_DB)


def check_demucs() -> tuple[bool, str]:
    """Проверяет наличие Demucs (demucs-infer)."""
    try:
        r = subprocess.run(
            [sys.executable, "-m", "demucs_infer", "--help"],
            capture_output=True,
            timeout=10,
        )
        return r.returncode == 0, "" if r.returncode == 0 else r.stderr.decode()
    except FileNotFoundError:
        return False, "Python не найден"
    except subprocess.TimeoutExpired:
        return False, "Таймаут проверки"
    except Exception as e:
        return False, str(e)


@app.get("/health")
def health():
    ok, msg = check_demucs()
    return {"status": "ok" if ok else "error", "demucs": ok, "message": msg}


@app.post("/separate")
async def separate(file: UploadFile = File(...)):
    """Разделяет аудио на stems (drums, bass, other, vocals)."""
    ok, _ = check_demucs()
    if not ok:
        raise HTTPException(
            status_code=503,
            detail="Demucs не установлен. Выполните: npm run setup",
        )

    if not file.filename or not any(
        file.filename.lower().endswith(ext) for ext in (".wav", ".mp3", ".flac", ".m4a")
    ):
        raise HTTPException(400, "Поддерживаются WAV, MP3, FLAC, M4A")

    workdir = Path(tempfile.mkdtemp())
    try:
        input_path = workdir / "input"
        input_path.mkdir()
        ext = Path(file.filename).suffix or ".wav"
        in_file = input_path / f"audio{ext}"
        content = await file.read()
        in_file.write_bytes(content)

        out_dir = workdir / "separated"
        out_dir.mkdir()

        stem_names_6 = ("drums", "bass", "other", "vocals", "guitar", "piano")
        stem_names_4 = ("drums", "bass", "other", "vocals")
        used_model = None
        for model_name, stem_names in [("htdemucs_6s", stem_names_6), ("htdemucs", stem_names_4)]:
            cmd = [
                sys.executable, "-m", "demucs_infer",
                "-n", model_name,
                "--segment", "5" if model_name == "htdemucs_6s" else "7",
                "-d", "cpu",
                "-o", str(out_dir),
                str(in_file),
            ]
            proc = subprocess.run(cmd, capture_output=True, timeout=900, text=True)
            if proc.returncode == 0:
                used_model = model_name
                break
            if model_name == "htdemucs_6s":
                continue
            raise HTTPException(500, f"Demucs ошибка: {proc.stderr[:500]}")

        if not used_model:
            raise HTTPException(500, "Не удалось разделить аудио")

        model_dir = out_dir / used_model
        stem_names = stem_names_6 if used_model == "htdemucs_6s" else stem_names_4
        stems_dir = model_dir / "audio"
        if not stems_dir.exists():
            candidates = list(model_dir.iterdir()) if model_dir.exists() else []
            stems_dir = candidates[0] if candidates else stems_dir

        result = {}
        for name in stem_names:
            p = stems_dir / f"{name}.wav"
            if p.exists():
                result[name] = base64.b64encode(p.read_bytes()).decode("ascii")

        if len(result) < 2:
            raise HTTPException(500, "Demucs не вернул stems")

        return result
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


# --- Projects API ---

UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


@app.get("/projects")
def list_projects(user_id: str = Depends(require_auth)):
    conn = _get_conn()
    try:
        rows = conn.execute(
            "SELECT id, name, type, payload, created_at, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC",
            (user_id,),
        ).fetchall()
        out = []
        for row in rows:
            pid, name, ptype, payload_str, created_at, updated_at = row
            payload = json.loads(payload_str) if payload_str else {}
            stem_count = len(payload.get("stem_files", []))
            duration = payload.get("duration")
            midi_count = len(payload.get("midi_files", []))
            notation_count = len(payload.get("notation_files", []))
            out.append({
                "id": pid,
                "name": name,
                "type": ptype,
                "createdAt": created_at,
                "updatedAt": updated_at,
                "stemCount": stem_count or None,
                "duration": duration,
                "midiCount": midi_count or None,
                "notationCount": notation_count or None,
            })
        return out
    finally:
        conn.close()


@app.get("/projects/{project_id}")
def get_project(project_id: str, user_id: str = Depends(require_auth)):
    conn = _get_conn()
    try:
        row = conn.execute(
            "SELECT id, name, type, payload, created_at, updated_at FROM projects WHERE id = ? AND user_id = ?",
            (project_id, user_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Проект не найден")
        pid, name, ptype, payload_str, created_at, updated_at = row
        payload = json.loads(payload_str) if payload_str else {}
        # camelCase для фронта
        if "stem_files" in payload and "stemFiles" not in payload:
            payload["stemFiles"] = payload.pop("stem_files", [])
        return {
            "id": pid,
            "userId": user_id,
            "name": name,
            "type": ptype,
            "createdAt": created_at,
            "updatedAt": updated_at,
            **payload,
        }
    finally:
        conn.close()


@app.post("/projects")
async def create_project(
    user_id: str = Depends(require_auth),
    name: str = Form(...),
    type: str = Form(...),
    duration: str = Form("0"),
    stems: list[UploadFile] = File(default=[]),
):
    if type != "separation" or not stems:
        raise HTTPException(400, "Для типа separation нужны файлы stems")
    project_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    user_dir = UPLOADS_DIR / user_id
    user_dir.mkdir(parents=True, exist_ok=True)
    project_dir = user_dir / project_id
    project_dir.mkdir(parents=True, exist_ok=True)
    stem_files = []
    for f in stems:
        if not f.filename:
            continue
        safe_name = os.path.basename(f.filename)
        path = project_dir / safe_name
        content = await f.read()
        path.write_bytes(content)
        stem_files.append(safe_name)
    duration_num = float(duration) if duration else 0.0
    payload = {"stem_files": stem_files, "duration": duration_num}
    conn = _get_conn()
    try:
        conn.execute(
            "INSERT INTO projects (id, user_id, name, type, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (project_id, user_id, name, type, json.dumps(payload), now, now),
        )
        conn.commit()
    finally:
        conn.close()
    return {
        "id": project_id,
        "userId": user_id,
        "name": name,
        "type": type,
        "stemFiles": stem_files,
        "duration": duration_num,
        "createdAt": now,
        "updatedAt": now,
    }


def get_user_from_header_or_query(
    authorization: str | None = Header(None, alias="Authorization"),
    token: str | None = Query(None),
):
    """Проверка токена из заголовка или query (для скачивания)."""
    uid = get_user_id_from_token(authorization)
    if not uid and token:
        uid = get_user_id_from_token(f"Bearer {token}")
    if not uid:
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    return uid


@app.get("/projects/{project_id}/stems/{filename}")
def get_project_stem(
    project_id: str,
    filename: str,
    user_id: str = Depends(get_user_from_header_or_query),
):
    path = UPLOADS_DIR / user_id / project_id / filename
    if not path.is_file():
        raise HTTPException(404, "Файл не найден")
    return FileResponse(path, media_type="audio/wav", filename=filename)


@app.delete("/projects/{project_id}")
def delete_project(project_id: str, user_id: str = Depends(require_auth)):
    conn = _get_conn()
    try:
        cur = conn.execute("SELECT id FROM projects WHERE id = ? AND user_id = ?", (project_id, user_id))
        if not cur.fetchone():
            raise HTTPException(404, "Проект не найден")
        conn.execute("DELETE FROM projects WHERE id = ? AND user_id = ?", (project_id, user_id))
        conn.commit()
    finally:
        conn.close()
    project_dir = UPLOADS_DIR / user_id / project_id
    if project_dir.exists():
        shutil.rmtree(project_dir, ignore_errors=True)
    return {"ok": True}
