"""
Конвертация аудио в MIDI через библиотеку sound-to-midi (tiagoft/audio_to_midi).
Монофоническая конвертация по каждому стему, результат — дорожки в формате API.
Импорт sound-to-midi выполняется лениво, чтобы сервер стартовал и без него.
"""

import tempfile
from pathlib import Path
from typing import Any
from typing import Literal

_CACHED_AVAILABLE: bool | None = None
_IMPORT_ERROR = ""

# Порядок и имена стемов для мультитрека
STEM_ORDER = ("vocals", "drums", "bass", "guitar", "piano", "other")
PROGRAM_BY_INSTRUMENT = {
    "vocals": 52,
    "drums": 0,
    "bass": 33,
    "guitar": 24,
    "piano": 0,
    "other": 0,
}

POST_PROCESS = {
    "vocals": {"min_duration": 0.06, "merge_gap": 0.03, "pitch": (36, 96)},
    "drums": {"min_duration": 0.03, "merge_gap": 0.02, "pitch": None},
    "bass": {"min_duration": 0.08, "merge_gap": 0.05, "pitch": (28, 67)},
    "guitar": {"min_duration": 0.06, "merge_gap": 0.04, "pitch": (40, 88)},
    "piano": {"min_duration": 0.05, "merge_gap": 0.03, "pitch": (21, 108)},
    "other": {"min_duration": 0.05, "merge_gap": 0.03, "pitch": None},
}

AccuracyMode = Literal["balanced", "max", "ultra", "extreme"]
ACCURACY_POST_PROCESS = {
    "balanced": {"min_duration_mul": 1.0, "merge_gap_mul": 1.0, "duplicate_window": 0.02},
    "max": {"min_duration_mul": 0.92, "merge_gap_mul": 0.85, "duplicate_window": 0.016},
    "ultra": {"min_duration_mul": 0.85, "merge_gap_mul": 0.65, "duplicate_window": 0.012},
    "extreme": {"min_duration_mul": 0.72, "merge_gap_mul": 0.5, "duplicate_window": 0.009},
}


def _remove_micro_duplicates(
    prepared: list[dict[str, Any]],
    duplicate_window: float,
) -> list[dict[str, Any]]:
    if not prepared:
        return prepared
    cleaned: list[dict[str, Any]] = []
    for note in prepared:
        duplicate = False
        for prev in reversed(cleaned[-4:]):
            same_pitch = prev["pitch"] == note["pitch"]
            near_start = abs(prev["startTime"] - note["startTime"]) <= duplicate_window
            overlaps = note["startTime"] <= prev["endTime"] and prev["startTime"] <= note["endTime"]
            if same_pitch and near_start and overlaps and prev["velocity"] >= note["velocity"]:
                duplicate = True
                break
        if not duplicate:
            cleaned.append(note)
    return cleaned


def _post_process_notes(
    notes: list[dict[str, Any]],
    instrument: str,
    accuracy_mode: AccuracyMode = "balanced",
) -> list[dict[str, Any]]:
    cfg = POST_PROCESS.get(instrument, POST_PROCESS["other"])
    accuracy_cfg = ACCURACY_POST_PROCESS.get(accuracy_mode, ACCURACY_POST_PROCESS["balanced"])
    min_duration = float(cfg["min_duration"]) * float(accuracy_cfg["min_duration_mul"])
    merge_gap = float(cfg["merge_gap"]) * float(accuracy_cfg["merge_gap_mul"])
    duplicate_window = float(accuracy_cfg["duplicate_window"])
    pitch_range = cfg["pitch"]

    prepared: list[dict[str, Any]] = []
    for n in notes:
        start = max(0.0, float(n["startTime"]))
        end = max(start + min_duration, float(n["endTime"]))
        pitch = int(round(float(n["pitch"])))
        if pitch_range is not None:
            pitch = max(int(pitch_range[0]), min(int(pitch_range[1]), pitch))
        vel = max(1, min(127, int(n.get("velocity", 100))))
        confidence = max(0.0, min(1.0, float(n.get("confidence", vel / 127.0))))
        if end - start < min_duration:
            continue
        prepared.append(
            {
                "pitch": pitch,
                "startTime": start,
                "endTime": end,
                "velocity": vel,
                "confidence": confidence,
            }
        )

    prepared.sort(key=lambda x: (x["startTime"], x["pitch"]))
    prepared = _remove_micro_duplicates(prepared, duplicate_window)
    merged: list[dict[str, Any]] = []
    for n in prepared:
        if merged:
            last = merged[-1]
            if last["pitch"] == n["pitch"] and n["startTime"] - last["endTime"] <= merge_gap:
                last["endTime"] = max(last["endTime"], n["endTime"])
                last["velocity"] = max(last["velocity"], n["velocity"])
                last["confidence"] = max(last.get("confidence", 0.0), n.get("confidence", 0.0))
                continue
        merged.append(n)
    for i in range(len(merged) - 1):
        current = merged[i]
        nxt = merged[i + 1]
        if current["pitch"] == nxt["pitch"] and current["endTime"] > nxt["startTime"]:
            current["endTime"] = max(current["startTime"] + min_duration, nxt["startTime"])
    return merged


