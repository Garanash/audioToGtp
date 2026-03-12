"""
Сервис конвертации MIDI-дорожок в формат Guitar Pro (.gp5).
Единственная ответственность: принять валидные данные и вернуть bytes файла.
"""

import logging
from io import BytesIO

try:
    from backend.schemas import ConvertRequest
except ImportError:
    from schemas import ConvertRequest

logger = logging.getLogger(__name__)

_GTP_AVAILABLE = False
_GTP_IMPORT_ERROR = ""

try:
    import guitarpro
    from guitarpro.models import (
        Beat,
        BeatStatus,
        Duration,
        GuitarString,
        KeySignature,
        MeasureHeader,
        Note,
        NoteType,
        Song,
        TimeSignature,
        Track,
    )
    _GTP_AVAILABLE = True
except Exception as e:
    _GTP_AVAILABLE = False
    _GTP_IMPORT_ERROR = str(e) if e else "unknown"

KEY_TO_FIFTHS = {
    "C": (0, 0), "Am": (0, 1), "G": (1, 0), "Em": (1, 1), "D": (2, 0), "Bm": (2, 1),
    "A": (3, 0), "F#m": (3, 1), "E": (4, 0), "C#m": (4, 1), "B": (5, 0), "G#m": (5, 1),
    "F#": (6, 0), "D#m": (6, 1), "C#": (7, 0), "A#m": (7, 1),
    "F": (-1, 0), "Dm": (-1, 1), "Bb": (-2, 0), "Gm": (-2, 1), "Eb": (-3, 0), "Cm": (-3, 1),
    "Ab": (-4, 0), "Fm": (-4, 1), "Db": (-5, 0), "Bbm": (-5, 1),
    "Gb": (-6, 0), "Ebm": (-6, 1), "Cb": (-7, 0), "Abm": (-7, 1),
}

# Один такт в тиках (quarter = 960 в GP)
QUARTER_TIME = 960
MAX_FRET = 24
MIN_DURATION_TICKS = QUARTER_TIME // 8  # 1/32
QUANTIZE_1_8 = QUARTER_TIME // 2
QUANTIZE_1_16 = QUARTER_TIME // 4
QUANTIZE_1_32 = QUARTER_TIME // 8
MAX_QUANTIZE_SHIFT_RATIO = 0.25

INSTRUMENT_PRESETS = {
    "guitar": {
        "program": 24,
        # String 1..6 (high E .. low E)
        "strings": [64, 59, 55, 50, 45, 40],
    },
    "bass": {
        "program": 33,
        # String 1..4 (G .. E)
        "strings": [43, 38, 33, 28],
    },
    "drums": {
        "program": 0,
        "strings": [64, 59, 55, 50, 45, 40],
    },
    "piano": {
        "program": 0,
        "strings": [64, 59, 55, 50, 45, 40],
    },
    "vocals": {
        "program": 52,
        "strings": [64, 59, 55, 50, 45, 40],
    },
    "other": {
        "program": 24,
        "strings": [64, 59, 55, 50, 45, 40],
    },
}


class GTPUnavailableError(Exception):
    """Библиотека guitarpro не установлена или недоступна."""


def _seconds_to_ticks(seconds: float, tempo: int) -> int:
    """Переводит время в секундах в тики GP (четверть = 960)."""
    quarter_per_sec = tempo / 60.0
    quarters = seconds * quarter_per_sec
    return int(quarters * QUARTER_TIME)


def _quantize_ticks(value: int, step: int) -> int:
    if step <= 0:
        return value
    return int(round(value / step) * step)


def _quantize_ticks_limited(value: int, step: int, max_shift_ratio: float = MAX_QUANTIZE_SHIFT_RATIO) -> int:
    """Квантование с ограничением максимального смещения для сохранения оригинального грува."""
    if step <= 0:
        return value
    snapped = _quantize_ticks(value, step)
    max_shift = int(step * max_shift_ratio)
    if abs(snapped - value) <= max_shift:
        return snapped
    return value + (max_shift if snapped > value else -max_shift)


