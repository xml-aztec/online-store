# Changelog

## Задача 2.3 — Frontend: публичный каталог

- Генерация типов из OpenAPI (`npm run gen:api` → `openapi-typescript` против запущенного бэкенда через Caddy); тонкий fetch-клиент (`shared/api/client.ts`: SSR ходит в `http://api:8000/v1` напрямую по docker-сети, браузер — через Caddy `/api/v1`); `formatPrice` («1 250 сом»).
- Layout магазина: Header (поиск, счётчик корзины — заглушка на zustand до задач 3.1/3.3), Footer.
- Главная (`(shop)/page.tsx`, ISR `revalidate = 60`): баннер, ссылки на категории, товарные сетки «Новинки»/«Популярное».
- Каталог (`/catalog/[[...slug]]`, SSR): дерево категорий, фильтры по цене и опциям — обычная GET-форма (`next/form`, без клиентского JS), сортировка — клиентский `<select>` (`router.push`), пагинация, facets, skeleton через `loading.tsx`. Все фильтры — в query string, ссылки полностью шаримые (проверено curl'ом: `?sort=price_asc` отдаёт отсортированные по цене товары, `/catalog/{slug}` — отфильтрованные по категории).
- Карточка товара (`/product/[slug]`, SSR + кэш данных `revalidate: 60`): галерея с превью, селектор вариантов (недоступные комбинации опций — задизейблены), сообщение об остатке («в наличии» / «осталось N» при N≤5 / «нет в наличии»), OpenGraph + JSON-LD `Product`.
- Найдено и исправлено до мёржа (все три — через реальный браузер/скриншоты, не только curl изнутри docker-сети — это первая задача с настоящим браузерным потребителем URL картинок):
  - Presigned URL на изображения товаров подписывались internal-хостом MinIO (`minio:9000`, резолвится только внутри docker-сети) — недоступны из настоящего браузера; не проявлялось в задачах 2.1/2.2, т.к. вся проверка шла изнутри docker-сети. Исправлено отдельным boto3-клиентом (`_get_presigning_s3_client`), подписывающим URL по origin из `S3_PUBLIC_URL`.
  - По той же причине падала серверная оптимизация `next/image` (она тоже ходит за картинкой из контейнера `frontend`) — добавлен `unoptimized` на изображения товаров (бэкенд и так отдаёт готовый webp 400/800, оптимизация всё равно не нужна).
  - В корневом layout не было `<meta name="viewport">` — на реальном мобильном рендере это давало desktop-совместимый layout-viewport (~980px) и обрезку контента вбок. Не проявлялось при наивной проверке скриншотом через `--window-size` (headless Chrome без `isMobile: true` игнорирует viewport-тег и рендерит как десктопное окно) — поймано только настоящей мобильной эмуляцией (`puppeteer-core`, `setViewport({ isMobile: true })`). Исправлено экспортом `viewport = { width: "device-width", initialScale: 1 }` из `app/layout.tsx`.
  - Главная статически пререндерится при `next build` (ISR, без динамических API) — значит `npm run build` реально ходит в бэкенд ещё на этапе сборки образа. В голом `docker compose up --build` бэкенд к этому моменту уже поднят, поэтому не проявлялось локально; но CI-джоб `build` собирает образ `docker build ./frontend` отдельной командой без сети docker-compose (`ENOTFOUND api`) — так же сломался бы билд прод-образа в любом реальном деплое, где образ собирается до старта бэкенда. Исправлено: данные для главной оборачиваются в try/catch с пустым fallback (баннер отрисовывается всегда, секции категорий/товаров просто не рендерятся, если бэкенд недоступен на этапе сборки) — реальный ISR-трафик подхватывает актуальные данные в течение `revalidate`. Каталог и карточка товара ошибки не глотают (это уже live SSR за конкретным запросом, а не билд-тайм prerender).
- Обновлены skip-условия у 3 существующих backend-тестов, которые реально скачивают presigned URL (`test_presigned_url_roundtrip`, `test_product_detail_includes_working_presigned_image_url`, `test_upload_enqueues_resize_job_...`): добавлена отдельная проверка `s3_public_url_reachable()` (публичный хост недоступен изнутри контейнера, в отличие от внутреннего `s3_reachable()`).
- Проверено: Lighthouse на карточке товара — прод-сборка (`next build` + `next start`; на dev-сервере Performance занижен из-за неминифицированного Turbopack-бандла и не отражает реальную картину) — Performance 98, SEO 100 (требование: ≥85 / ≥95); мобильная раскладка от 360px без горизонтального скролла на всех трёх страницах (проверено мобильной эмуляцией, не просто узким desktop-окном).

## Задача 2.2 — Админ-CRUD каталога + изображения

- Все admin-эндпоинты каталога под `/v1/admin` (require_role("admin")): CRUD категорий, товаров (+ дублирование, массовое вкл/выкл `/admin/products/bulk-status`), вариантов; `POST /admin/products/{id}/images` (multipart → S3 + фоновый ресайз 400/800px webp через arq).
- Валидации: нельзя деактивировать категорию с активными товарами (`CATEGORY_HAS_ACTIVE_PRODUCTS`), нельзя удалить категорию с подкатегориями/товарами, нельзя удалить последний вариант товара (`LAST_VARIANT`). Удаление товара — мягкое (`deleted_at`).
- Новая колонка `product_images.thumbnail_s3_key`: `s3_key` указывает на оригинал сразу после загрузки и переключается на 800px webp после фоновой обработки; список каталога использует thumbnail (400px), карточка товара — оба URL.
- Найдено и исправлено до мёржа: `upload_product_image` не вызывал `ensure_bucket_exists()` — с уже существующим (по прежним прогонам) бакетом MinIO это маскировалось, но на чистом томе падало с `NoSuchBucket`. Поймано полным прогоном `docker compose down -v` + `make test`, а не только локальным venv-прогоном.
- Тесты (18 новых): CRUD и валидации категорий/товаров/вариантов, требование роли admin, дублирование с обнулением остатков и `is_active=False`, массовое вкл/выкл, отклонение не-изображений, реальная генерация двух webp-превью (проверено через MinIO), полный сценарий категория→товар→2 варианта→фото→виден в публичном каталоге.

## Задача 2.1 — API каталога

- `GET /v1/categories` — дерево активных категорий, кэш в Redis (TTL 5 мин) с явной инвалидацией (`invalidate_category_cache`, для будущего admin CRUD в Задаче 2.2).
- `GET /v1/products` — фильтры: `category` (включая все подкатегории), `q` (tsvector + `word_similarity` для опечаток), `price_min`/`price_max` (по вариантам), `options[key]=value` (JSONB containment, можно несколько значений на ключ), `sort` (price_asc/price_desc/newest/popular — popular считается по реальным `order_items`), пагинация. Facets (диапазон цен + доступные опции) агрегируются по текущей отфильтрованной выборке.
- `GET /v1/products/{slug}` — карточка с вариантами, изображениями (presigned URL из MinIO) и атрибутами; 404 с кодом `PRODUCT_NOT_FOUND`.
- Найдено и исправлено до мёржа: `similarity(name, q)` сравнивал опечатку со ВСЕМ названием товара, из-за чего на реальных (многословных) названиях сходство падало ниже порога и опечатка переставала находиться — заменено на `word_similarity`, которое ищет лучшее совпадение внутри строки. Проверено вживую через реальный сид (не только в тестах).
- Тесты (26 новых): по каждому фильтру и их комбинациям, сортировкам, facets, пагинации, инвалидации кэша категорий, точный и опечаточный поиск, presigned URL картинки, p95 задержки списка < 100 мс.

## Задача 1.2 — Auth-модуль

- Все эндпоинты раздела 6.2 (`/v1/auth/register|login|refresh|logout|verify-email|forgot-password|reset-password`), смонтированные под `/v1` (Caddy снимает `/api`).
- `core/security.py`: argon2 для паролей, JWT-access-токены (15 мин, с `jti`), refresh-токены (случайные, в БД хранится только sha256-хеш), одноразовые JWT-токены для верификации email/сброса пароля (сброс пароля инвалидируется отпечатком текущего `password_hash` — работает без таблицы отзыва).
- `app/dependencies.py`: `get_current_user`, `require_role` (Bearer JWT).
- Ротация refresh-токена при каждом `/refresh` с отзывом старого; повторное использование отозванного токена — 401.
- Rate limiting на Redis (`core/rate_limit.py`): логин 5/15 мин на email+IP, регистрация 3/час на IP.
- `core/email.py` + Jinja2-шаблоны, `core/queue.py` (arq) и `app/workers/` (задачи отправки писем верификации/сброса пароля); отдельный сервис `worker` в docker-compose.
- Исправлено: `uvicorn --proxy-headers` (иначе rate limiting по IP видел бы только адрес Caddy, а не клиента); удлинён дефолтный `JWT_SECRET_KEY` в `.env.example` (был короче 32 байт); `get_redis()` — возврат `Any` под mypy strict из-за новой версии `redis-py`.
- Интеграционные тесты (54 всего): полный цикл регистрация → верификация → логин → refresh → logout; повторный refresh старым токеном → 401; rate limit на логине и регистрации; forgot-password не раскрывает существование email; one-time-use сброса пароля.

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
