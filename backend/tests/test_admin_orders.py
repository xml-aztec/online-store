import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.core.security import create_access_token
from app.orders.models import Order, OrderItem
from app.payments.models import Payment


def _slug(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


async def _make_user(db_session: AsyncSession, *, role: str) -> User:
    user = User(email=f"{role}-{uuid.uuid4().hex[:10]}@example.com", role=role)
    db_session.add(user)
    await db_session.commit()
    return user


def _headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}


async def _make_order(
    db_session: AsyncSession,
    *,
    status: str = "processing",
    email: str = "buyer@example.com",
    total: Decimal = Decimal("1000.00"),
    created_at: datetime | None = None,
    items: list[tuple[str, int, Decimal]] | None = None,
) -> Order:
    order = Order(
        number=_slug("ORD").upper(),
        email=email,
        phone="+996700000000",
        full_name="Покупатель",
        status=status,
        payment_method="cash_on_delivery",
        delivery_method="pickup",
        subtotal=total,
        total=total,
    )
    db_session.add(order)
    await db_session.flush()

    for product_name, quantity, unit_price in items or [("Товар", 1, total)]:
        db_session.add(
            OrderItem(
                order_id=order.id,
                product_name=product_name,
                variant_options={},
                sku=_slug("sku"),
                unit_price=unit_price,
                quantity=quantity,
                line_total=unit_price * quantity,
            )
        )

    if created_at is not None:
        order.created_at = created_at

    await db_session.commit()
    return order


