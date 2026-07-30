.PHONY: up down logs test lint migrate seed

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
