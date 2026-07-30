# Техническое задание: интернет-магазин HobbyLife

**Версия:** 1.1
**Статус:** к разработке
**Назначение документа:** спецификация для команды разработки (в т.ч. ИИ-агентов). Каждый раздел самодостаточен и может быть выдан агенту как отдельная задача. Дорожная карта и разбивка на задачи для агентов — в отдельном документе `plan-razrabotki.md`.

---

## 1. Общее описание

Интернет-магазин **HobbyLife** (Бишкек, Кыргызстан): товары для дома из пластика и сопутствующие категории — посуда и пищевые контейнеры, товары для кухни и ванной, корзины и контейнеры для хранения, детские товары (ванночки и т.п.).

Состав: публичный каталог с корзиной и оформлением заказа, личный кабинет покупателя, административная панель (товары, заказы, импорт), приём онлайн-платежей через локальные провайдеры + оплата при получении.

**Валюта:** кыргызский сом (KGS), код в конфиге, формат отображения `1 250 сом`. **Язык интерфейса:** русский (структура i18n закладывается, вторым языком в перспективе — кыргызский).

### 1.1. Роли пользователей

| Роль | Возможности |
|---|---|
| Гость | Просмотр каталога, поиск, корзина (без регистрации), оформление заказа с указанием email |
| Покупатель (customer) | Всё, что гость + личный кабинет, история заказов, сохранённые адреса |
| Менеджер (manager) | Управление заказами: смена статусов, просмотр клиентов |
| Администратор (admin) | Всё, что менеджер + управление товарами, категориями, скидками, пользователями |

### 1.2. Зафиксированные решения

- Валюта одна — KGS. Мультивалютность — вне скоупа.
- Доставка v1: **самовывоз** (адрес магазина/склада в Бишкеке) и **курьер по Бишкеку с фиксированной ценой** (значение в настройках админки, по умолчанию 150 сом; бесплатно от суммы N — тоже настройка). Интеграции со службами доставки — v2.
- Оплата: **при получении** (наличные/перевод курьеру — работает с первого дня, без интеграций) + **онлайн** через локальные провайдеры (см. 5.4): MBank, ELQR, карты через агрегатора. Все онлайн-провайдеры — за единым интерфейсом `PaymentProvider`.
- Объём каталога: ориентир 500–5 000 SKU → полнотекстовый поиск средствами PostgreSQL (tsvector + pg_trgm для опечаток). Meilisearch не требуется; при росте свыше ~50 000 SKU — пересмотреть.
- Импорт товаров: **Excel (xlsx) в v1** — основной инструмент первичного наполнения; **1С (CommerceML)** — v2, но поля моделей совместимы с CommerceML заранее (внешний код товара `external_id`).
- Email-уведомления обязательны (подтверждение заказа, смена статуса). SMS/WhatsApp-уведомления — v2 (в Бишкеке востребованы, заложить интерфейс `Notifier`).
- Типичные опции вариантов для этого ассортимента: **объём (л), цвет, размер/габариты, количество в наборе**. Атрибуты товара (jsonb): материал, бренд, страна производства, назначение (морозилка/СВЧ, пищевой пластик).

---

## 2. Технологический стек

### 2.1. Backend
- **Python 3.12+, FastAPI** (последняя стабильная версия)
- **SQLAlchemy 2.0** (async, `asyncpg`) + **Alembic** (миграции)
- **Pydantic v2** — схемы запросов/ответов, настройки через `pydantic-settings`
- **PostgreSQL 16** — основная БД
- **Redis 7** — кэш, сессии гостевых корзин, rate limiting, брокер фоновых задач
- **arq** — фоновые задачи (email, обработка изображений)
- **httpx** — исходящие HTTP-запросы (платёжный провайдер)
- Аутентификация: **JWT** (access 15 мин + refresh 30 дней, refresh хранится в httpOnly cookie, ротация при каждом обновлении)
- Пароли: **argon2** (`argon2-cffi`)
- Тесты: **pytest + pytest-asyncio + httpx.AsyncClient**, фикстуры с транзакционным откатом

