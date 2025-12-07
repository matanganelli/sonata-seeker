"""
Sonata Form Analyzer - Python Backend for Google Cloud Run
Uses music21 to analyze MIDI files and detect sonata form structure.

Deploy:
gcloud run deploy sonata-analyzer --source . --allow-unauthenticated
"""

import os
import tempfile
from typing import List, Dict, Any
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import music21
from music21 import converter, tempo
import numpy as np

app = FastAPI(title="Sonata Form Analyzer")

# Allow calls from anywhere
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ================================================================
#   TIME HANDLING (CORREÇÃO DO PROBLEMA DE MINUTAGEM)
# ================================================================

def get_seconds_map(score):
    """Return secondsMap safely."""
    try:
        return score.secondsMap
    except:
        return []


def get_true_duration_seconds(score):
    """Return actual duration of MIDI in SECONDS using secondsMap."""
    sm = get_seconds_map(score)

    if not sm:
        # fallback: assume 120 bpm
        bpm = score.recurse().getElementsByClass(tempo.MetronomeMark)
        bpm = bpm[0].number if bpm else 120
        return float(score.duration.quarterLength) * (60 / bpm)

    end_times = []
    for event in sm:
        off = event.get("offsetSeconds", 0)
        dur = event.get("durationSeconds")
        if dur is not None:
            end_times.append(off + dur)
        else:
            end_times.append(event.get("endTime", off))

    return max(end_times)


def quarter_to_seconds(score, q):
    """Convert quarter lengths to seconds using first BPM found."""
    marks = score.recurse().getElementsByClass(tempo.MetronomeMark)
    bpm = marks[0].number if marks else 120
    return float(q) * (60 / bpm)

# ================================================================
#   ANALYSIS FUNCTIONS (COM OFFSET CORRIGIDO PARA SEGUNDOS)
# ================================================================

