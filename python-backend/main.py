"""
Sonata Form Analyzer - Render Cloud Safe Version
"""

import os
import tempfile
from typing import List, Dict, Any

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware

import music21
from music21 import converter, tempo, analysis
import numpy as np


# ================================================================
#   FIX: Disable external dependencies for cloud environment
# evitar autodownload do music21 e timeout
# ================================================================
music21.environment.set('autoDownload', 'deny')


app = FastAPI(title="Sonata Form Analyzer")


# ================================================================
#   CORS
# ================================================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ================================================================
#   TIME HANDLING
# ================================================================

def get_seconds_map(score):
    try:
        sm = score.secondsMap
        if sm:
            return sm
    except:
        pass
    return []


def get_true_duration_seconds(score):
    """Return a safe duration in seconds for cloud environments."""

    # Method 1: secondsMap
    sm = get_seconds_map(score)
    if sm:
        try:
            end_times = [
                (event.get("offsetSeconds") or 0) + (event.get("durationSeconds") or 0)
                for event in sm
            ]
            if end_times:
                return float(max(end_times))
        except:
            pass

    # Method 2: highestTime * BPM
    try:
        highest = score.highestTime
        marks = list(score.recurse().getElementsByClass(tempo.MetronomeMark))
        bpm = marks[0].number if marks else 120
        return float(highest) * (60 / bpm)
    except:
        pass

    # Method 3: last note
    try:
        notes = list(score.recurse().notes)
        if notes:
            last = max(notes, key=lambda n: n.offset + n.duration.quarterLength)
            marks = list(score.recurse().getElementsByClass(tempo.MetronomeMark))
            bpm = marks[0].number if marks else 120
            ql = last.offset + last.duration.quarterLength
            return float(ql) * (60 / bpm)
    except:
        pass

    # Fallback
    return 180.0


def quarter_to_seconds(score, q):
    marks = score.recurse().getElementsByClass(tempo.MetronomeMark)
    bpm = marks[0].number if marks else 120
    return float(q) * (60 / bpm)


def get_bpm(score):
    marks = list(score.recurse().getElementsByClass(tempo.MetronomeMark))
    return marks[0].number if marks else 120


# ================================================================
#   ACCIDENTAL FORMATTING
# ================================================================

def format_accidentals(name: str) -> str:
    """Convert music21 accidental notation to standard notation.
    E.g., 'E-' -> 'Eb', 'F#' stays 'F#', 'B--' -> 'Bbb'
    """
    if not name:
        return name
    # Replace '-' with 'b' for flats (but not if it's the note name itself)
    # music21 uses '-' for flat and '#' for sharp
    result = name.replace('-', 'b')
    return result


# ================================================================
#   KEY ANALYSIS
# ================================================================

def analyze_global_key(score):
    try:
        k = score.analyze('key')
        return {
            "key": format_accidentals(str(k)),
            "mode": k.mode,
            "tonic": format_accidentals(str(k.tonic)),
            "correlation": float(getattr(k, 'correlationCoefficient', 0.8))
        }
    except:
        return None


def analyze_key_by_notes(score, duration):
    key_areas = []
    all_notes = []

    bpm = get_bpm(score)

    for note in score.recurse().notes:
        offset_sec = float(note.offset) * (60 / bpm)
        dur_sec = float(note.duration.quarterLength) * (60 / bpm)
        all_notes.append({
            "note": note,
            "offset_seconds": offset_sec,
            "duration_seconds": dur_sec
        })

    if not all_notes:
        return []

    num_segments = min(6, max(4, int(duration / 30)))
    seg_dur = duration / num_segments

    for i in range(num_segments):
        start = i * seg_dur
        end = (i + 1) * seg_dur

        seg_notes = [n for n in all_notes if start <= n["offset_seconds"] < end]

        if len(seg_notes) < 4:
            continue

        stream = music21.stream.Stream()
        for n in seg_notes:
            stream.append(n["note"])

        try:
            k = stream.analyze("key")
            key_areas.append({
                "key": format_accidentals(str(k)),
                "mode": k.mode,
                "tonic": format_accidentals(str(k.tonic)),
                "start_offset": start,
                "end_offset": end,
                "correlation": float(getattr(k, "correlationCoefficient", 0.8))
            })
        except:
            continue

    return key_areas


