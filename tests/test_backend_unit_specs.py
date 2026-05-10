"""Backend unit tests matching UN04-UN07 from the project report."""

from decimal import Decimal
import sys
from types import SimpleNamespace

import pandas as pd
import pytest


@pytest.mark.asyncio
async def test_un04_news_sentiment_classifies_positive_arabic_news(monkeypatch):
    """UN04: Arabic news sentiment returns positive with confidence > 0.5."""
    from app.modules.sentiment import service

    class FakeSentimentManager:
        is_loaded = True

        def predict(self, texts):
            assert texts == ["حققت أرامكو أرباحا قياسية"]
            return [{"sentiment": "positive", "confidence": 0.91}]

    monkeypatch.setattr(
        service.SentimentModelManager,
        "get_instance",
        lambda: FakeSentimentManager(),
    )

    result = await service.analyze_text("حققت أرامكو أرباحا قياسية")

    assert result.sentiment == "positive"
    assert result.confidence > 0.5


@pytest.mark.asyncio
async def test_un05_prices_module_computes_daily_change_percent(monkeypatch):
    """UN05: Closing prices [100, 102, 101, 105] produce +3.96% latest change."""
    from app.modules.prices import service

    history = pd.DataFrame(
        {
            "Close": [100.0, 102.0, 101.0, 105.0],
            "High": [101.0, 103.0, 102.0, 106.0],
            "Low": [99.0, 101.0, 100.0, 104.0],
            "Volume": [1000, 1100, 1200, 1300],
        },
        index=pd.date_range("2026-01-01", periods=4, freq="D"),
    )

    class FakeTicker:
        def __init__(self, symbol):
            assert symbol == "^TASI.SR"

        def history(self, period):
            assert period == "5d"
            return history

    monkeypatch.setattr(service.yf, "Ticker", FakeTicker)

    result = await service.get_tasi_index()

    assert result.change == Decimal("4.00")
    assert result.change_percent == Decimal("3.96")


@pytest.mark.asyncio
async def test_un06_assistant_returns_response_about_saudi_stock(monkeypatch):
    """UN06: Chatbot returns a non-empty response referencing Al Rajhi."""
    from app.modules.assistant import service

    async def fake_gather_context(symbol):
        assert symbol == "1120"
        return {
            "price": {
                "symbol": "1120",
                "name_ar": "الراجحي",
                "name_en": "Al Rajhi Bank",
                "price": 90.0,
                "change": 1.0,
                "change_percent": 1.12,
                "currency": "SAR",
            },
            "context_used": ["current_price"],
        }

    class FakeCompletions:
        async def create(self, **kwargs):
            return SimpleNamespace(
                choices=[
                    SimpleNamespace(
                        message=SimpleNamespace(
                            content="سهم الراجحي يظهر حركة إيجابية اليوم، والتحليل هنا تعليمي فقط."
                        )
                    )
                ]
            )

    class FakeAsyncGroq:
        def __init__(self, api_key):
            assert api_key == "test-key"
            self.chat = SimpleNamespace(completions=FakeCompletions())

    monkeypatch.setattr(service.settings, "GROQ_API_KEY", "test-key")
    monkeypatch.setattr(service, "gather_context", fake_gather_context)
    monkeypatch.setitem(sys.modules, "groq", SimpleNamespace(AsyncGroq=FakeAsyncGroq))

    result = await service.chat("ما تقييم سهم الراجحي؟", symbol="1120")

    assert result["reply"].strip()
    assert "الراجحي" in result["reply"]


@pytest.mark.asyncio
async def test_un07_assistant_explanation_is_short_clear_and_without_jargon(monkeypatch):
    """UN07: Assistant explanation is beginner-friendly and avoids complex jargon."""
    from app.modules.assistant import service

    beginner_reply = (
        "مخاطر السهم تعني احتمال أن يتغير السعر بطريقة لا تناسبك. "
        "راقب تغير السعر والأخبار، ولا تعتمد على عامل واحد فقط."
    )

    class FakeCompletions:
        async def create(self, **kwargs):
            return SimpleNamespace(
                choices=[
                    SimpleNamespace(
                        message=SimpleNamespace(content=beginner_reply)
                    )
                ]
            )

    class FakeAsyncGroq:
        def __init__(self, api_key):
            self.chat = SimpleNamespace(completions=FakeCompletions())

    async def fake_gather_context(symbol):
        return {"context_used": []}

    monkeypatch.setattr(service.settings, "GROQ_API_KEY", "test-key")
    monkeypatch.setattr(service, "gather_context", fake_gather_context)
    monkeypatch.setitem(sys.modules, "groq", SimpleNamespace(AsyncGroq=FakeAsyncGroq))

    result = await service.chat("اشرح مخاطر السهم للمبتدئين", symbol="1120")
    reply = result["reply"]

    assert 0 < len(reply) < 500
    assert "كوفريانس" not in reply
    assert "بيتا" not in reply