def _adaptive_quantize_step(notes: list, tempo: int) -> int:
    """
    Выбирает сетку квантования по плотности нот:
    - плотная партия -> 1/32
    - средняя -> 1/16
    - редкая -> 1/8
    """
    if not notes:
        return QUANTIZE_1_16

    starts = sorted(_seconds_to_ticks(n.startTime, tempo) for n in notes)
    if len(starts) < 2:
        return QUANTIZE_1_8

    deltas = [starts[i + 1] - starts[i] for i in range(len(starts) - 1)]
    avg_delta = sum(deltas) / len(deltas)

    if avg_delta <= QUARTER_TIME / 6:  # очень плотная фраза
        return QUANTIZE_1_32
    if avg_delta <= QUARTER_TIME / 2:
        return QUANTIZE_1_16
    return QUANTIZE_1_8


def _is_chord_or_rhythm_track(notes: list, tempo: int) -> bool:
    """
    Определяет, что дорожка больше похожа на аккордовую/ритм-партию.
    """
    if len(notes) < 8:
        return False
    starts = sorted(_seconds_to_ticks(n.startTime, tempo) for n in notes)
    near_same = 0
    for i in range(1, len(starts)):
        if abs(starts[i] - starts[i - 1]) <= QUANTIZE_1_32:
            near_same += 1
    return near_same / max(1, len(starts) - 1) > 0.33


def _quantize_step_for_track(notes: list, tempo: int, instrument_kind: str) -> int:
    """
    Сочетает плотность нот и тип инструмента:
    - bass: более грубая сетка по умолчанию
    - chord/rhythm: 1/8..1/16
    - lead: допускаем 1/32
    """
    base = _adaptive_quantize_step(notes, tempo)
    if instrument_kind == "bass":
        return max(base, QUANTIZE_1_16)
    if _is_chord_or_rhythm_track(notes, tempo):
        return max(base, QUANTIZE_1_16)
    return base


def _normalize_instrument(name: str) -> str:
    lower = (name or "").strip().lower()
    if any(k in lower for k in ("drum", "перкус", "ударн", "percussion")):
        return "drums"
    if any(k in lower for k in ("bass", "бас")):
        return "bass"
    if any(k in lower for k in ("guitar", "гитар")):
        return "guitar"
    if any(k in lower for k in ("piano", "пиан", "keys", "keyboard")):
        return "piano"
    if any(k in lower for k in ("vocal", "вокал", "voice")):
        return "vocals"
    return "other"


def _apply_track_strings(track: Track, open_strings: list[int]) -> None:
    """
    Назначает количество струн и строй для дорожки.
    Для несовместимых версий библиотеки оставляет значения по умолчанию.
    """
    try:
        track.strings.clear()
        for idx, midi_pitch in enumerate(open_strings, start=1):
            # idx=1 — верхняя струна
            track.strings.append(GuitarString(idx, midi_pitch))
    except Exception:
        logger.debug("Cannot assign custom strings, fallback to default", exc_info=True)


def _pick_string_and_fret(
    pitch: int,
    open_strings: list[int],
    last_fret: int | None = None,
    phrase_anchor: int | None = None,
) -> tuple[int, int]:
    """
    Возвращает (string_number, fret) с минимальным скачком по позиции.
    """
    candidates: list[tuple[float, int, int]] = []
    for string_number, open_pitch in enumerate(open_strings, start=1):
        fret = pitch - open_pitch
        if 0 <= fret <= MAX_FRET:
            dist_last = abs(fret - (last_fret if last_fret is not None else fret))
            dist_anchor = abs(fret - (phrase_anchor if phrase_anchor is not None else fret))
            score = dist_last * 0.8 + dist_anchor * 1.2 + fret * 0.04
            candidates.append((score, string_number, fret))

    if candidates:
        _, string_number, fret = min(candidates, key=lambda x: x[0])
        return string_number, fret

    # fallback: ближайшая струна + клип ладов
    best_string = 1
    best_fret = 0
    best_score = float("inf")
    for string_number, open_pitch in enumerate(open_strings, start=1):
        raw_fret = pitch - open_pitch
        fret = max(0, min(MAX_FRET, raw_fret))
        score = abs(raw_fret - fret)
        if score < best_score:
            best_score = score
            best_string = string_number
            best_fret = fret
    return best_string, best_fret


