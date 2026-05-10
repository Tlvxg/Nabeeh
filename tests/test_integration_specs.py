"""Integration tests matching IT01-IT04 from the project report.

The database persistence tests mock write calls so running this file does not
insert, update, or delete real Supabase rows.
"""

from types import SimpleNamespace
import logging
import sys

import httpx
import pytest


logger = logging.getLogger(__name__)


@pytest.mark.asyncio
async def test_it01_news_sentiment_persists_scores_without_touching_real_database(
    monkeypatch,
):
    """IT01: news pipeline stores label/confidence through sentiment_scores layer."""
    logger.info("IT01 START: News Sentiment + sentiment_scores")
    from app.modules.news.schemas import NewsFetchResult, NewsFetchSummary
    from app.modules.news import service as news_service
    from app.modules.sentiment import service as sentiment_service
    from app.tasks.news_pipeline import run_news_pipeline

    inserted_scores: list[dict] = []
    analyzed_ids: list[int] = []

    class FakeSentimentManager:
        is_loaded = True
        model_version = "test-model"

        def predict(self, texts):
            assert texts == ["حققت أرامكو أرباحا قياسية نمو قوي"]
            return [{"sentiment": "positive", "confidence": 0.93}]

    async def fake_fetch_all_news():
        return NewsFetchSummary(
            results=[NewsFetchResult(source="test", fetched=1, new=1, errors=[])],
            total_new=1,
        )

    async def fake_get_unanalyzed_articles(limit):
        assert limit == 1
        return [
            {
                "id": 101,
                "stock_id": 1,
                "headline_ar": "حققت أرامكو أرباحا قياسية",
                "snippet_ar": "نمو قوي",
            }
        ]

    async def fake_insert_score(**kwargs):
        inserted_scores.append(kwargs)

    async def fake_mark_analyzed(ids):
        analyzed_ids.extend(ids)

    monkeypatch.setattr(news_service, "fetch_all_news", fake_fetch_all_news)
    monkeypatch.setattr(
        sentiment_service.SentimentModelManager,
        "get_instance",
        lambda: FakeSentimentManager(),
    )
    monkeypatch.setattr(
        sentiment_service.news_repository,
        "get_unanalyzed_articles",
        fake_get_unanalyzed_articles,
    )
    monkeypatch.setattr(
        sentiment_service.sentiment_repository,
        "insert_score",
        fake_insert_score,
    )
    monkeypatch.setattr(
        sentiment_service.news_repository,
        "mark_analyzed",
        fake_mark_analyzed,
    )

    result = await run_news_pipeline(sentiment_limit=1)

    assert result["sentiment_summary"].analyzed == 1
    assert inserted_scores[0]["sentiment"] == "positive"
    assert inserted_scores[0]["confidence"] > 0.5
    assert analyzed_ids == [101]
    logger.info("IT01 PASSED: sentiment score label/confidence persisted via repository")


@pytest.mark.asyncio
async def test_it02_prices_fetch_yfinance_ohlcv_and_prepare_supabase_rows(
    monkeypatch,
):
    """IT02: prices task fetches OHLCV from yfinance and prepares valid rows."""
    logger.info("IT02 START: Prices + yfinance API")
    from app.modules.prices.providers.yfinance_provider import YFinanceProvider
    from app.tasks import fetch_prices

    captured_rows: list[dict] = []

    async def fake_get_stock_by_symbol(symbol):
        assert symbol == "2222"
        return {"id": 1, "symbol": "2222", "name_ar": "أرامكو", "name_en": "Aramco"}

    async def fake_upsert_daily_prices(stock_id, rows):
        assert stock_id == 1
        captured_rows.extend(rows)
        return len(rows)

    monkeypatch.setattr(fetch_prices.repository, "get_stock_by_symbol", fake_get_stock_by_symbol)
    monkeypatch.setattr(fetch_prices.repository, "upsert_daily_prices", fake_upsert_daily_prices)
    monkeypatch.setattr(
        "app.modules.prices.providers.yfinance_provider.repository.get_stock_by_symbol",
        fake_get_stock_by_symbol,
    )
    monkeypatch.setattr(fetch_prices, "get_data_provider", lambda: YFinanceProvider())

    count = await fetch_prices.fetch_and_store_prices("2222", period="1mo")

    assert count > 0
    assert captured_rows
    first = captured_rows[0]
    assert {"open_price", "high_price", "low_price", "close_price", "volume"} <= set(first)
    assert float(first["open_price"]) > 0
    assert float(first["high_price"]) >= float(first["low_price"])
    assert int(first["volume"]) >= 0
    logger.info("IT02 PASSED: yfinance OHLCV rows validated and passed to persistence layer")


