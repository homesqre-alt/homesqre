# Homesqre Backend — production image
# Built for any standard VPS / Hostinger / cPanel Docker host.

FROM python:3.11-slim

# System deps (bcrypt needs build-essential at compile time on slim)
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

# Install python deps first (better layer cache)
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt \
 && pip install --no-cache-dir emergentintegrations \
        --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/ || true

# App source
COPY backend/ ./

# Local storage volume (used when STORAGE_BACKEND=local)
RUN mkdir -p /app/backend/uploads

EXPOSE 8001

# Healthcheck — hits the public health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8001/api/ || exit 1

RUN pip install fastapi uvicorn python-dotenv bcrypt PyJWT requests python-multipart pymongo motor pydantic pydantic-settings
CMD ["python", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001"]
