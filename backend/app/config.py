"""Application settings, loaded from environment / .env via pydantic-settings."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", case_sensitive=False, extra="ignore"
    )

    SECRET_KEY: str = "dev-secret-change-me"

    # Fernet key used to encrypt tenant integration credentials (e.g. Vapi API
    # keys) at rest. Must be a valid urlsafe-base64 32-byte Fernet key.
    ENCRYPTION_KEY: str = "YT3fdy_Jci3h9Qv6IItbqPQdiYpf6RFhf95aQq8HL10="

    DATABASE_URL: str = (
        "postgresql+psycopg2://omerbhatti@localhost:5432/voice_ai_platform"
    )

    # Embedding vector dimension for document_chunks.embedding.
    EMBEDDING_DIM: int = 1536

    # Origins allowed to call the API directly from a browser. The Next.js
    # server talks to us server-to-server (no CORS needed), but this lets the
    # browser hit the API directly later if we want.
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:3001"]


settings = Settings()
