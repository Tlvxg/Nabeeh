"""Business logic for the AI assistant module."""

import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# Model to use for chat completions (DeepSeek via OpenRouter)
MODEL = "deepseek/deepseek-v4-pro"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


async def gather_context(symbol: str) -> dict:
    """
    Gather real-time stock context from other modules.

    Calls prices, risk, and news/sentiment services to collect
    current data for the given symbol. Each source is best-effort:
    if one fails, the others are still included.

    Args:
        symbol: Tadawul stock symbol (e.g. "2222").

    Returns:
        Dict with keys: price, risk, sentiment, and context_used list.
    """
    context: dict = {}
    context_used: list[str] = []

    # 1. Current price
    try:
        from app.modules.prices import service as prices_service

        price_data = await prices_service.get_current_price(symbol)
        context["price"] = {
            "symbol": price_data.symbol,
            "name_ar": price_data.name_ar,
            "name_en": price_data.name_en,
            "price": float(price_data.price),
            "change": float(price_data.change),
            "change_percent": float(price_data.change_percent),
            "currency": price_data.currency,
        }
        context_used.append("current_price")
    except Exception as e:
        logger.warning("Failed to get price context for %s: %s", symbol, e)

    # 2. Risk summary
    try:
        from app.modules.risk import service as risk_service

        risk_data = await risk_service.get_risk_metrics(symbol)
        context["risk"] = {
            "var_95_historical": risk_data.var.confidence_levels.get("95", {}).get("historical") if risk_data.var and isinstance(risk_data.var.confidence_levels, dict) else None,
            "volatility_30d": risk_data.volatility.vol_30d,
            "volatility_annual": risk_data.volatility.vol_252d,
            "ewma_volatility": risk_data.volatility.ewma_vol,
            "sharpe_ratio": risk_data.ratios.sharpe_ratio,
            "sortino_ratio": risk_data.ratios.sortino_ratio,
            "max_drawdown": risk_data.drawdown.max_drawdown,
        }
        # GARCH if available
        if risk_data.garch and risk_data.garch.converged:
            context["risk"]["garch_converged"] = True
            if risk_data.garch.params:
                context["risk"]["garch_params"] = {
                    "omega": risk_data.garch.params.get("omega") if isinstance(risk_data.garch.params, dict) else risk_data.garch.params.omega,
                    "alpha": risk_data.garch.params.get("alpha") if isinstance(risk_data.garch.params, dict) else risk_data.garch.params.alpha,
                    "beta": risk_data.garch.params.get("beta") if isinstance(risk_data.garch.params, dict) else risk_data.garch.params.beta,
                }
        # Beta if available
        if risk_data.beta:
            context["risk"]["beta"] = risk_data.beta.beta
            context["risk"]["benchmark"] = risk_data.beta.benchmark

        context_used.append("risk_metrics")
    except Exception as e:
        logger.warning("Failed to get risk context for %s: %s", symbol, e)

    # 3. Sentiment summary + recent news articles
    try:
        from app.modules.prices import repository as prices_repo
        from app.modules.news import repository as news_repo

        stock = await prices_repo.get_stock_by_symbol(symbol)
        if stock:
            summary = await news_repo.get_sentiment_summary(stock_id=stock["id"])
            if summary.get("total_articles", 0) > 0:
                context["sentiment"] = {
                    "total_articles": summary["total_articles"],
                    "positive_pct": summary["positive_pct"],
                    "negative_pct": summary["negative_pct"],
                    "neutral_pct": summary["neutral_pct"],
                    "avg_confidence": summary["avg_confidence"],
                }
                context_used.append("sentiment_summary")

            # Fetch latest news articles with sentiment
            articles = await news_repo.get_articles_with_sentiment(
                stock_id=stock["id"], limit=10
            )
            if articles:
                context["news"] = [
                    {
                        "headline": a["headline_ar"],
                        "source": a["source"],
                        "date": a["published_at"][:10] if a.get("published_at") else "",
                        "sentiment": a.get("sentiment", "غير محلل"),
                    }
                    for a in articles
                ]
                context_used.append("news_articles")
    except Exception as e:
        logger.warning("Failed to get sentiment/news context for %s: %s", symbol, e)

    context["context_used"] = context_used
    return context