### 2.2. Frontend
- **Next.js 15+ (App Router), TypeScript, React 19**
- Стили: **Tailwind CSS**
- Состояние: серверные данные — **TanStack Query**; корзина/UI — **Zustand**
- Формы: **react-hook-form + zod**
- API-клиент: типы генерируются из OpenAPI-спеки бэкенда (`openapi-typescript`), запросы через тонкую обёртку над `fetch`
- Рендеринг: страницы каталога и товара — SSR/ISR (SEO); корзина, checkout, кабинет — CSR

### 2.3. Инфраструктура
- **Docker Compose**: `api`, `worker` (arq), `frontend`, `postgres`, `redis`, `caddy` (reverse proxy + TLS)
- Хранение изображений: S3-совместимое хранилище (Cloudflare R2 / MinIO для локальной разработки)
- CI: линт (`ruff`, `eslint`), типы (`mypy --strict` на слое сервисов, `tsc`), тесты, сборка образов
- Логи: структурированные JSON-логи (`structlog`), request_id через middleware

---

## 3. Архитектура

```
[Браузер] ⇄ [Caddy] ⇄ [Next.js SSR/CSR] ⇄ [FastAPI] ⇄ [PostgreSQL]
                                              ⇅            
                                          [Redis] ⇄ [arq worker]
                                              ⇅
                                        [S3-хранилище]
[Платёжный провайдер] —webhook→ [FastAPI /api/v1/webhooks/payment]
```

- Фронтенд ходит **только** в FastAPI по REST (`/api/v1/...`). Прямого доступа фронта к БД нет.
- SSR-запросы Next.js к API идут по внутренней Docker-сети (`http://api:8000`), клиентские — через Caddy (`/api` проксируется на api-сервис).
- Все денежные вычисления — только на бэкенде. Фронт никогда не передаёт цены, только идентификаторы и количества.

### 3.1. Структура backend-проекта

```
backend/
├── alembic/                  # миграции
├── app/
│   ├── main.py               # создание FastAPI-приложения, middleware, роутеры
│   ├── config.py             # pydantic-settings, все ENV-переменные
│   ├── database.py           # engine, session factory, get_db dependency
│   ├── dependencies.py       # get_current_user, require_role, pagination
│   ├── exceptions.py         # доменные исключения + exception handlers
│   ├── core/
│   │   ├── security.py       # JWT, хэширование паролей
│   │   ├── redis.py          # клиент Redis
│   │   ├── storage.py        # S3-клиент, генерация presigned URL
│   │   └── email.py          # отправка писем (шаблоны Jinja2)
│   ├── auth/                 # router, service, schemas, models (User, RefreshToken)
│   ├── catalog/               # router, service, schemas, models (Category, Product, ProductVariant, ProductImage)
│   ├── cart/                 # router, service, schemas (корзина в Redis)
│   ├── orders/               # router, service, schemas, models (Order, OrderItem, OrderStatusHistory)
│   ├── payments/             # router (webhook), service, providers/ (base.py + конкретный провайдер)
│   ├── admin/                # роутеры админ-операций (защищены require_role)
│   └── workers/               # задачи arq: send_email, process_image
├── tests/
│   ├── conftest.py           # тестовая БД, фикстуры, фабрики
│   └── test_{module}/
├── pyproject.toml
└── Dockerfile
```

Правила для каждого модуля: `router.py` — только HTTP-слой (валидация, коды ответов), вся бизнес-логика в `service.py`, `schemas.py` — Pydantic-модели запросов/ответов, `models.py` — SQLAlchemy. Роутеры не обращаются к БД напрямую.

### 3.2. Структура frontend-проекта

