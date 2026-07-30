# Changelog

## Задача 0.1 — Инфраструктура репозитория

- Структура монорепозитория (`backend/`, `frontend/`, `caddy/`, `docs/`), docker-compose со всеми сервисами (postgres, redis, minio, api, frontend, caddy) и multi-stage Dockerfile'ами.
- Пустой FastAPI с `GET /health` и заготовка Next.js (App Router, TypeScript, Tailwind); Caddy проксирует `/` → frontend, `/api/*` → api.
- `.env.example`, `Makefile` (`up`/`down`/`logs`/`test`/`lint`/`migrate`), README с инструкцией запуска.