def is_available() -> bool:
    global _CACHED_AVAILABLE, _IMPORT_ERROR
    if _CACHED_AVAILABLE is not None:
        return _CACHED_AVAILABLE
    try:
        import librosa  # noqa: F401
        from sound_to_midi.monophonic import wave_to_midi  # noqa: F401
        _CACHED_AVAILABLE = True
        return True
    except Exception as e:
        _IMPORT_ERROR = str(e) if e else "unknown"
        _CACHED_AVAILABLE = False
        return False


def get_import_error() -> str:
    if _CACHED_AVAILABLE is None:
        is_available()
    return _IMPORT_ERROR


def _midi_to_track(
    midi_obj: Any,
    instrument: str,
    accuracy_mode: AccuracyMode = "balanced",
) -> dict[str, Any]:
    """Извлекает ноты из midi (pretty_midi или midiutil через pretty_midi)."""
    notes: list[dict[str, Any]] = []
    if getattr(midi_obj, "instruments", None) is not None:
        for inst in midi_obj.instruments:
            for n in getattr(inst, "notes", []):
                notes.append({
                    "pitch": int(n.pitch),
                    "startTime": float(n.start),
                    "endTime": float(n.end),
                    "velocity": int(getattr(n, "velocity", 100)),
                    "confidence": max(0.05, min(0.95, float(getattr(n, "velocity", 100)) / 127.0)),
                })
        return {
            "instrument": instrument,
            "program": PROGRAM_BY_INSTRUMENT.get(instrument, 0),
            "notes": _post_process_notes(notes, instrument, accuracy_mode),
        }
    import io
    import pretty_midi
    buf = io.BytesIO()
    midi_obj.writeFile(buf)
    buf.seek(0)
    pm = pretty_midi.PrettyMIDI(buf)
    for inst in pm.instruments:
        for n in inst.notes:
            notes.append({
                "pitch": int(n.pitch),
                "startTime": float(n.start),
                "endTime": float(n.end),
                "velocity": int(getattr(n, "velocity", 100)),
                "confidence": max(0.05, min(0.95, float(getattr(n, "velocity", 100)) / 127.0)),
            })
    return {
        "instrument": instrument,
        "program": PROGRAM_BY_INSTRUMENT.get(instrument, 0),
        "notes": _post_process_notes(notes, instrument, accuracy_mode),
    }


def convert_audio_to_midi_tracks(
    stems: dict[str, bytes],
    multi_track: bool = True,
    accuracy_mode: AccuracyMode = "balanced",
) -> list[dict[str, Any]]:
    """
    Конвертирует аудио-буферы (WAV) в дорожки MIDI.
    stems: { "vocals": wav_bytes, "other": wav_bytes, ... }
    multi_track: если True — возвращает все STEM_ORDER (пустые при отсутствии стема);
                 если False — только дорожки с данными.
    Возвращает список { instrument, notes: [ { pitch, startTime, endTime, velocity } ] }.
    """
    if not is_available():
        raise RuntimeError(f"sound-to-midi недоступен: {get_import_error()}")

    import librosa
    from sound_to_midi.monophonic import wave_to_midi

    result_tracks: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory() as workdir:
        workdir_path = Path(workdir)
        for stem_name, wav_bytes in stems.items():
            if not wav_bytes:
                continue
            in_path = workdir_path / f"{stem_name}.wav"
            in_path.write_bytes(wav_bytes)
            try:
                y, sr = librosa.load(str(in_path), sr=None, mono=True)
                midi = wave_to_midi(y, srate=int(sr))
                track = _midi_to_track(midi, stem_name, accuracy_mode)
                result_tracks.append(track)
            except Exception:
                result_tracks.append({"instrument": stem_name, "notes": []})

    if multi_track:
        by_instrument = {t["instrument"]: t for t in result_tracks}
        ordered = [
            by_instrument.get(name, {"instrument": name, "notes": []})
            for name in STEM_ORDER
        ]
        return ordered
    return result_tracks
