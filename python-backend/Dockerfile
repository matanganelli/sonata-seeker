FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for music21
RUN apt-get update && apt-get install -y \
    && rm -rf /var/lib/apt/lists/*

# Debug: Show current directory and contents
RUN echo "Current directory:" && pwd
RUN echo "Contents of build context:"

# Copy all files from the current directory
COPY . .

# Debug: Show what was copied
RUN echo "Files copied to /app:" && ls -la

RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 8080

CMD ["python", "main.py"]
