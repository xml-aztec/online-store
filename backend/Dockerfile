# syntax=docker/dockerfile:1

FROM python:3.12-slim AS base
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1
COPY pyproject.toml alembic.ini ./
COPY app ./app
COPY alembic ./alembic

# --- dev: hot reload, dev tools installed ---
FROM base AS dev
COPY tests ./tests
RUN pip install -e ".[dev]"
EXPOSE 8000
# --proxy-headers: api has no published port, only Caddy talks to it, so trusting
# X-Forwarded-For from any upstream is safe and needed for real client IPs (rate limiting).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload", "--proxy-headers", "--forwarded-allow-ips=*"]

# --- builder: install runtime deps only, for a lean prod image ---
FROM base AS builder
RUN pip install --prefix=/install .

# --- prod: no compiler, no dev tools, no source of tests ---
FROM python:3.12-slim AS prod
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
COPY --from=builder /install /usr/local
COPY app ./app
COPY alembic.ini ./
COPY alembic ./alembic
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
