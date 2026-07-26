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

    # Embedding vector dimension for document_chunks.embedding. MUST match the
    # embedding model's output size (text-embedding-3-small = 1536). Changing it
    # requires re-ALTERing the vector column and re-training agents.
    EMBEDDING_DIM: int = 1536

    # OpenAI — embeddings + the RAG agent's generation. NEVER hardcode the key
    # here; it lives in .env (git-ignored). Cheapest pair: text-embedding-3-small
    # (embeddings) + gpt-4.1-nano (generation).
    OPENAI_API_KEY: str = ""
    EMBEDDING_MODEL: str = "text-embedding-3-small"  # 1536 dims
    RAG_LLM_MODEL: str = "gpt-4.1-nano"

    # Public base URL Vapi's servers can reach us at, used to build the
    # custom-LLM endpoint (`{base}/api/vapi/custom-llm/{agent_id}`). LOCAL DEV:
    # this MUST be an ngrok (or similar) tunnel — Vapi can't reach localhost.
    # `NGROK_URL` (already in .env) takes precedence when set.
    NGROK_URL: str = "https://mooned-wreckage-proofread.ngrok-free.dev"
    PUBLIC_BACKEND_URL: str = "http://localhost:5000"

    @property
    def public_base_url(self) -> str:
        """The externally reachable base URL for Vapi callbacks."""
        return (self.NGROK_URL or self.PUBLIC_BACKEND_URL).rstrip("/")

    # Origins allowed to call the API directly from a browser. The Next.js
    # server talks to us server-to-server (no CORS needed), but this lets the
    # browser hit the API directly later if we want.
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:3001"]


settings = Settings()
