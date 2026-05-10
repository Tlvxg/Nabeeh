"""Application configuration using Pydantic BaseSettings."""

from pathlib import Path

from pydantic_settings import BaseSettings

# Backend root directory (where .env lives)
_BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # App
    APP_NAME: str = "Nabeeh API"
    APP_VERSION: str = "2.0.0"
    DEBUG: bool = False

    # Supabase
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""  # anon key for read operations
    SUPABASE_SERVICE_KEY: str = ""  # service role key for write operations

    # Data Provider
    DATA_PROVIDER: str = "yfinance"  # "yfinance" or future alternatives

    # News APIs
    GNEWS_API_KEY: str = ""  # GNews API key (optional, skips if empty)

    # OpenRouter (AI Assistant — DeepSeek)
    OPENROUTER_API_KEY: str = ""

    # Email Alerts (Resend)
    RESEND_API_KEY: str = ""  # optional, graceful degradation if empty
    ALERT_FROM_EMAIL: str = "Nabeeh <onboarding@resend.dev>"  # default for testing
    FRONTEND_BASE_URL: str = "http://localhost:5173"  # for stock detail page links

    # Alert gating: minimum |score_delta| to trigger an email when a previous
    # reading exists. Sub-threshold updates still write the AI note for the
    # dashboard but skip the email to avoid inbox fatigue.
    ALERT_MIN_SCORE_DELTA: int = 5

    # Scheduler
    SCHEDULER_ENABLED: bool = True  # Set False to disable cron jobs in dev

    # CORS — comma-separated origins for production
    # e.g. "https://nabeeh.vercel.app,https://nabeeh.com"
    FRONTEND_URL: str = "http://localhost:5173"

    model_config = {
        "env_file": str(_BACKEND_DIR / ".env"),
        "env_file_encoding": "utf-8",
        "case_sensitive": True,
    }


settings = Settings()