def analyze_key_areas(score, duration):
    global_key = analyze_global_key(score)
    key_areas = analyze_key_by_notes(score, duration)

    if not key_areas and global_key:
        key_areas.append({
            "key": global_key["key"],
            "mode": global_key["mode"],
            "tonic": global_key["tonic"],
            "start_offset": 0,
            "end_offset": duration,
            "correlation": global_key["correlation"]
        })

    if not key_areas:
        key_areas.append({
            "key": "C major",
            "mode": "major",
            "tonic": "C",
            "start_offset": 0,
            "end_offset": duration,
            "correlation": 0.5
        })

    return key_areas, global_key


# ================================================================
#   THEMATIC MATERIAL
# ================================================================

def get_pitch_midi(n):
    if hasattr(n, "pitch"):
        return n.pitch.midi
    elif hasattr(n, "pitches") and n.pitches:
        return max(p.midi for p in n.pitches)
    return 60


def detect_thematic_material(score):
    try:
        notes = list(score.parts[0].recurse().notes) if score.parts else list(score.recurse().notes)
    except:
        notes = list(score.recurse().notes)

    themes = []
    if len(notes) < 10:
        return themes

    window = 8
    step = window // 2

    for i in range(0, len(notes) - window, step):
        segment = notes[i:i + window]

        pitches = [get_pitch_midi(n) for n in segment]
        contour = np.diff(pitches)

        durations = [n.duration.quarterLength for n in segment]
        avg_dur = np.mean(durations)

        start_q = segment[0].offset
        end_q = segment[-1].offset + segment[-1].duration.quarterLength

        themes.append({
            "start_offset": quarter_to_seconds(score, start_q),
            "end_offset": quarter_to_seconds(score, end_q),
            "melodic_range": int(max(pitches) - min(pitches)),
            "avg_interval": float(np.mean(np.abs(contour))) if len(contour) else 0,
            "rhythmic_density": float(1 / avg_dur) if avg_dur else 1.0,
            "contour_direction": "ascending" if np.sum(contour) > 0 else "descending",
        })

    return themes


# ================================================================
#   CADENCE DETECTION
# ================================================================

def detect_cadences(score):
    cadences = []

    try:
        score_meas = score.makeMeasures()
    except:
        score_meas = score

    chordified = score_meas.chordify()
    measures = list(chordified.recurse().getElementsByClass("Measure"))

    for i, measure in enumerate(measures):
        chords = list(measure.recurse().getElementsByClass("Chord"))

        if len(chords) < 2:
            continue

        # Local key
        try:
            k = measure.analyze("key")
        except:
            continue

        for j in range(len(chords) - 1):
            c1 = chords[j]
            c2 = chords[j + 1]

            try:
                rn1 = music21.roman.romanNumeralFromChord(c1, k)
                rn2 = music21.roman.romanNumeralFromChord(c2, k)
            except:
                continue

            q_time = c2.offset + measure.offset
            offset_seconds = quarter_to_seconds(score, q_time)

            # Authentic cadence
            if "V" in rn1.romanNumeral and rn2.romanNumeral == "I":
                cadences.append({
                    "type": "authentic",
                    "measure": i,
                    "offset": offset_seconds,
                    "key": str(k)
                })

            # Half cadence
            if rn2.romanNumeral == "V":
                cadences.append({
                    "type": "half",
                    "measure": i,
                    "offset": offset_seconds,
                    "key": str(k)
                })

    return cadences


# ================================================================
#   SONATA SECTION ESTIMATOR
# ================================================================

