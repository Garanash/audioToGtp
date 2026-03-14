"""
Фоновая задача: разделение аудио через Demucs в отдельном процессе.
Выполняется в Celery worker, не блокирует API.
"""

import base64
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

from celery_app import celery_app
import redis

from config import (
    CACHE_KEY_PREFIX,
    CACHE_TTL_SECONDS,
    ERROR_KEY_PREFIX,
    GTP_INPUT_KEY_PREFIX,
    GTP_RESULT_KEY_PREFIX,
    GTP_STATUS_KEY_PREFIX,
    INPUT_KEY_PREFIX,
    MIDI_INPUT_KEY_PREFIX,
    MIDI_RESULT_KEY_PREFIX,
    MIDI_STATUS_KEY_PREFIX,
    PROGRESS_KEY_PREFIX,
    RESULT_KEY_PREFIX,
    RESULT_TTL_SECONDS,
    STATUS_KEY_PREFIX,
)

STEM_NAMES_6 = ("drums", "bass", "other", "vocals", "guitar", "piano")
STEM_NAMES_4 = ("drums", "bass", "other", "vocals")


def _get_redis():
    from config import REDIS_URL
    return redis.from_url(REDIS_URL, decode_responses=False)


def _get_demucs_device() -> str:
    """cpu или cuda если доступна (переменная DEMUCS_DEVICE)."""
    device = os.environ.get("DEMUCS_DEVICE", "cpu").strip().lower()
    if device == "cuda":
        try:
            import torch
            if torch.cuda.is_available():
                return "cuda"
        except ImportError:
            pass
        return "cpu"
    return device


def _run_demucs(in_path: Path, out_dir: Path) -> tuple[str, list[str]]:
    """Запускает demucs, возвращает (used_model, stem_names)."""
    device = _get_demucs_device()
    last_stderr = ""
    for model_name, stem_names in [("htdemucs_6s", STEM_NAMES_6), ("htdemucs", STEM_NAMES_4)]:
        cmd = [
            sys.executable, "-m", "demucs_infer",
            "-n", model_name,
            "--segment", "5" if model_name == "htdemucs_6s" else "7",
            "-d", device,
            "-o", str(out_dir),
            str(in_path),
        ]
        try:
            proc = subprocess.run(cmd, capture_output=True, timeout=1200, text=True)
            last_stderr = (proc.stderr or "")[:500]
            if proc.returncode == 0:
                return model_name, list(stem_names)
        except subprocess.TimeoutExpired:
            last_stderr = "Превышено время ожидания (20 мин). Попробуйте трек короче."
    err_msg = "Demucs не смог разделить аудио"
    if last_stderr:
        err_msg = f"{err_msg}: {last_stderr}"
    raise RuntimeError(err_msg)


def _decode_separation_input(raw: bytes) -> tuple[bytes, str, str | None]:
    """
    Поддерживает оба формата input:
    1) legacy: сырые bytes аудио
    2) json: { contentB64, ext, contentHash }
    """
    try:
        payload = json.loads(raw.decode("utf-8"))
        if isinstance(payload, dict) and isinstance(payload.get("contentB64"), str):
            content = base64.b64decode(payload["contentB64"])
            ext = payload.get("ext") if isinstance(payload.get("ext"), str) else ".wav"
            content_hash = payload.get("contentHash") if isinstance(payload.get("contentHash"), str) else None
            if not ext.startswith("."):
                ext = ".wav"
            return content, ext, content_hash
    except Exception:
        pass
    return raw, ".wav", None


def _progress_heartbeat(r, progress_key: str, stop_event: threading.Event, ttl: int):
    """Фоновая задача: постепенно увеличивает progress 20->90 каждые 8 сек."""
    for p in range(20, 91, 5):
        if stop_event.is_set():
            return
        r.setex(progress_key, ttl, str(p).encode("utf-8"))
        for _ in range(16):
            if stop_event.is_set():
                return
            time.sleep(0.5)


