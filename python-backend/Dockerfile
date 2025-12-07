FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for music21
RUN apt-get update && apt-get install -y \
    && rm -rf /var/lib/apt/lists/*

# Copy all files from the current directory
COPY . .

RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 8080

CMD ["python", "main.py"]
