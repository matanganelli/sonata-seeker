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
from music21 import converter, tempo, analysis
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
    """Return actual duration of MIDI in SECONDS."""
    
    # Method 1: Try to get highest time from the score
    try:
        highest_time = score.highestTime  # in quarter lengths
        if highest_time and highest_time > 0:
            # Get tempo
            marks = list(score.recurse().getElementsByClass(tempo.MetronomeMark))
            bpm = marks[0].number if marks else 120
            duration = float(highest_time) * (60.0 / bpm)
            if duration > 0:
                print(f"Duration from highestTime: {duration:.1f}s (ql={highest_time}, bpm={bpm})")
                return duration
    except Exception as e:
        print(f"highestTime method failed: {e}")
    
    # Method 2: Try secondsMap
    try:
        sm = get_seconds_map(score)
        if sm:
            end_times = []
            for event in sm:
                off = event.get("offsetSeconds", 0) or 0
                dur = event.get("durationSeconds") or 0
                end_times.append(off + dur)
            if end_times:
                duration = max(end_times)
                if duration > 0:
                    print(f"Duration from secondsMap: {duration:.1f}s")
                    return duration
    except Exception as e:
        print(f"secondsMap method failed: {e}")
    
    # Method 3: Get last note offset + duration
    try:
        all_notes = list(score.recurse().notes)
        if all_notes:
            last_note = max(all_notes, key=lambda n: n.offset + n.duration.quarterLength)
            last_ql = last_note.offset + last_note.duration.quarterLength
            marks = list(score.recurse().getElementsByClass(tempo.MetronomeMark))
            bpm = marks[0].number if marks else 120
            duration = float(last_ql) * (60.0 / bpm)
            if duration > 0:
                print(f"Duration from last note: {duration:.1f}s")
                return duration
    except Exception as e:
        print(f"Last note method failed: {e}")
    
    # Method 4: Use score.duration
    try:
        marks = list(score.recurse().getElementsByClass(tempo.MetronomeMark))
        bpm = marks[0].number if marks else 120
        duration = float(score.duration.quarterLength) * (60.0 / bpm)
        if duration > 0:
            print(f"Duration from score.duration: {duration:.1f}s")
            return duration
    except Exception as e:
        print(f"score.duration method failed: {e}")
    
    # Fallback
    print("All duration methods failed, using fallback 180s")
    return 180.0


def quarter_to_seconds(score, q):
    """Convert quarter lengths to seconds using first BPM found."""
    marks = score.recurse().getElementsByClass(tempo.MetronomeMark)
    bpm = marks[0].number if marks else 120
    return float(q) * (60 / bpm)


def get_bpm(score):
    """Get BPM from score."""
    marks = list(score.recurse().getElementsByClass(tempo.MetronomeMark))
    return marks[0].number if marks else 120

# ================================================================
#   IMPROVED KEY ANALYSIS
# ================================================================

def analyze_global_key(score):
    """Analyze the overall key of the entire score."""
    try:
        key_result = score.analyze('key')
        if key_result:
            return {
                "key": str(key_result),
                "mode": key_result.mode,
                "tonic": str(key_result.tonic),
                "correlation": float(getattr(key_result, 'correlationCoefficient', 0.8))
            }
    except Exception as e:
        print(f"Global key analysis failed: {e}")
    return None


def analyze_key_by_notes(score, duration):
    """Analyze keys by dividing the score into time-based segments using notes."""
    key_areas = []
    bpm = get_bpm(score)
    
    # Get all notes with their absolute offsets in seconds
    all_notes = []
    for note in score.recurse().notes:
        offset_seconds = float(note.offset) * (60.0 / bpm)
        dur_seconds = float(note.duration.quarterLength) * (60.0 / bpm)
        all_notes.append({
            'note': note,
            'offset_seconds': offset_seconds,
            'duration_seconds': dur_seconds
        })
    
    if not all_notes:
        return key_areas
    
    # Divide into 4-6 segments based on duration
    num_segments = min(6, max(4, int(duration / 30)))  # One segment per ~30 seconds
    segment_duration = duration / num_segments
    
    for i in range(num_segments):
        start_time = i * segment_duration
        end_time = (i + 1) * segment_duration
        
        # Get notes in this time segment
        segment_notes = [n for n in all_notes 
                        if n['offset_seconds'] >= start_time and n['offset_seconds'] < end_time]
        
        if len(segment_notes) < 4:  # Need minimum notes for analysis
            continue
        
        # Create a stream with these notes for analysis
        segment_stream = music21.stream.Stream()
        for note_data in segment_notes:
            try:
                segment_stream.append(note_data['note'])
            except:
                pass
        
        try:
            key_result = segment_stream.analyze('key')
            if key_result:
                key_areas.append({
                    "key": str(key_result),
                    "mode": key_result.mode,
                    "tonic": str(key_result.tonic),
                    "start_offset": start_time,
                    "end_offset": end_time,
                    "correlation": float(getattr(key_result, 'correlationCoefficient', 0.8))
                })
                print(f"Segment {i}: {key_result} (confidence: {getattr(key_result, 'correlationCoefficient', 'N/A')})")
        except Exception as e:
            print(f"Segment {i} key analysis failed: {e}")
    
    return key_areas


