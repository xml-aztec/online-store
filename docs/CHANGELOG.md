# Changelog

## Задача 1.1 — Модели БД и миграции

- `TimestampedBase` (`app/database.py`): общие `id UUID PK`, `created_at`/`updated_at` для всех таблиц.
- SQLAlchemy-модели (13 таблиц): `users`, `refresh_tokens`, `addresses` (auth); `categories`, `products`, `product_variants`, `product_images` (catalog); `orders`, `order_items`, `order_status_history`, `promo_codes` (orders); `payments`, `payment_events` (payments) — с CHECK/UNIQUE-ограничениями и индексами из раздела 4 ТЗ, полем `external_id` из 11.1.
- Единая миграция: расширения `citext` и `pg_trgm`; `search_vector` (GENERATED tsvector + GIN) и GIN trgm-индекс на `products.name`; общий триггер `set_updated_at()` (на `clock_timestamp()`) на всех 13 таблицах. Upgrade/downgrade проверены с нуля.
- `tests/factories.py`: фабрики factory_boy на все 13 моделей (build-стратегия; FK передаёт вызывающий тест после `flush()` родителя).
- Seed-скрипт (`make seed`, `app/scripts/seed.py`): 3 категории, 10 товаров HobbyLife, 27 вариантов (объём 0.5/1/1.5 л, цвета); идемпотентен (пропускает, если каталог уже заполнен).
- Тесты на каждое CHECK-ограничение (users.role, orders.status/delivery_method/payment_method, product_variants.price/stock_qty, order_items.quantity, payments.status, promo_codes.discount_type), на UNIQUE(product_id, options), на генерацию search_vector и на срабатывание триггера updated_at.

## Задача 0.3 — CI и тестовый контур

- GitHub Actions (`.github/workflows/ci.yml`): `lint` (ruff, mypy, eslint, tsc), `test-backend` (postgres+redis сервисами, автоприменение миграций, pytest), `build` (сборка api и frontend образов).
- `tests/conftest.py`: `db_session` — транзакция с откатом (SAVEPOINT) после каждого теста; `client` — httpx-клиент против реального приложения с подменённым `get_db`; автоприменение Alembic-миграций перед тестовым сеансом.
- `tests/factories.py`: заготовка на factory_boy (`BaseFactory`, локаль `ru_RU`) для фабрик моделей в Задаче 1.1.
- Тесты на транзакционный откат (доказывают, что коммит внутри теста реально отменяется) и на фикстуру `client`; тесты `core/storage.py` пропускаются (не падают), если S3/MinIO недоступен — соответствует тому, что CI поднимает только postgres+redis.

## Задача 0.2 — Скелет backend-приложения

- `app/config.py` (pydantic-settings), `app/database.py` (async engine/session/`get_db`/`Base`), `app/exceptions.py` (`DomainError` + единый формат ошибок для всех исключений, включая встроенные HTTP/422).
- Request ID middleware + structlog JSON-логи (`request_id` в каждом логе запроса, заголовок `X-Request-ID`).
- `core/redis.py`, `core/storage.py` (S3-клиент на boto3, presigned URL, работает с MinIO).
- Alembic (async template), первая пустая миграция (upgrade/downgrade проверены с нуля).
- Пустые пакеты-заготовки для auth/catalog/cart/orders/payments/admin/workers.
- Тесты на всю новую функциональность (config, database, exceptions, middleware, redis, storage) — 12 тестов зелёные; ruff/mypy проходят.

## Задача 0.1 — Инфраструктура репозитория

- Структура монорепозитория (`backend/`, `frontend/`, `caddy/`, `docs/`), docker-compose со всеми сервисами (postgres, redis, minio, api, frontend, caddy) и multi-stage Dockerfile'ами.
- Пустой FastAPI с `GET /health` и заготовка Next.js (App Router, TypeScript, Tailwind); Caddy проксирует `/` → frontend, `/api/*` → api.
- `.env.example`, `Makefile` (`up`/`down`/`logs`/`test`/`lint`/`migrate`), README с инструкцией запуска.
