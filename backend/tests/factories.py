import factory

factory.Faker._DEFAULT_LOCALE = "ru_RU"


# factory.Factory (not SQLAlchemyModelFactory): builds plain model instances --
# async sessions can't use factory_boy's built-in synchronous persistence hooks.
# Persist explicitly: session.add(SomeFactory.build()); await session.flush()
class BaseFactory(factory.Factory):
    class Meta:
        abstract = True