def _smooth_fret_position(
    candidate_fret: int,
    phrase_fret_anchor: int | None,
    previous_fret: int | None,
    anchor_limit: int = 7,
    previous_limit: int = 6,
) -> int:
    """
    Сглаживает резкие скачки по грифу:
    - держим ноту около фразового якоря
    - ограничиваем резкие прыжки относительно предыдущей ноты
    """
    fret = candidate_fret
    if phrase_fret_anchor is not None and abs(fret - phrase_fret_anchor) > anchor_limit:
        direction = 1 if fret > phrase_fret_anchor else -1
        fret = phrase_fret_anchor + direction * anchor_limit
    if previous_fret is not None and abs(fret - previous_fret) > previous_limit:
        direction = 1 if fret > previous_fret else -1
        fret = previous_fret + direction * previous_limit
    return max(0, min(MAX_FRET, fret))


def _build_song(request: ConvertRequest) -> Song:
    """Строит объект Song из валидированного запроса."""
    song = Song()
    song.tempo = request.tempo
    song.title = "Exported"
    song.measureHeaders.clear()
    song.tracks.clear()
    if getattr(request, "key", None) and request.key and request.key.strip():
        key_clean = request.key.strip()
        parsed = KEY_TO_FIFTHS.get(key_clean) or KEY_TO_FIFTHS.get(
            key_clean[0].upper() + key_clean[1:].lower() if len(key_clean) > 1 else key_clean
        )
        if parsed is not None:
            try:
                song.key = KeySignature(parsed)
            except Exception:
                pass

    source_tempo = getattr(request, "baseTempo", None) or request.tempo
    accuracy_mode = getattr(request, "accuracyMode", "balanced")
    if accuracy_mode == "extreme":
        quantize_shift_ratio = 0.06
        anchor_limit = 3
        previous_limit = 2
    elif accuracy_mode == "ultra":
        quantize_shift_ratio = 0.10
        anchor_limit = 4
        previous_limit = 3
    elif accuracy_mode == "max":
        quantize_shift_ratio = 0.15
        anchor_limit = 5
        previous_limit = 4
    else:
        quantize_shift_ratio = MAX_QUANTIZE_SHIFT_RATIO
        anchor_limit = 7
        previous_limit = 6

    # Вычисляем длительность в тиках по всем нотам (по базовому темпу раскладки)
    max_end_ticks = 0
    for track_in in request.tracks:
        for n in track_in.notes:
            end_ticks = _seconds_to_ticks(n.endTime, source_tempo)
            if end_ticks > max_end_ticks:
                max_end_ticks = end_ticks

    # Минимум один такт 4/4
    measure_length = QUARTER_TIME * 4
    num_measures = max(1, (max_end_ticks + measure_length - 1) // measure_length)

    for i in range(num_measures):
        header = MeasureHeader()
        header.timeSignature = TimeSignature()
        header.timeSignature.numerator = 4
        header.timeSignature.denominator = Duration(4)
        if i == 0:
            header.start = 0
        else:
            header.start = i * measure_length
        song.measureHeaders.append(header)

    for idx, track_in in enumerate(request.tracks):
        track = Track(song)
        track.number = idx + 1
        track.name = track_in.instrument[:128]
        instrument_kind = _normalize_instrument(track_in.instrument)
        preset = INSTRUMENT_PRESETS.get(instrument_kind, INSTRUMENT_PRESETS["guitar"])
        track.isPercussionTrack = instrument_kind == "drums"
        if track.isPercussionTrack:
            track.channel.channel = 9
        track.channel.instrument = (
            track_in.program if track_in.program is not None else preset["program"]
        )
        _apply_track_strings(track, preset["strings"])
        song.tracks.append(track)

    # Заполняем ноты по дорожкам (группируем по старту в аккорды)
    for track_idx, track_in in enumerate(request.tracks):
        track = song.tracks[track_idx]
        instrument_kind = _normalize_instrument(track_in.instrument)
        preset = INSTRUMENT_PRESETS.get(instrument_kind, INSTRUMENT_PRESETS["guitar"])
        open_strings = preset["strings"]
        notes_input = []
        for note in track_in.notes:
            confidence = getattr(note, "confidence", None)
            if confidence is not None:
                if accuracy_mode == "extreme" and confidence < 0.10:
                    continue
                if accuracy_mode == "ultra" and confidence < 0.06:
                    continue
            notes_input.append(note)
        quantize_step = _quantize_step_for_track(notes_input, source_tempo, instrument_kind)
        grouped: dict[tuple[int, int], list[tuple[int, int, int]]] = {}

        for note_in in notes_input:
            start_ticks = _seconds_to_ticks(note_in.startTime, source_tempo)
            end_ticks = _seconds_to_ticks(note_in.endTime, source_tempo)
            start_ticks = _quantize_ticks_limited(start_ticks, quantize_step, quantize_shift_ratio)
            end_ticks = _quantize_ticks_limited(end_ticks, quantize_step, quantize_shift_ratio)
            duration_ticks = max(MIN_DURATION_TICKS, end_ticks - start_ticks)
            measure_index = start_ticks // measure_length
            local_start = start_ticks % measure_length
            key = (measure_index, local_start)
            grouped.setdefault(key, []).append((note_in.pitch, duration_ticks, note_in.velocity))

        last_fret = None
        phrase_anchor_by_measure: dict[int, int] = {}
        global_phrase_anchor: int | None = None
        for (measure_index, local_start), notes_group in sorted(grouped.items(), key=lambda x: (x[0][0], x[0][1])):
            if measure_index >= len(track.measures):
                continue
            measure = track.measures[measure_index]
            voice = measure.voices[0]
            beat_start = measure.header.start + local_start
            max_duration = max(d for _, d, _ in notes_group)
            max_duration = min(max_duration, measure_length - local_start)
            max_duration = max(MIN_DURATION_TICKS, max_duration)

            beat = Beat(voice)
            beat.start = beat_start
            beat.duration = Duration.fromTime(max_duration)
            beat.status = BeatStatus.normal
            voice.beats.append(beat)

            used_strings: set[int] = set()
            if measure_index not in phrase_anchor_by_measure:
                frets_for_anchor: list[int] = []
                for pitch, _, _ in notes_group:
                    _, fret_candidate = _pick_string_and_fret(
                        pitch,
                        open_strings,
                        last_fret,
                        global_phrase_anchor,
                    )
                    frets_for_anchor.append(fret_candidate)
                local_anchor = int(
                    sum(frets_for_anchor) / max(1, len(frets_for_anchor))
                )
                if global_phrase_anchor is None:
                    global_phrase_anchor = local_anchor
                else:
                    # Сглаживаем anchor между соседними тактами, чтобы меньше "скакало" по грифу.
                    global_phrase_anchor = int(global_phrase_anchor * 0.6 + local_anchor * 0.4)
                phrase_anchor_by_measure[measure_index] = global_phrase_anchor

            unique_pitches: set[int] = set()
            for pitch, _, velocity in sorted(notes_group, key=lambda n: n[0]):
                if pitch in unique_pitches:
                    continue
                unique_pitches.add(pitch)
                string_number, fret = _pick_string_and_fret(
                    pitch,
                    open_strings,
                    last_fret,
                    phrase_anchor_by_measure.get(measure_index),
                )
                fret = _smooth_fret_position(
                    fret,
                    phrase_anchor_by_measure.get(measure_index),
                    last_fret,
                    anchor_limit,
                    previous_limit,
                )
                fret = max(0, min(MAX_FRET, fret))
                if string_number in used_strings:
                    continue
                used_strings.add(string_number)
                last_fret = fret

                note = Note(beat)
                note.type = NoteType.normal
                note.value = fret
                note.velocity = max(1, min(127, velocity))
                note.string = string_number
                beat.notes.append(note)

    return song


def convert_to_gp5(request: ConvertRequest) -> bytes:
    """
    Конвертирует запрос в бинарное содержимое .gp5.
    Raises GTPUnavailableError если библиотека не установлена.
    """
    if not _GTP_AVAILABLE:
        raise GTPUnavailableError(
            "Библиотека PyGuitarPro не установлена. Выполните: pip install PyGuitarPro"
        )
    song = _build_song(request)
    buffer = BytesIO()
    guitarpro.write(song, buffer, version=(5, 1, 0))
    return buffer.getvalue()