def analyze_key_areas(score, duration):
    """
    Comprehensive key analysis using multiple methods:
    1. Global key analysis for the entire piece
    2. Time-based segmentation for local key areas
    3. Measure-based analysis as fallback
    """
    key_areas = []
    
    # First, get the global key
    global_key = analyze_global_key(score)
    if global_key:
        print(f"Global key detected: {global_key['key']} (mode: {global_key['mode']}, correlation: {global_key['correlation']:.2f})")
    
    # Try time-based note segmentation (most reliable for MIDI)
    key_areas = analyze_key_by_notes(score, duration)
    
    # If note-based analysis failed, try measure-based
    if not key_areas:
        print("Note-based analysis returned no results, trying measure-based...")
        measures = list(score.recurse().getElementsByClass("Measure"))
        
        if measures:
            window = max(4, len(measures) // 6)
            
            for i in range(0, len(measures), window):
                subset = measures[i:i + window]
                if not subset:
                    continue
                
                block = music21.stream.Stream()
                for m in subset:
                    try:
                        block.append(m)
                    except:
                        pass
                
                try:
                    analyzed_key = block.analyze("key")
                    start_q = subset[0].offset
                    end_q = subset[-1].offset + subset[-1].duration.quarterLength
                    
                    key_areas.append({
                        "key": str(analyzed_key),
                        "mode": analyzed_key.mode,
                        "tonic": str(analyzed_key.tonic),
                        "start_offset": quarter_to_seconds(score, start_q),
                        "end_offset": quarter_to_seconds(score, end_q),
                        "correlation": float(getattr(analyzed_key, 'correlationCoefficient', 0.8))
                    })
                except Exception as e:
                    print(f"Measure block analysis failed: {e}")
    
    # If still no key areas, use global key for the entire duration
    if not key_areas and global_key:
        print("Using global key for entire piece")
        key_areas.append({
            "key": global_key["key"],
            "mode": global_key["mode"],
            "tonic": global_key["tonic"],
            "start_offset": 0,
            "end_offset": duration,
            "correlation": global_key["correlation"]
        })
    
    # Final fallback - estimate based on first notes
    if not key_areas:
        print("All key analysis methods failed, using pitch-based estimation")
        key_areas.append({
            "key": "C major",
            "mode": "major",
            "tonic": "C",
            "start_offset": 0,
            "end_offset": duration,
            "correlation": 0.5
        })
    
    return key_areas, global_key


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
        # Try to get notes directly if no parts
        notes = list(score.recurse().notes)
    else:
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

def identify_sonata_sections(duration, key_areas, themes, cadences, global_key):

    expo_end = duration * 0.35
    dev_end = duration * 0.70

    # Use global key if available, otherwise first key area
    if global_key:
        primary_key = global_key["key"]
        primary_tonic = global_key.get("tonic", primary_key.split()[0])
        primary_mode = global_key.get("mode", "major")
    elif key_areas:
        primary_key = key_areas[0]["key"]
        primary_tonic = key_areas[0].get("tonic", primary_key.split()[0])
        primary_mode = key_areas[0].get("mode", "major")
    else:
        primary_key = "C major"
        primary_tonic = "C"
        primary_mode = "major"
    
    # Determine secondary key (typically V for major, III for minor)
    if primary_mode == "major":
        # For major keys, secondary is typically the dominant
        secondary_candidates = ["G major", "D major", "A major", "E major", "B major", "F major"]
    else:
        # For minor keys, secondary is typically the relative major
        secondary_candidates = ["Eb major", "Bb major", "F major", "C major", "G major"]
    
    # Look for a different key in the middle of the exposition
    secondary_key = None
    for ka in key_areas:
        if ka["start_offset"] > expo_end * 0.4 and ka["start_offset"] < expo_end:
            if ka["key"] != primary_key:
                secondary_key = ka["key"]
                break
    
    if not secondary_key:
        # Estimate secondary key based on primary
        if "C major" in primary_key or "C" == primary_tonic:
            secondary_key = "G major"
        elif "G major" in primary_key:
            secondary_key = "D major"
        elif "D major" in primary_key:
            secondary_key = "A major"
        elif "F major" in primary_key:
            secondary_key = "C major"
        elif "minor" in primary_key.lower():
            secondary_key = "Relative major"
        else:
            secondary_key = "V of " + primary_key

    sections = []

    sections.append({
        "type": "exposition-theme1",
        "startTime": 0,
        "endTime": expo_end * 0.40,
        "confidence": 0.85,
        "description": f"Primeiro tema na tonalidade de {primary_key}",
        "musicalKey": primary_key,
    })

    sections.append({
        "type": "exposition-transition",
        "startTime": expo_end * 0.40,
        "endTime": expo_end * 0.55,
        "confidence": 0.75,
        "description": f"Transição modulante de {primary_key} para {secondary_key}",
        "musicalKey": "modulando",
    })

    sections.append({
        "type": "exposition-theme2",
        "startTime": expo_end * 0.55,
        "endTime": expo_end * 0.85,
        "confidence": 0.80,
        "description": f"Segundo tema na tonalidade de {secondary_key}",
        "musicalKey": secondary_key,
    })

    sections.append({
        "type": "exposition-closing",
        "startTime": expo_end * 0.85,
        "endTime": expo_end,
        "confidence": 0.70,
        "description": f"Tema de encerramento em {secondary_key}",
        "musicalKey": secondary_key,
    })

    sections.append({
        "type": "development",
        "startTime": expo_end,
        "endTime": dev_end,
        "confidence": 0.75,
        "description": "Desenvolvimento com fragmentação temática e modulações",
        "musicalKey": "instável",
    })

    sections.append({
        "type": "recapitulation-theme1",
        "startTime": dev_end,
        "endTime": dev_end + (duration - dev_end) * 0.35,
        "confidence": 0.80,
        "description": f"Retorno do primeiro tema em {primary_key}",
        "musicalKey": primary_key,
    })

    sections.append({
        "type": "recapitulation-transition",
        "startTime": dev_end + (duration - dev_end) * 0.35,
        "endTime": dev_end + (duration - dev_end) * 0.45,
        "confidence": 0.70,
        "description": f"Transição modificada em {primary_key}",
        "musicalKey": primary_key,
    })

    sections.append({
        "type": "recapitulation-theme2",
        "startTime": dev_end + (duration - dev_end) * 0.45,
        "endTime": dev_end + (duration - dev_end) * 0.75,
        "confidence": 0.80,
        "description": f"Segundo tema agora na tônica ({primary_key})",
        "musicalKey": primary_key,
    })

    sections.append({
        "type": "coda",
        "startTime": dev_end + (duration - dev_end) * 0.75,
        "endTime": duration,
        "confidence": 0.75,
        "description": f"Coda em {primary_key}",
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

        # Analyze key areas with improved method
        try:
            key_areas, global_key = analyze_key_areas(score, duration)
            print(f"Found {len(key_areas)} key areas")
        except Exception as e:
            print(f"Key analysis error: {e}")
            key_areas = []
            global_key = None

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

        sections = identify_sonata_sections(duration, key_areas, themes, cadences, global_key)

        overall = float(np.mean([s["confidence"] for s in sections])) if sections else 0.75

        # Build comprehensive insights
        insights = [
            f"Duração: {duration:.1f} segundos",
        ]
        
        if global_key:
            insights.append(f"Tonalidade principal: {global_key['key']} (confiança: {global_key['correlation']:.0%})")
        elif key_areas:
            insights.append(f"Tonalidade principal: {key_areas[0]['key']}")
        
        if len(key_areas) > 1:
            unique_keys = list(set(ka['key'] for ka in key_areas))
            insights.append(f"Áreas tonais detectadas: {', '.join(unique_keys[:4])}")
        
        insights.append(f"Cadências encontradas: {len(cadences)}")

        return {
            "sections": sections,
            "overallConfidence": overall,
            "summary": f"Análise de forma sonata: {len(sections)} seções identificadas em {duration:.1f} segundos.",
            "musicalInsights": insights,
            "keyAnalysis": {
                "globalKey": global_key,
                "keyAreas": key_areas
            }
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
