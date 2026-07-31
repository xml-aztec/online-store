from app.config import settings
from app.exceptions import DomainError
from app.payments.providers.base import PaymentProvider
from app.payments.providers.mock import MockPaymentProvider

_PROVIDER_CLASSES: dict[str, type[PaymentProvider]] = {
    "mock": MockPaymentProvider,
}


def get_provider(name: str) -> PaymentProvider:
    if name not in settings.payment_providers_list:
        raise DomainError("Провайдер не подключён", code="PROVIDER_NOT_FOUND", status_code=404)

    provider_cls = _PROVIDER_CLASSES.get(name)
    if provider_cls is None:
        raise DomainError("Провайдер не поддерживается", code="PROVIDER_NOT_FOUND", status_code=404)

    return provider_cls()


def get_default_provider() -> PaymentProvider:
    return get_provider(settings.payment_providers_list[0])