@pytest.mark.asyncio
async def test_customer_role_forbidden_from_admin_orders(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    customer = await _make_user(db_session, role="customer")

    response = await client.get("/v1/admin/orders", headers=_headers(customer))

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_manager_can_list_and_filter_orders(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    manager = await _make_user(db_session, role="manager")
    await _make_order(db_session, status="processing", email="alice@example.com")
    await _make_order(db_session, status="cancelled", email="bob@example.com")

    all_orders = await client.get("/v1/admin/orders", headers=_headers(manager))
    assert all_orders.status_code == 200
    assert all_orders.json()["total"] >= 2

    by_status = await client.get(
        "/v1/admin/orders", params={"status": "cancelled"}, headers=_headers(manager)
    )
    assert all(item["status"] == "cancelled" for item in by_status.json()["items"])

    by_search = await client.get(
        "/v1/admin/orders", params={"search": "alice"}, headers=_headers(manager)
    )
    emails = {item["email"] for item in by_search.json()["items"]}
    assert emails == {"alice@example.com"}


@pytest.mark.asyncio
async def test_order_detail_reports_allowed_transitions(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    manager = await _make_user(db_session, role="manager")
    order = await _make_order(db_session, status="awaiting_payment")

    response = await client.get(f"/v1/admin/orders/{order.id}", headers=_headers(manager))

    assert response.status_code == 200
    body = response.json()
    assert set(body["allowed_transitions"]) == {"paid", "cancelled"}
    assert body["items"][0]["product_name"] == "Товар"


@pytest.mark.asyncio
async def test_manager_can_transition_order_status(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    manager = await _make_user(db_session, role="manager")
    order = await _make_order(db_session, status="awaiting_payment")

    response = await client.post(
        f"/v1/admin/orders/{order.id}/status",
        json={"to_status": "paid", "comment": "Проверено вручную"},
        headers=_headers(manager),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "paid"
    assert body["status_history"][-1]["comment"] == "Проверено вручную"
    assert str(manager.id) == body["status_history"][-1]["changed_by"]


@pytest.mark.asyncio
async def test_disallowed_transition_rejected_by_backend(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    manager = await _make_user(db_session, role="manager")
    order = await _make_order(db_session, status="awaiting_payment")

    response = await client.post(
        f"/v1/admin/orders/{order.id}/status",
        json={"to_status": "delivered"},
        headers=_headers(manager),
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "INVALID_STATUS_TRANSITION"


@pytest.mark.asyncio
async def test_manager_cannot_refund_only_admin_can(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    manager = await _make_user(db_session, role="manager")
    admin = await _make_user(db_session, role="admin")
    order = await _make_order(db_session, status="paid")
    db_session.add(
        Payment(
            order_id=order.id,
            provider="mock",
            external_id=_slug("pay"),
            status="succeeded",
            amount=order.total,
        )
    )
    await db_session.commit()

    forbidden = await client.post(
        f"/v1/admin/orders/{order.id}/refund", headers=_headers(manager)
    )
    assert forbidden.status_code == 403

    allowed = await client.post(f"/v1/admin/orders/{order.id}/refund", headers=_headers(admin))
    assert allowed.status_code == 200
    assert allowed.json()["status"] == "refunded"


@pytest.mark.asyncio
async def test_refund_without_successful_payment_returns_404(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    admin = await _make_user(db_session, role="admin")
    order = await _make_order(db_session, status="paid")

    response = await client.post(f"/v1/admin/orders/{order.id}/refund", headers=_headers(admin))

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "PAYMENT_NOT_FOUND"


@pytest.mark.asyncio
async def test_stats_summary_matches_known_orders(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    manager = await _make_user(db_session, role="manager")
    now = datetime.now(UTC)

    # Within 7 days (and therefore also within 30): counts toward both windows.
    await _make_order(
        db_session,
        status="processing",
        total=Decimal("1000.00"),
        created_at=now - timedelta(days=1),
        items=[("Тазик", 2, Decimal("500.00"))],
    )
    # Within 30 days but not 7: counts only toward the 30-day window.
    await _make_order(
        db_session,
        status="delivered",
        total=Decimal("500.00"),
        created_at=now - timedelta(days=15),
        items=[("Тазик", 1, Decimal("500.00"))],
    )
    # Cancelled: counts toward orders_count but excluded from revenue/top-products.
    await _make_order(
        db_session,
        status="cancelled",
        total=Decimal("9999.00"),
        created_at=now - timedelta(days=2),
        items=[("Контейнер", 5, Decimal("9999.00"))],
    )
    # Older than 30 days: excluded from both windows entirely.
    await _make_order(
        db_session,
        status="processing",
        total=Decimal("100000.00"),
        created_at=now - timedelta(days=40),
        items=[("Старый товар", 100, Decimal("100000.00"))],
    )

    response = await client.get("/v1/admin/stats/summary", headers=_headers(manager))

    assert response.status_code == 200
    body = response.json()
    assert body["last_7_days"]["orders_count"] == 2  # processing(1d) + cancelled(2d)
    assert Decimal(body["last_7_days"]["revenue"]) == Decimal("1000.00")
    assert body["last_30_days"]["orders_count"] == 3  # + delivered(15d)
    assert Decimal(body["last_30_days"]["revenue"]) == Decimal("1500.00")

    top_by_name = {item["product_name"]: item for item in body["top_products"]}
    # 40 days old -- outside the 30-day top-products window.
    assert "Старый товар" not in top_by_name
    assert top_by_name["Тазик"]["quantity_sold"] == 3
    assert Decimal(top_by_name["Тазик"]["revenue"]) == Decimal("1500.00")
    assert "Контейнер" not in top_by_name  # cancelled order excluded


@pytest.mark.asyncio
async def test_stats_summary_includes_previous_period_for_deltas(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    manager = await _make_user(db_session, role="manager")
    now = datetime.now(UTC)
    headers = _headers(manager)

    # Deltas rather than exact totals: the dev/test DB isn't guaranteed empty
    # of other orders (see _seed_catalog's own note on the same issue), so
    # this only asserts what *these* two orders contribute to each window.
    baseline = (await client.get("/v1/admin/stats/summary", headers=headers)).json()

    await _make_order(
        db_session,
        status="processing",
        total=Decimal("100.00"),
        created_at=now - timedelta(days=2),
    )
    # Falls in the previous-7-day window (8-14 days ago), not the current one.
    await _make_order(
        db_session,
        status="processing",
        total=Decimal("300.00"),
        created_at=now - timedelta(days=10),
    )

    body = (await client.get("/v1/admin/stats/summary", headers=headers)).json()

    assert body["last_7_days"]["orders_count"] - baseline["last_7_days"]["orders_count"] == 1
    assert body["prev_7_days"]["orders_count"] - baseline["prev_7_days"]["orders_count"] == 1
    revenue_delta = Decimal(body["prev_7_days"]["revenue"]) - Decimal(
        baseline["prev_7_days"]["revenue"]
    )
    assert revenue_delta == Decimal("300.00")


@pytest.mark.asyncio
async def test_order_status_filter_accepts_multiple_values(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    manager = await _make_user(db_session, role="manager")
    await _make_order(db_session, status="pending")
    await _make_order(db_session, status="awaiting_payment")
    await _make_order(db_session, status="delivered")

    response = await client.get(
        "/v1/admin/orders",
        params={"status": ["pending", "awaiting_payment"]},
        headers=_headers(manager),
    )

    assert response.status_code == 200
    statuses = {item["status"] for item in response.json()["items"]}
    assert statuses == {"pending", "awaiting_payment"}


@pytest.mark.asyncio
async def test_order_status_counts_endpoint(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    manager = await _make_user(db_session, role="manager")
    headers = _headers(manager)
    baseline = (await client.get("/v1/admin/orders/status-counts", headers=headers)).json()[
        "counts"
    ]

    await _make_order(db_session, status="pending")
    await _make_order(db_session, status="pending")
    await _make_order(db_session, status="delivered")

    response = await client.get("/v1/admin/orders/status-counts", headers=headers)

    assert response.status_code == 200
    counts = response.json()["counts"]
    assert counts["pending"] - baseline.get("pending", 0) == 2
    assert counts["delivered"] - baseline.get("delivered", 0) == 1
