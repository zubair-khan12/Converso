"""Application settings, loaded from environment / .env via pydantic-settings.

**No secret has a working default here.** This file is committed, so any value
in it is public — a default that happens to work is a secret that has already
leaked. Secrets come from the environment (`.env` locally, real env vars in
production) and default to `""`, so a missing one fails loudly at startup
rather than silently running on a value everyone can read.

`validate_settings()` (called from `app/main.py`) enforces that in production
and warns in development.
"""
import sys

from pydantic_settings import BaseSettings, SettingsConfigDict

# The stock SECRET_KEY. Named so startup can refuse to run with it in
# production — it signs the admin session cookie, and it's public in this repo.
DEV_SECRET_KEY = "dev-secret-change-me"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", case_sensitive=False, extra="ignore"
    )

    # "development" | "production". Set ENVIRONMENT=production on the deployed
    # instance — it turns on secure cookies and the required-secret checks.
    ENVIRONMENT: str = "development"

    # --- Secrets (must come from the environment) ---

    # Signs the admin session cookie.
    SECRET_KEY: str = DEV_SECRET_KEY

    # Fernet key encrypting tenant integration credentials (Vapi, Cal.com,
    # Telnyx) at rest. Must be a urlsafe-base64 32-byte key:
    #   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # Rotating it makes existing encrypted credentials undecryptable — tenants
    # have to reconnect their integrations.
    ENCRYPTION_KEY: str = ""

    # Postgres connection string, including its password.
    DATABASE_URL: str = ""

    # Platform OpenAI key — embeddings + the RAG/scheduling agent's generation.
    OPENAI_API_KEY: str = ""

    # NOTE: there is deliberately no VAPI_API_KEY (or Cal.com / Twilio /
    # Telnyx) setting. Those are *per tenant*, not platform-wide: each tenant
    # pastes their own in the dashboard and it is stored encrypted in the
    # `integrations` table. A platform-wide key would put every tenant's calls
    # on one account. See `app/integrations/service.py`.

    # --- Non-secret configuration ---

    # Embedding vector dimension for document_chunks.embedding. MUST match the
    # embedding model's output size (text-embedding-3-small = 1536). Changing it
    # requires re-ALTERing the vector column and re-training agents.
    EMBEDDING_DIM: int = 1536
    EMBEDDING_MODEL: str = "text-embedding-3-small"  # 1536 dims
    RAG_LLM_MODEL: str = "gpt-4.1-nano"

    # Public base URL Vapi's servers can reach us at, used to build the
    # custom-LLM endpoint (`{base}/api/vapi/custom-llm/{agent_id}`).
    # LOCAL DEV: set NGROK_URL to a tunnel — Vapi can't reach localhost.
    # PRODUCTION: set PUBLIC_BACKEND_URL to the deployed https origin.
    NGROK_URL: str = ""
    PUBLIC_BACKEND_URL: str = "http://localhost:5000"

    # Origins allowed to call the API directly from a browser. The Next.js
    # server talks to us server-to-server (no CORS needed), but this lets the
    # browser hit the API directly later if we want. Override in production
    # with the real frontend origin — never leave localhost open there.
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:3001"]

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.strip().lower() == "production"

    @property
    def public_base_url(self) -> str:
        """The externally reachable base URL for Vapi callbacks."""
        return (self.NGROK_URL or self.PUBLIC_BACKEND_URL).rstrip("/")


settings = Settings()


def _secret_problems(s: Settings) -> list[str]:
    """Every unset-or-unsafe secret, as human-readable problems."""
    problems: list[str] = []

    if not s.DATABASE_URL:
        problems.append("DATABASE_URL is not set.")

    if not s.ENCRYPTION_KEY:
        problems.append(
            "ENCRYPTION_KEY is not set. Generate one with:\n"
            '      python -c "from cryptography.fernet import Fernet; '
            'print(Fernet.generate_key().decode())"'
        )

    if s.SECRET_KEY == DEV_SECRET_KEY:
        problems.append(
            "SECRET_KEY is still the development default (public in this repo). "
            "It signs the admin session cookie, so anyone could forge an admin "
            "session. Set a long random value."
        )

    if not s.OPENAI_API_KEY:
        problems.append(
            "OPENAI_API_KEY is not set — knowledge-base retrieval and the "
            "scheduling agent cannot run without it."
        )

    if not s.NGROK_URL and s.PUBLIC_BACKEND_URL.startswith("http://localhost"):
        problems.append(
            "PUBLIC_BACKEND_URL still points at localhost — Vapi's servers "
            "can't reach it, so custom-LLM calls (knowledge base, scheduling) "
            "will fail. Set it to the deployed https origin."
        )

    if any("localhost" in o for o in s.CORS_ORIGINS):
        problems.append(
            "CORS_ORIGINS still allows localhost. Set it to the real frontend origin."
        )

    return problems


def validate_settings(s: Settings | None = None) -> None:
    """Fail fast in production on a missing or unsafe secret; warn in dev.

    Deployments break loudly and early here rather than at the first request
    that needs the value — a half-configured instance that boots is worse than
    one that refuses to.
    """
    s = s or settings
    problems = _secret_problems(s)
    if not problems:
        return

    listed = "\n".join(f"  - {p}" for p in problems)
    if s.is_production:
        sys.exit(
            f"\nRefusing to start: {len(problems)} configuration problem(s) in "
            f"production.\n{listed}\n\nSet these in the environment and restart.\n"
        )
    print(f"\n[config] {len(problems)} setting(s) not production-ready:\n{listed}\n")