```
frontend/
├── src/
│   ├── app/
│   │   ├── (shop)/
│   │   │   ├── page.tsx                  # главная
│   │   │   ├── catalog/[[...slug]]/      # каталог с категориями и фильтрами
│   │   │   ├── product/[slug]/           # карточка товара
│   │   │   ├── cart/                     # корзина
│   │   │   └── checkout/                 # оформление заказа
│   │   ├── (account)/
│   │   │   ├── login/  register/  forgot-password/
│   │   │   └── account/                  # профиль, заказы, адреса
│   │   └── admin/                        # админ-панель (guard по роли)
│   │       ├── products/  categories/  orders/  users/
│   ├── entities/         # типы и API-хуки по доменам (product, cart, order, user)
│   ├── shared/
│   │   ├── api/          # сгенерированные типы OpenAPI + fetch-обёртка
│   │   ├── ui/           # базовые компоненты (Button, Input, Modal, Table...)
│   │   └── lib/          # утилиты, форматирование цен/дат
│   └── widgets/          # составные блоки (Header, ProductCard, CartDrawer...)
└── Dockerfile
```

---

## 4. Схема базы данных

Все таблицы: `id UUID PK DEFAULT gen_random_uuid()`, `created_at`, `updated_at` (timestamptz, автозаполнение). Деньги — `NUMERIC(12,2)`, в коде — `Decimal`. Мягкое удаление (`deleted_at`) только там, где указано.

### users
| Поле | Тип | Ограничения |
|---|---|---|
| email | citext | UNIQUE, NOT NULL |
| password_hash | text | NULL (для гостевых заказов аккаунт может создаваться без пароля) |
| full_name | text | |
| phone | text | |
| role | text | CHECK IN ('customer','manager','admin'), DEFAULT 'customer' |
| is_active | bool | DEFAULT true |
| email_verified_at | timestamptz | NULL |

### refresh_tokens
`user_id FK → users`, `token_hash text UNIQUE`, `expires_at`, `revoked_at NULL`. Индекс по `user_id`.

### addresses
`user_id FK → users`, `city`, `street`, `building`, `apartment NULL`, `postal_code NULL`, `comment NULL`, `is_default bool`.

### categories
| Поле | Тип | Ограничения |
|---|---|---|
| parent_id | UUID | FK → categories, NULL (иерархия) |
| name | text | NOT NULL |
| slug | text | UNIQUE, NOT NULL |
| sort_order | int | DEFAULT 0 |
| is_active | bool | DEFAULT true |

Максимальная вложенность — 3 уровня (валидировать в сервисе).

### products
| Поле | Тип | Ограничения |
|---|---|---|
| category_id | UUID | FK → categories, NOT NULL |
| name | text | NOT NULL |
| slug | text | UNIQUE, NOT NULL |
| description | text | |
| attributes | jsonb | DEFAULT '{}' (произвольные характеристики для отображения: материал, бренд...) |
| is_active | bool | DEFAULT true |
| deleted_at | timestamptz | NULL (мягкое удаление) |
| search_vector | tsvector | GENERATED из name + description, GIN-индекс |

### product_variants
Каждый товар имеет **минимум один** вариант (даже без опций). Цена и остаток живут только здесь.

| Поле | Тип | Ограничения |
|---|---|---|
| product_id | UUID | FK → products, NOT NULL, ON DELETE CASCADE |
| sku | text | UNIQUE, NOT NULL |
| options | jsonb | DEFAULT '{}' — например `{"size":"M","color":"black"}` |
| price | numeric(12,2) | NOT NULL, CHECK (price >= 0) |
| compare_at_price | numeric(12,2) | NULL (старая цена для зачёркивания) |
| stock_qty | int | NOT NULL, DEFAULT 0, CHECK (stock_qty >= 0) |
| is_active | bool | DEFAULT true |

UNIQUE (product_id, options).

### product_images
`product_id FK`, `s3_key text`, `alt text`, `sort_order int`. Первое по sort_order — главное фото.

