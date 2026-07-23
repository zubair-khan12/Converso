"""Alembic environment — standalone (no Flask-Migrate).

Targets the plain-SQLAlchemy Base metadata and reads the DB URL from app settings.
"""
from logging.config import fileConfig

from alembic import context

from app.config import settings
from app.database import Base
import app.models  # noqa: F401  (registers every table on Base.metadata)

# Alembic Config object (values from the .ini in use).
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Inject the runtime DB URL (escape % for configparser interpolation).
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL.replace("%", "%%"))

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations without a DB connection (emits SQL)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations with a live connection."""
    from sqlalchemy import engine_from_config, pool

    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
