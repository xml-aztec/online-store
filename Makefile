.PHONY: up down logs test lint migrate seed \
	prod-up prod-down prod-logs prod-migrate prod-backup-now

up:
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs -f

test:
	docker compose run --rm api pytest

lint:
	docker compose run --rm api ruff check .
	docker compose run --rm api mypy
	docker compose run --rm frontend npm run lint
	docker compose run --rm frontend npx tsc --noEmit

migrate:
	docker compose run --rm api alembic upgrade head

seed:
	docker compose run --rm api python -m app.scripts.seed

# --- Задача 5.3: продакшен (docker-compose.prod.yml), см. docs/DEPLOY.md ---

prod-up:
	docker compose -f docker-compose.prod.yml up -d --build

prod-down:
	docker compose -f docker-compose.prod.yml down

prod-logs:
	docker compose -f docker-compose.prod.yml logs -f

prod-migrate:
	docker compose -f docker-compose.prod.yml run --rm api alembic upgrade head

prod-backup-now:
	docker compose -f docker-compose.prod.yml exec backup /scripts/backup.sh