### orders
| Поле | Тип | Ограничения |
|---|---|---|
| number | text | UNIQUE — человекочитаемый номер, формат `ORD-{YYYYMMDD}-{счётчик}` |
| user_id | UUID | FK → users, NULL (гостевой заказ) |
| email | citext | NOT NULL |
| phone | text | NOT NULL |
| full_name | text | NOT NULL |
| status | text | CHECK IN ('pending','awaiting_payment','paid','processing','shipped','delivered','cancelled','refunded') |
| delivery_method | text | CHECK IN ('pickup','courier') |
| delivery_address | jsonb | NULL — снапшот адреса |
| delivery_cost | numeric(12,2) | NOT NULL DEFAULT 0 |
| subtotal | numeric(12,2) | NOT NULL — сумма позиций |
| total | numeric(12,2) | NOT NULL — subtotal + delivery_cost |
| comment | text | NULL |
| expires_at | timestamptz | NULL — дедлайн оплаты для awaiting_payment |

### order_items
Снапшот товара на момент заказа — **не** ссылаться на актуальные цены.

`order_id FK ON DELETE CASCADE`, `variant_id FK → product_variants (SET NULL при удалении)`, `product_name text`, `variant_options jsonb`, `sku text`, `unit_price numeric(12,2)`, `quantity int CHECK (quantity > 0)`, `line_total numeric(12,2)`.

### order_status_history
`order_id FK`, `from_status`, `to_status`, `changed_by UUID NULL (FK → users)`, `comment NULL`. Запись создаётся сервисом при каждой смене статуса.

### payments
| Поле | Тип | Ограничения |
|---|---|---|
| order_id | UUID | FK → orders, NOT NULL |
| provider | text | NOT NULL |
| external_id | text | id платежа у провайдера, UNIQUE вместе с provider |
| amount | numeric(12,2) | NOT NULL |
| status | text | CHECK IN ('created','pending','succeeded','failed','refunded') |
| raw_payload | jsonb | последний webhook-payload |

### payment_events
Идемпотентность webhook'ов: `provider text`, `event_id text`, UNIQUE (provider, event_id), `payload jsonb`. Если событие уже есть — webhook отвечает 200 и ничего не делает.

### promo_codes (v1 — простая версия)
`code text UNIQUE (uppercase)`, `discount_type CHECK IN ('percent','fixed')`, `discount_value numeric(12,2)`, `min_order_total NULL`, `starts_at`, `ends_at`, `max_uses NULL`, `used_count int DEFAULT 0`, `is_active bool`. В orders добавить `promo_code_id FK NULL`, `discount_amount numeric(12,2) DEFAULT 0`; тогda `total = subtotal - discount_amount + delivery_cost`.

---

## 5. Бизнес-правила (критичные)

### 5.1. Конечный автомат статусов заказа

Разрешённые переходы (все остальные — ошибка 409):

```
pending → awaiting_payment | cancelled
awaiting_payment → paid | cancelled          (paid — ТОЛЬКО из webhook платёжки)
paid → processing | refunded
processing → shipped | cancelled(+refund если оплачен)
shipped → delivered
delivered → refunded
```

- Переход в `cancelled` из `awaiting_payment` происходит автоматически фоновой задачей, если `expires_at` истёк (таймаут оплаты — 30 минут) — с возвратом зарезервированных остатков.
- Каждый переход пишется в `order_status_history` и (для paid/shipped/cancelled) триггерит email покупателю.

### 5.2. Остатки и оформление заказа

Создание заказа (`POST /api/v1/orders`) — одна транзакция:

1. Прочитать корзину из Redis, проверить непустоту.
2. Для каждой позиции: `UPDATE product_variants SET stock_qty = stock_qty - :qty WHERE id = :id AND stock_qty >= :qty AND is_active = true` — проверять rowcount. Если 0 — откат всей транзакции, ответ 409 со списком недоступных позиций и доступным количеством.
3. Пересчитать все цены из БД (клиентские цены игнорируются), применить промокод, посчитать доставку.
4. Создать `orders` + `order_items` (снапшоты), статус `awaiting_payment`, `expires_at = now() + 30 min`.
5. Создать платёж у провайдера, вернуть клиенту `order.number` + `payment_url`.
6. Очистить корзину.

Отмена/таймаут неоплаченного заказа возвращает остатки: `stock_qty = stock_qty + qty` по всем позициям.