@celery_app.task(bind=True, name="tasks.run_separation")
def run_separation(self, task_id: str, content_hash: str | None, file_ext: str = ".wav"):
    """
    Читает входной файл из Redis input:{task_id}, запускает Demucs,
    сохраняет результат в result:{task_id} и при наличии content_hash — в кеш sep:v1:{hash}.
    """
    r = _get_redis()
    input_key = f"{INPUT_KEY_PREFIX}{task_id}"
    result_key = f"{RESULT_KEY_PREFIX}{task_id}"
    status_key = f"{STATUS_KEY_PREFIX}{task_id}"
    progress_key = f"{PROGRESS_KEY_PREFIX}{task_id}"

    if not file_ext or not file_ext.startswith("."):
        file_ext = ".wav"

    try:
        r.set(status_key, "processing", ex=RESULT_TTL_SECONDS)
        r.setex(progress_key, RESULT_TTL_SECONDS, b"15")
        raw = r.get(input_key)
        if not raw:
            r.set(status_key, "failed", ex=RESULT_TTL_SECONDS)
            return {"error": "Входные данные истекли или не найдены"}
        content, parsed_ext, parsed_hash = _decode_separation_input(raw)
        if parsed_hash:
            content_hash = parsed_hash
        if parsed_ext:
            file_ext = parsed_ext

        workdir = Path(tempfile.mkdtemp())
        stop_heartbeat = threading.Event()
        heartbeat = threading.Thread(
            target=_progress_heartbeat,
            args=(r, progress_key, stop_heartbeat, RESULT_TTL_SECONDS),
        )
        heartbeat.daemon = True
        heartbeat.start()
        try:
            in_dir = workdir / "input"
            in_dir.mkdir()
            in_file = in_dir / f"audio{file_ext}"
            in_file.write_bytes(content)
            out_dir = workdir / "separated"
            out_dir.mkdir()

            used_model, stem_names = _run_demucs(in_file, out_dir)
            model_dir = out_dir / used_model
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
                stop_heartbeat.set()
                r.set(status_key, "failed", ex=RESULT_TTL_SECONDS)
                return {"error": "Недостаточно stems"}

            stop_heartbeat.set()
            r.setex(progress_key, RESULT_TTL_SECONDS, b"100")
            import json
            result_json = json.dumps(result).encode("utf-8")
            r.setex(result_key, RESULT_TTL_SECONDS, result_json)
            r.set(status_key, "completed", ex=RESULT_TTL_SECONDS)

            if content_hash:
                cache_key = f"{CACHE_KEY_PREFIX}{content_hash}"
                r.setex(cache_key, CACHE_TTL_SECONDS, result_json)

            return {"ok": True, "stems_keys": list(result.keys())}
        except Exception as e:
            stop_heartbeat.set()
            err_key = f"{ERROR_KEY_PREFIX}{task_id}"
            err_msg = str(e)[:500] if str(e) else "Неизвестная ошибка"
            r.setex(err_key, RESULT_TTL_SECONDS, err_msg.encode("utf-8"))
            r.set(status_key, "failed", ex=RESULT_TTL_SECONDS)
            raise
        finally:
            shutil.rmtree(workdir, ignore_errors=True)
    except Exception as e:
        err_key = f"{ERROR_KEY_PREFIX}{task_id}"
        err_msg = str(e)[:500] if str(e) else "Неизвестная ошибка"
        try:
            r.setex(err_key, RESULT_TTL_SECONDS, err_msg.encode("utf-8"))
        except Exception:
            pass
        r.set(status_key, "failed", ex=RESULT_TTL_SECONDS)
        raise


