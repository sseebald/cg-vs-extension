# Multi-Ecosystem Application
# Demonstrates library detection across Python, Node.js, and runtime in single build

# Stage 1: Python Backend
FROM python:3.11-slim AS python-backend

WORKDIR /backend

# Python dependencies - hover here!
COPY requirements.txt /backend/

RUN pip install --no-cache-dir -r requirements.txt

COPY backend /backend


# Stage 2: Node.js Frontend
FROM node:20-slim AS frontend-builder

WORKDIR /frontend

# JavaScript dependencies - hover here!
COPY package.json /frontend/

RUN npm install

COPY frontend /frontend

RUN npm run build


# Stage 3: Final Runtime
FROM python:3.11-slim

WORKDIR /app

# Copy Python dependencies again - hover here to see detection!
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy built artifacts
COPY --from=python-backend /backend /app/backend
COPY --from=frontend-builder /frontend/build /app/static

EXPOSE 8000

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