### 5.3. Корзина

- Хранится в Redis: ключ `cart:{cart_id}`, hash `{variant_id: qty}`, TTL 30 дней, продлевается при каждом изменении.
- `cart_id` — UUID в httpOnly cookie. Для залогиненного пользователя дополнительно `cart:user:{user_id}`.
- При логине: слияние гостевой корзины в пользовательскую (суммировать количества, capped по остаткам), гостевая удаляется.
- Ответ API корзины всегда включает актуальные цены/остатки из БД и флаги `is_available`, `available_qty` — фронт показывает, если что-то подорожало или закончилось.
- Лимит: max 50 позиций, max 99 шт. каждой.

### 5.4. Платежи (Кыргызстан)

Способы оплаты в checkout (enum `payment_method` в orders: `cash_on_delivery`, `online`):

1. **Оплата при получении** — без интеграций. Заказ после создания сразу переходит `pending → processing` (минуя awaiting_payment), остатки списываются как обычно. Обязателен для v1 — это самый популярный способ в местном e-commerce и позволяет запустить магазин до завершения договоров с банками.
2. **Онлайн-оплата** — через интерфейс `PaymentProvider`. Целевые реализации (порядок подключения):
   - **MBank** (интернет-эквайринг Оптима/MBank acquiring) — приоритет №1, покрывает большинство покупателей;
   - **ELQR** (национальный QR через Межбанковский процессинговый центр, ipc.kg) — оплата по QR из приложения любого банка КР;
   - **Агрегатор для карт Visa/Mastercard** (FreedomPay / Pay24 / mpo.kg — выбрать по итогам переговоров о комиссии) — как универсальный fallback.

   Точные API-контракты этих провайдеров закрыты и выдаются после заключения договора, поэтому: (а) в кодовой базе сразу делается **`MockPaymentProvider`** (тестовая страница «оплатить/отклонить», полный цикл с webhook) — на нём разрабатывается и тестируется весь флоу; (б) каждая реальная интеграция — отдельная задача по факту получения доступов; (в) включённые провайдеры перечисляются в конфиге, checkout показывает только доступные.

- Интерфейс `PaymentProvider`: `create_payment(order) -> PaymentInfo(external_id, payment_url | qr_payload)`, `parse_webhook(request) -> PaymentEvent`, `refund(payment, amount)`. Для QR-провайдеров вместо редиректа страница оплаты магазина показывает QR-код и поллит статус.
- Webhook `POST /api/v1/webhooks/payment/{provider}`: 1) проверить подпись (секрет из конфига) — иначе 400; 2) идемпотентность через `payment_events`; 3) обновить `payments.status`; 4) при `succeeded` — перевести заказ в `paid`. Отвечать 200 быстро, тяжёлое — в фоновую задачу.
- Сверка суммы: если сумма в webhook ≠ `order.total` — платёж помечается failed, алерт в лог уровня ERROR.
- Возвраты по онлайн-платежам зависят от возможностей провайдера; в v1 допустим ручной возврат вне системы с пометкой статуса в админке.

### 5.5. Аутентификация

- Регистрация: email + пароль (min 8 символов), письмо с подтверждением (токен, TTL 24 ч). Неподтверждённый email не блокирует покупки.
- Логин: выдача access (JWT, 15 мин, в памяти фронта) + refresh (httpOnly Secure cookie, 30 дней, ротация, старый отзывается).
- Восстановление пароля: токен на email, TTL 1 час, одноразовый.
- Rate limiting через Redis: логин — 5 попыток / 15 мин на email+IP; регистрация — 3 / час на IP; создание заказа — 10 / час на IP.
- Гостевой заказ: если email не привязан к аккаунту — создаётся user без пароля; письмо содержит ссылку «установить пароль».

---

## 6. REST API (v1)

Базовый префикс `/api/v1`. Формат ошибок единый:

```json
{ "error": { "code": "OUT_OF_STOCK", "message": "...", "details": {...} } }
```