@pytest.mark.asyncio
async def test_it03_assistant_openrouter_api_returns_non_empty_answer():
    """IT03: OpenRouter chat API returns an AI-generated answer."""
    logger.info("IT03 START: Assistant + OpenRouter API")
    import os

    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        pytest.skip("OPENROUTER_API_KEY is not set")

    models = [
        "inclusionai/ling-2.6-flash:free",
        "poolside/laguna-xs.2:free",
        "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
        "google/gemma-4-26b-a4b-it:free",
    ]
    last_error = ""

    async with httpx.AsyncClient(timeout=45) as client:
        for model in models:
            logger.info("IT03: trying OpenRouter model %s", model)
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "HTTP-Referer": "http://localhost:5173",
                    "X-Title": "Nabeeh Integration Test",
                },
                json={
                    "model": model,
                    "messages": [
                        {
                            "role": "user",
                            "content": "ما تقييم سهم أرامكو؟ أجب بجملة عربية قصيرة.",
                        }
                    ],
                    "max_tokens": 80,
                    "temperature": 0.2,
                },
            )

            if response.status_code == 200:
                data = response.json()
                answer = data["choices"][0]["message"]["content"]
                assert isinstance(answer, str)
                assert answer.strip()
                logger.info("IT03 PASSED: OpenRouter returned a non-empty assistant answer")
                return

            last_error = f"{response.status_code}: {response.text}"
            logger.warning("IT03: model %s failed with %s", model, response.status_code)

    pytest.fail(f"All OpenRouter model attempts failed. Last error: {last_error}")


@pytest.mark.asyncio
async def test_it04_assistant_uses_risk_module_for_beginner_arabic_explanation(
    monkeypatch,
):
    """IT04: assistant reads risk context and produces simple Arabic with no jargon."""
    logger.info("IT04 START: Assistant + Risk Module")
    from app.modules.assistant import service as assistant_service
    from app.modules.risk import service as risk_service

    async def fake_get_current_price(symbol):
        return SimpleNamespace(
            symbol=symbol,
            name_ar="الراجحي",
            name_en="Al Rajhi Bank",
            price=90,
            change=-1,
            change_percent=-1.1,
            currency="SAR",
        )

    async def fake_get_risk_metrics(symbol):
        assert symbol == "1120"
        return SimpleNamespace(
            var=SimpleNamespace(confidence_levels={"95": {"historical": -0.045}}),
            volatility=SimpleNamespace(vol_30d=0.25, vol_252d=0.40, ewma_vol=0.28),
            ratios=SimpleNamespace(sharpe_ratio=0.2, sortino_ratio=0.1),
            drawdown=SimpleNamespace(max_drawdown=-0.18),
            garch=None,
            beta=SimpleNamespace(beta=1.2, benchmark="^TASI.SR"),
        )

    async def fake_get_stock_by_symbol(symbol):
        assert symbol == "1120"
        return None

    class FakeCompletions:
        async def create(self, **kwargs):
            system_prompt = kwargs["messages"][0]["content"]
            assert "VaR 95%" in system_prompt
            assert "التقلب" in system_prompt
            return SimpleNamespace(
                choices=[
                    SimpleNamespace(
                        message=SimpleNamespace(
                            content=(
                                "مستوى الخطر مرتفع لأن السهم يتحرك بقوة وقد يسبب خسارة "
                                "يومية واضحة. الفكرة ببساطة: راقب التغيرات ولا تعتمد على خبر واحد."
                            )
                        )
                    )
                ]
            )

    class FakeAsyncGroq:
        def __init__(self, api_key):
            self.chat = SimpleNamespace(completions=FakeCompletions())

    monkeypatch.setattr(assistant_service.settings, "GROQ_API_KEY", "test-key")
    monkeypatch.setattr(
        "app.modules.prices.service.get_current_price",
        fake_get_current_price,
    )
    monkeypatch.setattr(
        "app.modules.prices.repository.get_stock_by_symbol",
        fake_get_stock_by_symbol,
    )
    monkeypatch.setattr(risk_service, "get_risk_metrics", fake_get_risk_metrics)
    monkeypatch.setitem(sys.modules, "groq", SimpleNamespace(AsyncGroq=FakeAsyncGroq))

    result = await assistant_service.chat("اشرح لي خطر سهم الراجحي ببساطة", symbol="1120")
    reply = result["reply"]

    assert "risk_metrics" in result["context_used"]
    assert "مرتفع" in reply
    assert "ببساطة" in reply
    assert "كوفريانس" not in reply
    assert "بيتا" not in reply
    logger.info("IT04 PASSED: assistant used risk context and returned simple Arabic")