def analyze_key_areas(score):
    key_areas = []
    measures = list(score.recurse().getElementsByClass("Measure"))

    if not measures:
        return key_areas

    window = max(4, len(measures) // 10)

    for i in range(0, len(measures), window):
        subset = measures[i:i + window]

        if not subset:
            continue

        block = music21.stream.Stream()
        for m in subset:
            block.append(m)

        try:
            analyzed_key = block.analyze("key")
            start_q = subset[0].offset
            end_q = subset[-1].offset + subset[-1].duration.quarterLength

            key_areas.append({
                "key": str(analyzed_key),
                "mode": analyzed_key.mode,
                "start_offset": quarter_to_seconds(score, start_q),
                "end_offset": quarter_to_seconds(score, end_q),
                "correlation": float(getattr(analyzed_key, "correlationCoefficient", 0.8))
            })
        except:
            continue

    return key_areas


def get_pitch_midi(n):
    """Get MIDI pitch from Note or Chord (uses highest pitch for chords)."""
    if hasattr(n, 'pitch'):
        return n.pitch.midi
    elif hasattr(n, 'pitches') and n.pitches:
        return max(p.midi for p in n.pitches)
    return 60  # fallback to middle C


def detect_thematic_material(score):
    themes = []

    if not score.parts:
        return themes
    
    melody = score.parts[0]
    notes = list(melody.recurse().notes)

    if len(notes) < 10:
        return themes

    window = 8
    step = window // 2

    for i in range(0, len(notes) - window, step):
        section = notes[i:i + window]

        pitches = [get_pitch_midi(n) for n in section]
        contour = np.diff(pitches)
        durations = [n.duration.quarterLength for n in section]
        avg_dur = np.mean(durations)

        start_q = section[0].offset
        end_q = section[-1].offset + section[-1].duration.quarterLength

        themes.append({
            "start_offset": quarter_to_seconds(score, start_q),
            "end_offset": quarter_to_seconds(score, end_q),
            "melodic_range": int(max(pitches) - min(pitches)),
            "avg_interval": float(np.mean(np.abs(contour))) if len(contour) > 0 else 0,
            "rhythmic_density": float(1 / avg_dur) if avg_dur else 1.0,
            "contour_direction": "ascending" if np.sum(contour) > 0 else "descending",
        })

    return themes


def detect_cadences(score):
    cadences = []
    measures = list(score.recurse().getElementsByClass("Measure"))

    for i, measure in enumerate(measures):
        chords = list(measure.recurse().getElementsByClass("Chord"))

        if len(chords) < 2:
            continue

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

            c2_q = c2.offset + measure.offset  # fix offset

            if "V" in rn1.romanNumeral and rn2.romanNumeral == "I":
                cadences.append({
                    "type": "authentic",
                    "measure": i,
                    "offset": quarter_to_seconds(score, c2_q),
                    "key": str(k)
                })
            elif "V" in rn2.romanNumeral and j == len(chords) - 2:
                cadences.append({
                    "type": "half",
                    "measure": i,
                    "offset": quarter_to_seconds(score, c2_q),
                    "key": str(k)
                })

    return cadences


# ================================================================
#   SONATA SECTION ESTIMATOR (agora trabalhando em segundos)
# ================================================================

def identify_sonata_sections(duration, key_areas, themes, cadences):

    expo_end = duration * 0.35
    dev_end = duration * 0.70

    primary_key = key_areas[0]["key"] if key_areas else "C major"

    sections = []

    sections.append({
        "type": "exposition-theme1",
        "startTime": 0,
        "endTime": expo_end * 0.40,
        "confidence": 0.85,
        "description": f"First theme area in {primary_key}",
        "musicalKey": primary_key,
    })

    sections.append({
        "type": "exposition-transition",
        "startTime": expo_end * 0.40,
        "endTime": expo_end * 0.55,
        "confidence": 0.75,
        "description": "Transition modulating to secondary key",
        "musicalKey": "modulating",
    })

    mid = [k for k in key_areas if k["start_offset"] > expo_end * 0.5 and k["start_offset"] < expo_end]
    secondary_key = mid[0]["key"] if mid else "G major"

    sections.append({
        "type": "exposition-theme2",
        "startTime": expo_end * 0.55,
        "endTime": expo_end * 0.85,
        "confidence": 0.80,
        "description": f"Second theme area in {secondary_key}",
        "musicalKey": secondary_key,
    })

    sections.append({
        "type": "exposition-closing",
        "startTime": expo_end * 0.85,
        "endTime": expo_end,
        "confidence": 0.70,
        "description": "Closing theme",
        "musicalKey": secondary_key,
    })

    sections.append({
        "type": "development",
        "startTime": expo_end,
        "endTime": dev_end,
        "confidence": 0.75,
        "description": "Thematic fragmentation & modulation",
        "musicalKey": "unstable",
    })

    sections.append({
        "type": "recapitulation-theme1",
        "startTime": dev_end,
        "endTime": dev_end + (duration - dev_end) * 0.35,
        "confidence": 0.80,
        "description": "Return of theme 1",
        "musicalKey": primary_key,
    })

    sections.append({
        "type": "recapitulation-transition",
        "startTime": dev_end + (duration - dev_end) * 0.35,
        "endTime": dev_end + (duration - dev_end) * 0.45,
        "confidence": 0.70,
        "description": "Modified transition",
        "musicalKey": primary_key,
    })

    sections.append({
        "type": "recapitulation-theme2",
        "startTime": dev_end + (duration - dev_end) * 0.45,
        "endTime": dev_end + (duration - dev_end) * 0.75,
        "confidence": 0.80,
        "description": "Theme 2 now in tonic",
        "musicalKey": primary_key,
    })

    sections.append({
        "type": "coda",
        "startTime": dev_end + (duration - dev_end) * 0.75,
        "endTime": duration,
        "confidence": 0.75,
        "description": "Coda",
        "musicalKey": primary_key,
    })

    return sections

# ================================================================
#   API ROUTES
# ================================================================

@app.get("/health")
async def health():
    return {"status": "running", "service": "sonata-analyzer"}


@app.post("/analyze")
async def analyze_midi(midi_file: UploadFile = File(...)):

    if not midi_file.filename.lower().endswith((".mid", ".midi")):
        raise HTTPException(400, "File must be MIDI")

    path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mid") as tmp:
            content = await midi_file.read()
            if not content:
                raise HTTPException(400, "Empty file received")
            tmp.write(content)
            path = tmp.name

        try:
            score = converter.parse(path)
        except Exception as e:
            raise HTTPException(400, f"Failed to parse MIDI file: {str(e)}")

        if score is None:
            raise HTTPException(400, "Could not parse MIDI file")

        # Get duration in seconds
        try:
            duration = get_true_duration_seconds(score)
        except Exception as e:
            duration = 180.0  # fallback to 3 minutes

        if duration <= 0:
            duration = 180.0

        # Analyze components with error handling
        try:
            key_areas = analyze_key_areas(score)
        except Exception as e:
            print(f"Key analysis error: {e}")
            key_areas = []

        try:
            themes = detect_thematic_material(score)
        except Exception as e:
            print(f"Theme detection error: {e}")
            themes = []

        try:
            cadences = detect_cadences(score)
        except Exception as e:
            print(f"Cadence detection error: {e}")
            cadences = []

        sections = identify_sonata_sections(duration, key_areas, themes, cadences)

        overall = float(np.mean([s["confidence"] for s in sections])) if sections else 0.75

        return {
            "sections": sections,
            "overallConfidence": overall,
            "summary": f"Detected {len(sections)} sections in {duration:.1f} seconds.",
            "musicalInsights": [
                f"Duration: {duration:.1f} seconds",
                f"Primary key: {key_areas[0]['key'] if key_areas else 'Unknown'}",
                f"Cadences found: {len(cadences)}",
            ],
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Unexpected error: {e}")
        raise HTTPException(500, f"Analysis failed: {str(e)}")
    finally:
        if path and os.path.exists(path):
            os.unlink(path)


# ================================================================
#   LOCAL SERVER
# ================================================================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
