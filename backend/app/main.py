"""Nabeeh API - FastAPI application factory."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings

# Configure root logger so all app.* loggers output to console
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown events."""
    # Startup
    logger.info("Starting %s v%s", settings.APP_NAME, settings.APP_VERSION)
    logger.info("Data provider: %s", settings.DATA_PROVIDER)

    # Load sentiment model (non-blocking: app starts even if model fails)
    try:
        from app.modules.sentiment.model import SentimentModelManager

        manager = SentimentModelManager.get_instance()
        manager.load()
        logger.info("Sentiment model loaded successfully")
    except Exception as e:
        logger.warning("Sentiment model failed to load: %s", e)
        logger.warning("Sentiment endpoints will return 503")

    # Auto-fetch latest prices so MC/risk calculations use fresh data
    try:
        from app.tasks.fetch_prices import fetch_daily_prices

        await fetch_daily_prices()
        logger.info("Daily prices updated from yfinance")
    except Exception as e:
        logger.warning("Price auto-fetch failed: %s", e)
        logger.info("Using existing cached prices in database")

    # Run startup health check (seeds empty/stale tables)
    try:
        from app.tasks.startup_health import run_startup_health_check

        await run_startup_health_check()
    except Exception as e:
        logger.warning("Startup health check failed: %s", e)
        logger.info("Continuing with existing data — cron jobs will fill gaps")

    # Start cron scheduler (after initial data is loaded)
    from app.scheduler import start_scheduler, shutdown_scheduler

    start_scheduler()

    yield

    # Shutdown
    shutdown_scheduler()
    logger.info("Shutting down %s", settings.APP_NAME)


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

# CORS: allow React dashboard origin(s)
# FRONTEND_URL supports comma-separated origins for production
_cors_origins = [
    origin.strip()
    for origin in settings.FRONTEND_URL.split(",")
    if origin.strip()
]
# Always allow localhost in development
_cors_origins.extend([
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://localhost:3000",
])
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(set(_cors_origins)),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

# Mount module routers
from app.modules.prices.router import router as prices_router
from app.modules.risk.router import router as risk_router
from app.modules.news.router import router as news_router
from app.modules.sentiment.router import router as sentiment_router
from app.modules.assistant.router import router as assistant_router

app.include_router(prices_router, prefix="/api/v1/prices", tags=["prices"])
app.include_router(risk_router, prefix="/api/v1/risk", tags=["risk"])
app.include_router(news_router, prefix="/api/v1/news", tags=["news"])
app.include_router(sentiment_router, prefix="/api/v1/sentiment", tags=["sentiment"])
app.include_router(assistant_router, prefix="/api/v1/assistant", tags=["assistant"])


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "ok",
        "version": settings.APP_VERSION,
        "data_provider": settings.DATA_PROVIDER,
    }
