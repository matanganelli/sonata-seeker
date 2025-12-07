🎼 Sonata Form Analyzer
A full-stack system for automatic structural analysis of classical sonata form using Music21 + FastAPI + React (Vite + TS + shadcn-ui + Tailwind)

This project is a complete application (frontend + backend) designed to analyze MIDI files and automatically identify the structural components of Classical Sonata Form — including Exposition, Development, Recapitulation, cadences, tonal areas, and thematic blocks — using computational musicology techniques.

The system combines a modern React frontend with a Python/Music21 backend and is fully deployable on Google Cloud Run.

Perfect for academic work, music analysis tools, and portfolio demonstration.

🚀 Tech Stack
Frontend

⚡ Vite — modern development tooling

🟦 TypeScript — strong typing and safety

⚛️ React — component-based UI

🎨 Tailwind CSS — utility-first CSS

🧩 shadcn-ui — accessible and elegant component library

🔌 Fetch / Axios — API communication

Backend
The backend performs a multi-stage symbolic music analysis pipeline using Music21 to extract structural elements commonly associated with classical Sonata Form.

🐍 Python 3.10+

🎼 Music21 — symbolic music analysis (keys, cadences, themes, time maps)

🚀 FastAPI — high-performance REST API

🔄 Uvicorn — ASGI server

☁️ Render 

🧠 How the Analyzer Works

The backend receives a .mid file and performs the following:

1. Accurate Time Extraction (fixed: no more mismatched timings)

Music21’s secondsMap is used to compute real temporal positions.
✔ Avoids the common mistake of assuming quarterLength = seconds.

2. Key Area Detection

The score is segmented into windowed measure blocks.
Each block is analyzed for:

key

mode

tonal stability

start/end (in seconds)

3. Thematic Material Detection

A sliding-window algorithm evaluates:

melodic contour

pitch intervals

rhythmic density

ascending / descending gestures

4. Cadence Detection

Roman numeral analysis is applied to detect:

Authentic cadences (V–I)

Half cadences (ending on V)

Offsets are converted to real timestamps.

5. Sonata Form Section Estimation

Heuristic modeling identifies:

Exposition

Transition

Second Theme

Development

Recapitulation

Coda

Everything is mapped to seconds for precise UI display.