Пагинация: `?page=1&page_size=24` (max 100), ответ `{ "items": [...], "total": 812, "page": 1, "page_size": 24 }`.

### 6.1. Публичные

| Метод | Путь | Описание |
|---|---|---|
| GET | /categories | Дерево активных категорий |
| GET | /products | Каталог. Параметры: `category` (slug, включая подкатегории), `q` (полнотекстовый поиск), `price_min`, `price_max`, `options[color]=black` (фильтр по опциям вариантов), `sort` = price_asc / price_desc / newest / popular, пагинация |
| GET | /products/{slug} | Карточка: товар + варианты + изображения (presigned/публичные URL) |
| GET | /cart | Текущая корзина с актуальными ценами |
| POST | /cart/items | `{variant_id, qty}` — добавить/увеличить |
| PATCH | /cart/items/{variant_id} | `{qty}` — установить количество (0 = удалить) |
| DELETE | /cart | Очистить |
| POST | /cart/promo | `{code}` — применить промокод (валидация: активен, срок, min сумма, лимит использований) |
| POST | /orders | Оформить заказ: `{email, phone, full_name, delivery_method, address?, comment?}` → `{number, payment_url}` |
| GET | /orders/{number}?email= | Статус заказа для гостя (number + email как проверка) |
| POST | /webhooks/payment/{provider} | Webhook платёжки (см. 5.4) |

### 6.2. Auth

| Метод | Путь |
|---|---|
| POST | /auth/register — `{email, password, full_name}` |
| POST | /auth/login — `{email, password}` → access token; refresh — в cookie |
| POST | /auth/refresh — по cookie → новый access |
| POST | /auth/logout — отзыв refresh |
| POST | /auth/verify-email — `{token}` |
| POST | /auth/forgot-password — `{email}` (ответ всегда 200, без раскрытия существования email) |
| POST | /auth/reset-password — `{token, new_password}` |

### 6.3. Личный кабинет (Bearer, role ≥ customer)

| Метод | Путь |
|---|---|
| GET/PATCH | /me — профиль |
| GET | /me/orders — список своих заказов |
| GET | /me/orders/{number} — детали |
| POST | /me/orders/{number}/cancel — только из pending / awaiting_payment |
| GET/POST | /me/addresses; PATCH/DELETE /me/addresses/{id} |

### 6.4. Админ (role manager/admin, префикс /admin)

| Метод | Путь | Роль |
|---|---|---|
| CRUD | /admin/categories | admin |
| CRUD | /admin/products (+ дублирование, массовое вкл/выкл) | admin |
| CRUD | /admin/products/{id}/variants | admin |
| POST | /admin/products/{id}/images — multipart upload → S3, фоновая генерация превью (400px, 800px, webp) | admin |
| GET | /admin/orders — фильтры: статус, даты, поиск по номеру/email | manager |
| GET | /admin/orders/{id} | manager |
| POST | /admin/orders/{id}/status — `{to_status, comment?}` с валидацией конечного автомата | manager |
| POST | /admin/orders/{id}/refund | admin |
| CRUD | /admin/promo-codes | admin |
| POST | /admin/imports/xlsx — загрузка файла → `{import_id, preview}` | admin |
| POST | /admin/imports/{id}/apply — запуск фоновой задачи | admin |
| GET | /admin/imports/{id} — статус и отчёт (created/updated/errors, ссылка на xlsx с ошибками) | admin |
| GET | /admin/imports/template — скачать шаблон xlsx | admin |
| GET | /admin/users; PATCH /admin/users/{id} (роль, is_active) | admin |
| GET | /admin/stats/summary — заказы/выручка за период, топ товаров | manager |

---

## 7. Frontend: страницы и требования