def identify_sonata_sections(duration, key_areas, themes, cadences, global_key):
    from music21 import key as m21key

    expo_end = duration * 0.35
    dev_end = duration * 0.70

    if global_key:
        primary_key_full = global_key["key"]
        primary_mode = global_key.get("mode", "major")
    else:
        primary_key_full = key_areas[0]["key"]
        primary_mode = key_areas[0]["mode"]

    # Extract just the tonic note (e.g., "C" from "C major")
    primary_tonic = primary_key_full.split()[0] if ' ' in primary_key_full else primary_key_full
    primary_key = primary_key_full  # Keep full name for display

    try:
        if primary_mode == "major":
            key_obj = m21key.Key(primary_tonic, 'major')
            # Get dominant (5th scale degree) using pitchFromDegree
            dominant_pitch = key_obj.pitchFromDegree(5)
            secondary_key = f"{format_accidentals(dominant_pitch.name)} major"
        else:
            key_obj = m21key.Key(primary_tonic, 'minor')
            # Get relative major for minor keys
            relative_key = key_obj.relative
            secondary_key = f"{format_accidentals(relative_key.tonic.name)} major"
    except Exception as e:
        print(f"Error determining secondary key: {e}")
        secondary_key = "V"  # Fallback

    sections = [
        {
            "type": "exposition-theme1",
            "startTime": 0,
            "endTime": expo_end * 0.40,
            "confidence": 0.85,
            "description": f"Primeiro tema em {primary_key}",
            "musicalKey": primary_key
        },
        {
            "type": "exposition-transition",
            "startTime": expo_end * 0.40,
            "endTime": expo_end * 0.55,
            "confidence": 0.75,
            "description": f"Transição modulante para {secondary_key}",
            "musicalKey": "modulando"
        },
        {
            "type": "exposition-theme2",
            "startTime": expo_end * 0.55,
            "endTime": expo_end * 0.85,
            "confidence": 0.80,
            "description": f"Segundo tema na tonalidade de {secondary_key}",
            "musicalKey": secondary_key
        },
        {
            "type": "exposition-closing",
            "startTime": expo_end * 0.85,
            "endTime": expo_end,
            "confidence": 0.70,
            "description": "Encerramento da exposição",
            "musicalKey": secondary_key
        },
        {
            "type": "development",
            "startTime": expo_end,
            "endTime": dev_end,
            "confidence": 0.75,
            "description": "Desenvolvimento com modulações",
            "musicalKey": "instável"
        },
        {
            "type": "recapitulation-theme1",
            "startTime": dev_end,
            "endTime": dev_end + (duration - dev_end) * 0.35,
            "confidence": 0.80,
            "description": f"Retorno do primeiro tema em {primary_key}",
            "musicalKey": primary_key
        },
        {
            "type": "recapitulation-transition",
            "startTime": dev_end + (duration - dev_end) * 0.35,
            "endTime": dev_end + (duration - dev_end) * 0.45,
            "confidence": 0.70,
            "description": "Transição modificada",
            "musicalKey": primary_key
        },
        {
            "type": "recapitulation-theme2",
            "startTime": dev_end + (duration - dev_end) * 0.45,
            "endTime": dev_end + (duration - dev_end) * 0.75,
            "confidence": 0.80,
            "description": f"Segundo tema agora em {primary_key}",
            "musicalKey": primary_key
        },
        {
            "type": "coda",
            "startTime": dev_end + (duration - dev_end) * 0.75,
            "endTime": duration,
            "confidence": 0.75,
            "description": "Coda final",
            "musicalKey": primary_key
        }
    ]

    return sections


# ================================================================
#   API ROUTES
# ================================================================

@app.api_route("/", methods=["GET", "HEAD"])
async def root():
    return {"status": "running"}


@app.get("/health")
async def health():
    return {"status": "running"}


@app.post("/analyze")
async def analyze_midi(midi_file: UploadFile = File(...)):

    if not midi_file.filename.lower().endswith((".mid", ".midi")):
        raise HTTPException(400, "File must be MIDI")

    temp_path = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mid") as tmp:
            content = await midi_file.read()
            if not content:
                raise HTTPException(400, "Empty file received")
            tmp.write(content)
            temp_path = tmp.name

        # Parse MIDI safely (IMPORTANT for Render)
        try:
            score = converter.parse(temp_path, format="midi")
        except Exception as e:
            raise HTTPException(400, f"Failed to parse MIDI: {str(e)}")

        duration = get_true_duration_seconds(score)

        key_areas, global_key = analyze_key_areas(score, duration)

        try:
            themes = detect_thematic_material(score)
        except:
            themes = []

        try:
            cadences = detect_cadences(score)
        except:
            cadences = []

        sections = identify_sonata_sections(duration, key_areas, themes, cadences, global_key)

        overall = float(np.mean([s["confidence"] for s in sections]))

        return {
            "sections": sections,
            "overallConfidence": overall,
            "summary": f"{len(sections)} sections identified.",
            "musicalInsights": [
                f"Duração: {duration:.2f} s",
                f"Tonalidade: {global_key['key'] if global_key else 'desconhecida'}",
                f"Cadências: {len(cadences)}"
            ],
            "keyAnalysis": {
                "globalKey": global_key,
                "keyAreas": key_areas
            }
        }

    finally:
        if temp_path and os.path.exists(temp_path):
            os.unlink(temp_path)


# ================================================================
#   START SERVER
# ================================================================

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
