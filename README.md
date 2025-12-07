🎼 Sonata Form Analyzer
Automatic structural analysis of classical music using Music21 + FastAPI + React (Vite + TS + shadcn + Tailwind)

Este projeto é uma aplicação completa (frontend + backend) desenvolvida para analisar arquivos MIDI e identificar automaticamente a estrutura formal de uma sonata clássica — incluindo exposição, desenvolvimento, recapitulação, temas e cadências — usando técnicas de análise musical computacional.

O objetivo final é fornecer uma ferramenta moderna, visual e técnica para estudos de análise musical, musicologia computacional e aplicações educacionais.

🚀 Tecnologias Utilizadas
Frontend

⚡ Vite — build rápido e moderno
🟦 TypeScript — tipagem robusta
⚛️ React — interface reativa
🎨 Tailwind CSS — design responsivo
🧩 shadcn-ui — componentes acessíveis e elegantes
🔌 Axios / Fetch — comunicação com API

Backend

🐍 Python 3.10+
🎼 Music21 — análise musical (key, cadences, themes, offsets, durations)
🚀 FastAPI — API moderna, tipada e rápida
🔄 Uvicorn — servidor ASGI
☁️ Render 
🧠 Como o Analisador Funciona

O backend recebe um arquivo .mid e executa:

1. Extração temporal real (corrigida)

➡️ Usa score.secondsMap para evitar erros de minutagem.
➡️ Converte todas as durações para segundos reais, não quarterLength.

2. Key Area Detection

Analisa regiões tonais em janelas móveis de compassos.
Retorna:
tonalidade
modo
correlação
início/fim em segundos

3. Thematic Material Detection

Detecta padrões melódicos recorrentes avaliando:
contorno
densidade rítmica
alcance melódico

4. Cadence Detection

Identifica:
Autênticas (V–I)
Meias cadências (terminando em V)
Baseado em RomanNumerals calculados com o Music21.

5. Sonata Section Estimation

Determina:
Exposição
Desenvolvimento
Recapitulação
Coda
Usa modelos heurísticos + análise tonal.