### 7.1. Публичная часть
1. **Главная** — витрина: баннер, подборки (новинки, популярное), категории. ISR, revalidate 60 c.
2. **Каталог** `/catalog/[...slug]` — SSR. Сетка карточек, дерево категорий, фильтры (цена range, опции, чекбоксы), сортировка, пагинация. Все фильтры — в URL query (шаримые ссылки). Skeleton-загрузка.
3. **Карточка товара** `/product/[slug]` — SSR + ISR. Галерея, выбор варианта (кнопки опций; недоступные комбинации задизейблены), цена выбранного варианта, остаток («в наличии» / «осталось N» при N≤5 / «нет в наличии»), кнопка в корзину, характеристики из attributes, SEO: title/description/OpenGraph/JSON-LD Product.
4. **Корзина** — CSR. Изменение количеств, удаление, промокод, предупреждения об изменении цены/остатков, итоги.
5. **Checkout** — одна страница: контакты → способ доставки → адрес (если курьер) → комментарий → кнопка «Оплатить». Валидация zod. После создания заказа — редирект на payment_url. Страницы результата: `/checkout/success/[number]` и `/checkout/fail/[number]` (статус подтягивать с бэка поллингом каждые 3 с до 2 минут — webhook может прийти позже редиректа).
6. **Кабинет** — профиль, заказы со статус-таймлайном, адреса.

### 7.2. Админ-панель (в том же Next.js, роут /admin, guard по роли из JWT)
- Товары: таблица с поиском/фильтрами, форма товара (вкладки: основное, варианты, изображения с drag-n-drop сортировкой), inline-редактирование цены/остатка в таблице вариантов.
- Заказы: таблица, карточка заказа (состав, клиент, история статусов, кнопки переходов — показывать только допустимые по конечному автомату).
- Дашборд: выручка/заказы за 7/30 дней, последние заказы.

### 7.3. Общие требования
- Адаптивность: мобильный ≥360px, планшет, десктоп. Мобильный — приоритет для публичной части.
- Цены форматировать единой утилитой (разряды, символ валюты из конфига).
- Все мутации — оптимистичные обновления TanStack Query с откатом при ошибке (корзина — обязательно).
- Доступность: семантическая разметка, фокус-стили, alt у изображений.
- Lighthouse на карточке товара: Performance ≥ 85, SEO ≥ 95.

---

## 8. Нефункциональные требования

- **Производительность API**: p95 < 200 мс для GET каталога (кэш списков категорий в Redis, TTL 5 мин, инвалидация при изменении).
- **Безопасность**: OWASP-базис — параметризованные запросы (даёт ORM), валидация всего входа Pydantic, CORS только на домен фронта, secure/httpOnly/SameSite=Lax cookies, HTTPS через Caddy, секреты только из ENV, admin-эндпоинты требуют роль на каждом роуте (dependency `require_role`).
- **Целостность денег**: все суммы считаются в одном месте (`orders/service.py::calculate_totals`), покрыты юнит-тестами, включая округления и промокоды.
- **Логирование**: request_id, user_id, каждый переход статуса заказа, каждый webhook (уровень INFO), несовпадение сумм / невалидные подписи (ERROR).
- **Бэкапы**: pg_dump ежедневно, хранить 14 дней (скрипт + cron в compose).

## 9. Тестирование (обязательный минимум)

- Юнит: расчёт итогов заказа (пустая корзина, промокоды всех типов, границы min_order_total), конечный автомат статусов (все разрешённые и запрещённые переходы).
- Интеграционные (тестовая БД): оформление заказа — успех; конкурентное оформление последнего товара двумя клиентами (должен пройти ровно один); таймаут оплаты возвращает остатки; webhook — идемпотентность (двойная доставка), невалидная подпись, несовпадение суммы.
- Auth: ротация refresh, отзыв при logout, rate limiting.
- Покрытие сервисного слоя ≥ 80%.

## 10. Этапы разработки (порядок для агентов)