@celery_app.task(bind=True, name="tasks.run_midi_conversion")
def run_midi_conversion(self, task_id: str):
    """
    Асинхронная конвертация stems (base64 WAV) -> MIDI track data.
    """
    r = _get_redis()
    input_key = f"{MIDI_INPUT_KEY_PREFIX}{task_id}"
    result_key = f"{MIDI_RESULT_KEY_PREFIX}{task_id}"
    status_key = f"{MIDI_STATUS_KEY_PREFIX}{task_id}"
    progress_key = f"{PROGRESS_KEY_PREFIX}{task_id}"
    try:
        r.set(status_key, "processing", ex=RESULT_TTL_SECONDS)
        r.setex(progress_key, RESULT_TTL_SECONDS, b"20")
        raw = r.get(input_key)
        if not raw:
            r.set(status_key, "failed", ex=RESULT_TTL_SECONDS)
            return {"error": "Входные данные не найдены"}

        payload = json.loads(raw.decode("utf-8"))
        stems_b64 = payload.get("stems") or {}
        multi_track = bool(payload.get("multiTrack", True))
        accuracy_mode = payload.get("accuracyMode", "balanced")
        stems_bytes: dict[str, bytes] = {}
        for key, b64 in stems_b64.items():
            if isinstance(b64, str) and b64:
                try:
                    stems_bytes[key] = base64.b64decode(b64)
                except Exception:
                    continue
        if not stems_bytes:
            r.set(status_key, "failed", ex=RESULT_TTL_SECONDS)
            return {"error": "Нет валидных stems"}

        try:
            from midi_service import convert_audio_to_midi_tracks
        except ImportError:
            from server.midi_service import convert_audio_to_midi_tracks

        r.setex(progress_key, RESULT_TTL_SECONDS, b"60")
        tracks = convert_audio_to_midi_tracks(
            stems_bytes,
            multi_track=multi_track,
            accuracy_mode=accuracy_mode,
        )
        result_json = json.dumps({"tracks": tracks}).encode("utf-8")
        r.setex(result_key, RESULT_TTL_SECONDS, result_json)
        r.setex(progress_key, RESULT_TTL_SECONDS, b"100")
        r.set(status_key, "completed", ex=RESULT_TTL_SECONDS)
        return {"ok": True, "tracks": len(tracks)}
    except Exception:
        r.set(status_key, "failed", ex=RESULT_TTL_SECONDS)
        raise


@celery_app.task(bind=True, name="tasks.run_gtp_conversion")
def run_gtp_conversion(self, task_id: str):
    """
    Асинхронная конвертация MIDI tracks -> GP5 bytes.
    """
    r = _get_redis()
    input_key = f"{GTP_INPUT_KEY_PREFIX}{task_id}"
    result_key = f"{GTP_RESULT_KEY_PREFIX}{task_id}"
    status_key = f"{GTP_STATUS_KEY_PREFIX}{task_id}"
    progress_key = f"{PROGRESS_KEY_PREFIX}{task_id}"
    try:
        r.set(status_key, "processing", ex=RESULT_TTL_SECONDS)
        r.setex(progress_key, RESULT_TTL_SECONDS, b"20")
        raw = r.get(input_key)
        if not raw:
            r.set(status_key, "failed", ex=RESULT_TTL_SECONDS)
            return {"error": "Входные данные не найдены"}

        payload = json.loads(raw.decode("utf-8"))
        try:
            from backend.schemas import ConvertRequest
            from backend.services.gtp_service import convert_to_gp5
        except Exception:
            from schemas import ConvertRequest
            from services.gtp_service import convert_to_gp5

        body = ConvertRequest.model_validate(payload)
        gp5_bytes = convert_to_gp5(body)
        r.setex(result_key, RESULT_TTL_SECONDS, gp5_bytes)
        r.setex(progress_key, RESULT_TTL_SECONDS, b"100")
        r.set(status_key, "completed", ex=RESULT_TTL_SECONDS)
        return {"ok": True, "size": len(gp5_bytes)}
    except Exception:
        r.set(status_key, "failed", ex=RESULT_TTL_SECONDS)
        raise