def build_system_prompt(context: dict) -> str:
    """
    Build the Arabic system prompt with real-time stock context.

    The prompt identifies the assistant as Nabeeh (نبيه), instructs it to
    answer in Arabic, and embeds current stock data for grounded responses.

    Args:
        context: Dict from gather_context() with price, risk, sentiment data.

    Returns:
        System prompt string.
    """
    # Build data section from available context
    data_lines: list[str] = []

    if "price" in context:
        p = context["price"]
        data_lines.append(
            f"السعر الحالي: {p['price']} {p['currency']} "
            f"(التغير: {p['change']:+.2f}, {p['change_percent']:+.2f}%)"
        )
        data_lines.append(f"الاسم: {p['name_ar']} ({p['name_en']})")

    if "risk" in context:
        r = context["risk"]
        if r.get("var_95_historical") is not None:
            data_lines.append(
                f"القيمة المعرضة للخطر (VaR 95%): {abs(r['var_95_historical']) * 100:.2f}%"
            )
        data_lines.append(f"التقلب السنوي: {r.get('volatility_annual', 0) * 100:.2f}%")
        data_lines.append(f"التقلب 30 يوم: {r.get('volatility_30d', 0) * 100:.2f}%")
        data_lines.append(f"نسبة شارب: {r.get('sharpe_ratio', 0):.4f}")
        data_lines.append(f"نسبة سورتينو: {r.get('sortino_ratio', 0):.4f}")
        data_lines.append(f"أقصى انخفاض: {r.get('max_drawdown', 0) * 100:.2f}%")
        if r.get("beta") is not None:
            data_lines.append(f"بيتا (مقارنة بمؤشر تاسي): {r['beta']:.4f}")
        if r.get("garch_converged"):
            data_lines.append("نموذج GARCH(1,1): متقارب")

    if "sentiment" in context:
        s = context["sentiment"]
        data_lines.append(
            f"تحليل المشاعر ({s['total_articles']} مقال): "
            f"إيجابي {s['positive_pct']}% | سلبي {s['negative_pct']}% | محايد {s['neutral_pct']}%"
        )

    # Add news headlines
    if "news" in context:
        data_lines.append("")
        data_lines.append("آخر الأخبار:")
        for article in context["news"]:
            sentiment_label = article.get("sentiment", "")
            date = article.get("date", "")
            source = article.get("source", "")
            headline = article.get("headline", "")
            data_lines.append(
                f"- [{date}] [{source}] {headline} ({sentiment_label})"
            )

    data_section = "\n".join(data_lines) if data_lines else "لا تتوفر بيانات حالياً"

    return f"""أنت نبيه (Nabeeh)، مساعد ذكي متخصص في تحليل مخاطر الأسهم السعودية.

## دورك:
- تحليل مخاطر الأسهم في السوق السعودي (تداول)
- شرح المقاييس المالية بلغة واضحة ومبسطة
- مساعدة المستثمرين في فهم المخاطر والتقلبات
- عرض آخر الأخبار المتوفرة من قاعدة بياناتك عند السؤال عنها

## البيانات الحالية:
{data_section}

## قواعد مهمة:
1. أجب دائماً باللغة العربية
2. لا تقدم توصيات بالشراء أو البيع أبداً
3. لا تتوقع أسعاراً مستقبلية محددة
4. وضح أن التحليل لأغراض تعليمية فقط
5. استخدم البيانات المتاحة أعلاه لدعم إجاباتك — لديك بيانات حقيقية من قاعدة بيانات تشمل الأسعار والمخاطر والأخبار
6. عند السؤال عن الأخبار، اعرض العناوين والتواريخ والمصادر من البيانات المتوفرة أعلاه
7. إذا سُئلت عن شيء خارج نطاق البيانات المتاحة، أوضح ذلك بصراحة
8. كن موجزاً ومنظماً — استخدم العناوين والنقاط لتسهيل القراءة

## تنسيق الإجابات:
- استخدم عناوين فرعية (### مثلاً) لتنظيم الأقسام المختلفة
- استخدم **النص العريض** لتمييز المصطلحات المالية والأرقام المهمة
- استخدم القوائم النقطية (-) لعرض النقاط المتعددة
- استخدم القوائم المرقمة (1. 2. 3.) للخطوات المتسلسلة
- اجعل إجاباتك مختصرة ومنظمة في 3-5 أقسام كحد أقصى
- ابدأ بملخص موجز ثم فصّل بالنقاط
- لا تستخدم جداول أو أكواد برمجية أو روابط

## إخلاء مسؤولية:
هذا التحليل لأغراض تعليمية وبحثية فقط ولا يُعتبر نصيحة استثمارية."""


async def chat(
    message: str,
    symbol: str = "2222",
    history: list[dict] | None = None,
) -> dict:
    """
    Process a chat message and return an AI response.

    Gathers real-time stock context, builds a system prompt, and calls
    the DeepSeek model via OpenRouter. Falls back to a static message
    if the API key is not configured.

    Args:
        message: User's message text.
        symbol: Tadawul stock symbol for context (default "2222").
        history: Previous conversation messages for multi-turn context.

    Returns:
        Dict with 'reply' (str) and 'context_used' (list[str]).
    """
    # Check if API key is configured
    if not settings.OPENROUTER_API_KEY:
        return {
            "reply": (
                "عذراً، المساعد الذكي غير مُفعّل حالياً. "
                "يرجى تكوين مفتاح API الخاص بـ OpenRouter لتفعيل هذه الميزة."
            ),
            "context_used": [],
        }

    # Gather real-time context
    context = await gather_context(symbol)
    system_prompt = build_system_prompt(context)
    context_used = context.get("context_used", [])

    # Build messages array (OpenAI-compatible format with system in messages)
    messages: list[dict] = [{"role": "system", "content": system_prompt}]

    # Add conversation history
    if history:
        for msg in history:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})

    # Add current user message
    messages.append({"role": "user", "content": message})

    # Call OpenRouter (DeepSeek). Reasoning is disabled so the token budget
    # is spent on the reply, not on chain-of-thought.
    try:
        payload = {
            "model": MODEL,
            "max_tokens": 1500,
            "temperature": 0.7,
            "messages": messages,
            "reasoning": {"enabled": False},
        }
        headers = {
            "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(OPENROUTER_URL, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()

        reply = data["choices"][0]["message"]["content"] or ""

        return {
            "reply": reply or "عذراً، لم أتمكن من إنشاء رد. يرجى المحاولة مرة أخرى.",
            "context_used": context_used,
        }

    except Exception as e:
        logger.error("OpenRouter API error: %s", e)
        return {
            "reply": "عذراً، حدث خطأ أثناء معالجة طلبك. يرجى المحاولة مرة أخرى لاحقاً.",
            "context_used": context_used,
        }