| # | Этап | Результат / критерий приёмки |
|---|---|---|
| 1 | Каркас: compose, FastAPI + healthcheck, Next.js-заготовка, CI, Alembic | `docker compose up` поднимает всё; /health = 200 |
| 2 | Модели БД + миграции (все таблицы раздела 4) | миграции применяются с нуля и откатываются |
| 3 | Auth-модуль полностью (6.2) + тесты | все auth-сценарии зелёные |
| 4 | Каталог: API (6.1 categories/products) + загрузка изображений в S3 + админ-CRUD товаров | админ создаёт товар с вариантами и фото; каталог отдаёт его с фильтрами |
| 5 | Фронт: каталог + карточка товара + главная | SSR, SEO-мета, Lighthouse-порог |
| 6 | Корзина: API + фронт | слияние при логине, актуализация цен |
| 7 | Заказы: оформление (5.2), конечный автомат, email-уведомления + тесты конкурентности | конкурентный тест проходит |
| 8 | Платежи: оплата при получении + MockPaymentProvider + webhook + страницы success/fail | полный цикл на mock-провайдере end-to-end; заказ с оплатой при получении проходит без онлайн-оплаты |
| 9 | Кабинет покупателя + админ-заказы + дашборд | менеджер проводит заказ по всем статусам из UI |
| 10 | Excel-импорт (раздел 11.1) | каталог HobbyLife загружается из xlsx с фото, повторный импорт обновляет цены/остатки |
| 11 | Промокоды, полировка, нагрузочный smoke (100 RPS на каталог), бэкапы | критерии раздела 8 |
| 12* | Реальные платёжные провайдеры (MBank → ELQR → агрегатор) | по мере получения доступов; каждая интеграция — отдельная задача по контракту `PaymentProvider` |

Каждый этап = отдельная ветка + PR, мержится только с зелёным CI. Агентам выдавать этапы последовательно, вместе с разделами 4–6 этого документа как контекстом.

---

## 11. Импорт товаров

### 11.1. Excel-импорт (v1)

Админ-раздел «Импорт»: загрузка .xlsx → предпросмотр → применение (фоновая задача arq) → отчёт.

- Формат: одна строка = один вариант товара. Колонки: `external_id`, `Название`, `Категория` (путь через «/», создаётся при отсутствии), `Описание`, `SKU`, `Опции` (строка вида `объём=1.5л; цвет=микс`), `Цена`, `Старая цена`, `Остаток`, `Атрибуты` (`материал=пластик; бренд=HobbyLife`), `Фото` (URL через запятую — скачиваются фоново в S3). Скачиваемый шаблон-образец — кнопкой в админке.
- Строки с одинаковым `Название`+`external_id` товара группируются в один товар с несколькими вариантами.
- Режим upsert: совпадение по `external_id` (приоритет) или `SKU` → обновление цены/остатка/полей; иначе создание. Ничего не удаляется автоматически.
- Предпросмотр: первые 20 строк с разбором + счётчики (создано/обновлено/ошибки). Ошибочные строки не блокируют импорт остальных; отчёт об ошибках скачивается как xlsx.
- В `products` и `product_variants` добавить поле `external_id text NULL` (UNIQUE, для связи с внешними системами) — оно же будущий ключ синхронизации с 1С.

### 11.2. 1С / CommerceML (v2, в v1 не реализуется)

Стандартный протокол CommerceML 2 (два файла: import.xml — товары, offers.xml — цены/остатки) поверх того же upsert-механизма по `external_id`. Эндпоинт совместимости с выгрузкой из «1С:Управление торговлей». В v1 — только заложенное поле `external_id` и модульная структура импортёра (`app/imports/` с интерфейсом `ImportSource`, реализация `XlsxImportSource`).

---

## 12. Решения по итогам уточнений заказчика (история)

1. Ассортимент: пластиковые товары для дома HobbyLife → опции и фильтры раздела 1.2.
2. Кыргызстан, Бишкек, KGS → платежи: оплата при получении + MBank/ELQR/агрегатор (раздел 5.4).
3. Доставка — фиксированные тарифы по Бишкеку + самовывоз.
4. Каталог до ~5 000 SKU → Postgres FTS.
5. Импорт: Excel в v1, 1С (CommerceML) в v2 — раздел 11.
6. Домены и хостинг приобретаются перед деплоем; всё окружение параметризовано через ENV, привязки к домену в коде нет.
