# HobbyLife

Интернет-магазин товаров для дома (Бишкек, Кыргызстан). Монорепозиторий: backend (FastAPI), frontend (Next.js), инфраструктура (Docker Compose + Caddy).

Полная спецификация — [`docs/tz-internet-magazin.md`](docs/tz-internet-magazin.md).
План разработки по задачам для ИИ-агентов — [`docs/plan-razrabotki.md`](docs/plan-razrabotki.md).
Деплой в продакшен — [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Стек

- **Backend**: Python 3.12, FastAPI, SQLAlchemy 2.0 (async), PostgreSQL 16, Redis 7.
- **Frontend**: Next.js (App Router), TypeScript, Tailwind CSS.
- **Инфраструктура**: Docker Compose, Caddy (reverse proxy), MinIO (S3-совместимое хранилище для разработки).

## Быстрый старт

Требования: Docker + Docker Compose v2.

```bash
cp .env.example .env
make up
```

Первый запуск соберёт образы и поднимет все сервисы: `postgres`, `redis`, `minio`, `api`, `frontend`, `caddy`.

После старта проверьте:

- Фронтенд: http://localhost/
- Бэкенд healthcheck: `curl http://localhost/api/health` → `{"status":"ok"}`
- Консоль MinIO: http://localhost:9001 (логин/пароль — из `.env`, переменные `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`)

Остановить стек: `make down`.

## Команды

| Команда | Действие |
|---|---|
| `make up` | Собрать образы и поднять все сервисы |
| `make down` | Остановить все сервисы |
| `make logs` | Логи всех сервисов (follow) |
| `make test` | Прогнать тесты backend (pytest) |
| `make lint` | Линт и типы: ruff + mypy (backend), eslint + tsc (frontend) |
| `make migrate` | Применить Alembic-миграции (доступно начиная с Задачи 0.2) |

## Структура репозитория

```
backend/     # FastAPI-приложение
frontend/    # Next.js-приложение
caddy/       # конфигурация reverse proxy
docs/        # ТЗ, план разработки, changelog
docker-compose.yml
.env.example
Makefile
```

## Архитектура

```
[Браузер] ⇄ [Caddy :80] ⇄ [Next.js] ⇄ [FastAPI] ⇄ [PostgreSQL]
                                          ⇅
                                      [Redis]
                                          ⇅
                                    [MinIO / S3]
```

Caddy проксирует `/` на frontend и `/api/*` на api (со снятием префикса `/api` — см. `caddy/Caddyfile`). Прямого доступа фронтенда к БД нет: все данные идут через REST API бэкенда.

## Разработка

Оба сервиса (`api`, `frontend`) запускаются в dev-режиме с hot reload и смонтированным исходным кодом — изменения в `backend/` и `frontend/` подхватываются без пересборки образа.
