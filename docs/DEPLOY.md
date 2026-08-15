# Деплой в продакшен

Пошаговая инструкция для разворачивания HobbyLife на чистом VPS — от голой машины до работающего магазина. Соответствует Задаче 5.3 (ТЗ 2.3, 8).

## 1. Требования

- VPS (2 vCPU / 4 ГБ RAM достаточно для старта — см. лимиты ресурсов в `docker-compose.prod.yml`), Ubuntu 22.04+ или любой дистрибутив с Docker.
- Домен, A-запись которого указывает на IP этого VPS (нужен для автоматического HTTPS через Caddy — без реального домена, только по IP, Let's Encrypt сертификат не выдать).
- Открытые входящие порты 80 и 443 (Caddy: 80 — ACME HTTP-01 challenge и редирект на HTTPS, 443 — сам сайт).
- S3-совместимое хранилище с публичным доступом на чтение (например, [Cloudflare R2](https://developers.cloudflare.com/r2/) — есть бесплатный тир, без платы за исходящий трафик). MinIO в проде не используется — `docker-compose.prod.yml` его не поднимает.
- (Опционально) Аккаунт [Resend](https://resend.com/) для писем и доступы к платёжному провайдеру для онлайн-оплаты — без них магазин работает с оплатой при получении и без email-уведомлений.

## 2. Установка Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
# перелогиниться, чтобы группа docker применилась
```

Проверить: `docker compose version` (нужен Docker Compose v2, идёт в комплекте с современным Docker).

## 3. Клонирование репозитория

```bash
git clone <URL этого репозитория> hobbylife
cd hobbylife
```

## 4. Настройка `.env`

```bash
cp .env.example .env
```

Отредактируйте `.env` и обязательно замените:

| Переменная | Что указать |
|---|---|
| `DOMAIN` | Реальный домен (например, `shop.hobbylife.kg`) — без `http(s)://` |
| `ACME_EMAIL` | Ваш email — Let's Encrypt присылает на него уведомления об истечении сертификата |
| `POSTGRES_PASSWORD` | Сгенерируйте случайный пароль (`openssl rand -hex 24`) |
| `JWT_SECRET_KEY` | Случайная строка ≥32 байт (`openssl rand -hex 32`) |
| `S3_ENDPOINT_URL`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_PUBLIC_URL` | Данные вашего S3-бакета (см. закомментированный пример для Cloudflare R2 в `.env.example`) — бакет должен быть доступен на публичное чтение (presigned URL на приватный бакет тоже сработают, но `S3_PUBLIC_URL` в любом случае должен быть реальным публичным хостом, а не внутренним R2/S3-эндпоинтом) |
| `CORS_ORIGINS` | `https://<ваш домен>` |
| `PAYMENT_WEBHOOK_SECRET` | Случайная строка, если планируете реальный платёжный провайдер |
| `RESEND_API_KEY` | API-ключ вашего аккаунта [Resend](https://resend.com/api-keys), если нужны письма (подтверждение email, сброс пароля, уведомления о заказе) |
| `EMAIL_FROM` | Адрес отправителя. Пока домен `hobbylife.kg` не верифицирован в Resend (SPF/DKIM), письма можно слать только с `onboarding@resend.dev` и только на email, привязанный к самому аккаунту Resend — держите `HobbyLife <onboarding@resend.dev>` до верификации домена. После верификации меняется только эта строка в `.env`, без пересборки кода |
| `TELEGRAM_*`, `PUBLIC_BASE_URL` | Только если нужен Telegram-бот для админов — см. шаг 8 ниже |

`ENVIRONMENT` в `.env.example` стоит `development` — от него зависит флаг `Secure` на auth-cookie (ТЗ 8). Для прод-стека это не полагается на то, что вы не забудете поменять эту строку в `.env`: `docker-compose.prod.yml` жёстко выставляет `ENVIRONMENT=production` для `api`/`worker` (`environment:` в compose-файле имеет приоритет над `env_file:`), так что менять `.env` для этого не нужно.

Остальные переменные (`BACKUP_RETENTION_DAYS`, `COURIER_DELIVERY_COST`, `FREE_DELIVERY_THRESHOLD`, ...) можно оставить по умолчанию.

## 5. Запуск

```bash
make prod-up
```

Это соберёт прод-образы (`target: prod` — без dev-зависимостей и hot reload, см. `backend/Dockerfile` и `frontend/Dockerfile`) и поднимет: `postgres`, `redis`, `api`, `worker`, `frontend`, `caddy`, `backup`. MinIO не поднимается — приложение сразу пишет в настроенный в `.env` S3.

Применить миграции:

```bash
make prod-migrate
```

## 6. Первоначальный каталог

Два варианта, не исключающие друг друга:

- **Демо-каталог HobbyLife** (3 категории, 10 товаров, 27 вариантов — тот же набор, что и в деве):
  ```bash
  docker compose -f docker-compose.prod.yml run --rm api python -m app.scripts.seed
  ```
- **Excel-импорт** (ТЗ 11.1) — зайдите в `/admin/imports` под учёткой admin (см. следующий шаг) и загрузите свой каталог по шаблону.

## 7. Первый администратор

Самостоятельной регистрации с ролью admin в системе нет (регистрация всегда создаёт `role=customer`), поэтому самого первого администратора нужно поднять напрямую через SQL — ровно один раз. Все последующие изменения ролей (назначить менеджера, снять админа и т.д.) делаются уже из самой админки через `/admin/users` (`GET/PATCH /admin/users`, страница `/admin/users` в панели) под учёткой этого первого администратора — сырой SQL для этого больше не нужен.

1. Зарегистрируйтесь обычным способом через `https://<ваш домен>/login` (или `/register`, если такая страница подключена).
2. Повысьте роль напрямую в БД (только для этого самого первого администратора):
   ```bash
   docker compose -f docker-compose.prod.yml exec postgres \
     psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
     -c "UPDATE users SET role = 'admin' WHERE email = 'you@example.com';"
   ```
   (Переменные `POSTGRES_USER`/`POSTGRES_DB` — те же, что в вашем `.env`.)
3. Войдите под этой учёткой и назначайте всех остальных админов/менеджеров через `/admin/users` — без повторного обращения к БД напрямую.

## 8. Telegram-бот (опционально)

Push-уведомления менеджерам/админам о заказах и остатках + смена статуса заказа прямо из чата (ТЗ 5.6). Без этого шага магазин работает как обычно — бот просто не подключён.

1. Создайте бота через [@BotFather](https://t.me/BotFather) (`/newbot`), получите токен и username.
2. В `.env` заполните: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` (без `@`), `TELEGRAM_WEBHOOK_SECRET` (случайная строка), `PUBLIC_BASE_URL=https://<ваш домен>/api` (Caddy стрипает `/api` перед тем, как отдать запрос в `api`-сервис — тот же путь, что у `/api/v1/webhooks/payment/{provider}`).
3. Пересоздайте `api`/`worker` (не `restart` — `docker compose restart` не перечитывает `.env`, нужен новый контейнер):
   ```bash
   docker compose -f docker-compose.prod.yml up -d api worker
   ```
4. Зарегистрируйте webhook в Telegram (одноразово, и повторно — при смене токена/домена):
   ```bash
   make prod-telegram-webhook
   ```
5. Зайдите в `/admin/profile` под учёткой manager/admin → «Подключить Telegram» → откройте ссылку или отсканируйте QR в Telegram → бот подтвердит привязку, а страница профиля сама покажет «Подключено» (поллинг раз в 3 с).

Без реального Telegram-аккаунта эту связку целиком не проверить — прогон описан здесь как ручной шаг, а не в `make test`.

## 9. Проверка

- `curl -I https://<ваш домен>/api/health` → `200`, ответ `{"status":"ok"}` — если сертификат ещё не выдан, curl вернёт ошибку TLS; подождите 10–30 секунд после первого запуска (Caddy получает сертификат при первом обращении) и повторите.
- Откройте `https://<ваш домен>/` в браузере — убедитесь, что нет предупреждения о сертификате (значит, Let's Encrypt действительно выдал его на ваш домен).
- Зайдите под admin в `/admin` — дашборд должен открыться.

## 10. Бэкапы

Сервис `backup` (см. `docker-compose.prod.yml`, `scripts/backup.sh` + `scripts/backup-loop.sh`) делает `pg_dump` сразу при старте стека и затем каждые 24 часа, хранит `BACKUP_RETENTION_DAYS` (по умолчанию 14) дней в именованном томе `backup_data`, старые дампы удаляются автоматически.

- Запустить бэкап вручную: `make prod-backup-now`.
- Посмотреть файлы: `docker compose -f docker-compose.prod.yml exec backup ls -la /backups`.
- Скачать дамп на свою машину: `docker compose -f docker-compose.prod.yml cp backup:/backups/<имя_файла>.sql.gz ./`.
- Восстановить: `gunzip -c <файл>.sql.gz | docker compose -f docker-compose.prod.yml exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"`.

Том `backup_data` физически живёт на том же диске, что и `postgres_data` — это закрывает буквальное требование ТЗ 8 («pg_dump ежедневно, хранить 14 дней»), но не защищает от отказа самого диска/VPS. Для реальной отказоустойчивости рекомендуется дополнительно синхронизировать `backup_data` во внешнее хранилище (например, `rclone` в S3/R2) — это уже за рамками Задачи 5.3.

## 11. Нагрузочный smoke-тест

```bash
docker run --rm -v "$(pwd)/scripts:/scripts" \
  -e BASE_URL=https://<ваш домен>/api/v1 \
  grafana/k6 run /scripts/smoke-test.js
```

Критерий (ТЗ 8): 100 запросов/сек на каталог (`/categories`, `/products` с разными параметрами) в течение 2 минут без единого 5xx-ответа. Скрипт сам падает с ненулевым кодом выхода, если порог нарушен (`checks: ['rate==1']` — единственная проверка в скрипте как раз про отсутствие 5xx; `http_req_duration p(95)<200ms`, тоже из ТЗ 8).

## 12. Дальнейшие обновления

```bash
git pull
make prod-up        # пересоберёт изменившиеся образы
make prod-migrate   # применит новые миграции, если есть
```

`docker compose up -d --build` пересоздаёт только контейнеры с изменившимся образом — уже запущенные `postgres`/`redis` с данными не трогает.

## Логи и диагностика

```bash
make prod-logs                    # все сервисы
docker compose -f docker-compose.prod.yml logs -f api      # только backend
docker compose -f docker-compose.prod.yml logs -f caddy    # проблемы с TLS/доменом обычно видны здесь
```
