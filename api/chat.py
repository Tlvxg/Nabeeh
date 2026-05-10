"""Vercel serverless function — AI chat via DeepSeek (deepseek-v4-pro on OpenRouter).

Context gathered per request:
  - Current price + REAL change % (today vs yesterday)
  - 52-week high/low + position within range
  - Technical signals: RSI-14, 20-day SMA trend, price vs SMA
  - Risk metrics (VaR, volatility, drawdown, S/R break)
  - Monte Carlo simulation results
  - Sentiment summary + recent news headlines
"""

import json
import os
import urllib.request
import ssl
import re
from http.server import BaseHTTPRequestHandler

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "").strip()
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "deepseek/deepseek-v4-pro"

_CJK_RE = re.compile(r'[\u2E80-\u9FFF\u3000-\u303F\uF900-\uFAFF]+')

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip()
SUPABASE_KEY = os.environ.get("SUPABASE_ANON_KEY", "") or os.environ.get("SUPABASE_KEY", "")
SUPABASE_KEY = SUPABASE_KEY.strip()

STOCK_KEYWORDS: list[tuple[str, str]] = [
    ("أرامكو السعودية", "2222"), ("ارامكو السعودية", "2222"),
    ("أرامكو", "2222"), ("ارامكو", "2222"), ("aramco", "2222"),
    ("مصرف الراجحي", "1120"), ("الراجحي", "1120"), ("راجحي", "1120"),
    ("rajhi", "1120"),
    ("سابك", "2010"), ("الصناعات الأساسية", "2010"), ("sabic", "2010"),
    ("الاتصالات السعودية", "7010"), ("اس تي سي", "7010"),
    ("stc", "7010"),
]


def detect_symbol_from_message(text: str, history: list | None = None) -> str | None:
    candidates: list[str] = []
    if text:
        candidates.append(text.lower())
    if history:
        for msg in reversed(history):
            content = (msg.get("content") or "").lower() if isinstance(msg, dict) else ""
            if content:
                candidates.append(content)
    for chunk in candidates:
        for keyword, symbol in STOCK_KEYWORDS:
            if keyword.lower() in chunk:
                return symbol
    return None


_ssl_ctx = ssl.create_default_context()


def _supabase_get(path: str) -> list | None:
    if not SUPABASE_URL or not SUPABASE_KEY:
        return None
    try:
        url = f"{SUPABASE_URL}/rest/v1/{path}"
        req = urllib.request.Request(url, headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        })
        with urllib.request.urlopen(req, timeout=5, context=_ssl_ctx) as resp:
            return json.loads(resp.read())
    except Exception:
        return None


# ─── Technical indicator helpers ─────────────────────────────────────────────

def compute_rsi(closes: list[float], period: int = 14) -> float | None:
    """Wilder-smoothed RSI. Returns value 0–100 or None if insufficient data."""
    if len(closes) < period + 1:
        return None
    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    gains  = [max(0.0, d) for d in deltas]
    losses = [max(0.0, -d) for d in deltas]
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return round(100 - (100 / (1 + rs)), 1)


def compute_sma(values: list[float], period: int) -> float | None:
    if len(values) < period:
        return None
    return round(sum(values[-period:]) / period, 2)


def rsi_label(rsi: float) -> str:
    if rsi >= 75:  return "تشبع شراء قوي — قد يكون السعر مرتفعاً جداً"
    if rsi >= 65:  return "تشبع شراء معتدل — يقترب من مناطق التشبع"
    if rsi <= 25:  return "تشبع بيع قوي — قد يكون السعر منخفضاً جداً"
    if rsi <= 35:  return "تشبع بيع معتدل — يقترب من مناطق التشبع البيعي"
    return "منطقة محايدة — لا يوجد تشبع واضح"


def week52_position(price: float, low: float, high: float) -> str:
    if high == low:
        return "غير متاح"
    pct = round((price - low) / (high - low) * 100, 0)
    if pct >= 90:  return f"قرب الذروة السنوية ({pct:.0f}% من النطاق)"
    if pct >= 70:  return f"في النصف العلوي ({pct:.0f}% من النطاق)"
    if pct >= 30:  return f"في المنتصف ({pct:.0f}% من النطاق)"
    if pct >= 10:  return f"في النصف السفلي ({pct:.0f}% من النطاق)"
    return f"قرب القاع السنوي ({pct:.0f}% من النطاق)"


# ─── Context gathering ────────────────────────────────────────────────────────

def gather_context(symbol: str) -> dict:
    """Fetch all available data for the given stock symbol from Supabase."""
    context: dict = {}
    context_used: list[str] = []

    # Stock metadata
    stocks = _supabase_get(f"stocks?symbol=eq.{symbol}&limit=1")
    if not stocks:
        context["context_used"] = context_used
        return context
    stock    = stocks[0]
    stock_id = stock["id"]

    # ── Price: fetch last 2 days to compute real change % ──────────────────
    prices = _supabase_get(
        f"daily_prices?stock_id=eq.{stock_id}&order=trade_date.desc&limit=2"
    )
    if prices:
        today    = prices[0]
        prev     = prices[1] if len(prices) > 1 else None
        close    = float(today.get("close_price", 0))
        prev_close = float(prev.get("close_price", close)) if prev else close
        change   = round(close - prev_close, 2)
        chg_pct  = round((change / prev_close) * 100, 2) if prev_close else 0
        context["price"] = {
            "symbol":         symbol,
            "name_ar":        stock.get("name_ar", symbol),
            "name_en":        stock.get("name_en", symbol),
            "price":          close,
            "prev_close":     prev_close,
            "change":         change,
            "change_percent": chg_pct,
            "currency":       "SAR",
            "trade_date":     today.get("trade_date", ""),
        }
        context_used.append("current_price")

    # ── Technical indicators: RSI + SMA from last 50 OHLCV bars ───────────
    ohlcv = _supabase_get(
        f"daily_prices?stock_id=eq.{stock_id}&order=trade_date.desc&limit=50"
    )
    if ohlcv and len(ohlcv) >= 15:
        # Rows are DESC from query; reverse to get chronological order
        closes = [float(r.get("close_price", 0)) for r in reversed(ohlcv)]

        rsi_val  = compute_rsi(closes)
        sma_20   = compute_sma(closes, 20)
        sma_5    = compute_sma(closes, 5)
        current  = closes[-1] if closes else None

        indicators: dict = {}
        if rsi_val is not None:
            indicators["rsi"] = {
                "value":  rsi_val,
                "label":  rsi_label(rsi_val),
            }
        if sma_20 is not None and current is not None:
            pct_vs_sma = round((current - sma_20) / sma_20 * 100, 1)
            indicators["sma20"] = {
                "value":      sma_20,
                "pct_vs":     pct_vs_sma,
                "direction":  "فوق" if pct_vs_sma >= 0 else "تحت",
                "label":      (
                    f"السعر {'فوق' if pct_vs_sma >= 0 else 'تحت'} المتوسط 20 يوم "
                    f"بنسبة {abs(pct_vs_sma)}% — "
                    + ("إشارة صعودية قصيرة المدى" if pct_vs_sma >= 1
                       else "إشارة هبوطية قصيرة المدى" if pct_vs_sma <= -1
                       else "قريب من المتوسط، اتجاه محايد")
                ),
            }
        if sma_5 is not None and sma_20 is not None:
            indicators["momentum"] = {
                "label": (
                    "زخم صعودي: المتوسط القصير (5 أيام) فوق المتوسط الطويل (20 يوم)"
                    if sma_5 > sma_20
                    else "زخم هبوطي: المتوسط القصير (5 أيام) تحت المتوسط الطويل (20 يوم)"
                )
            }
        if indicators:
            context["indicators"] = indicators
            context_used.append("technical_indicators")

    # ── Stock stats: 52-week range + annual return ─────────────────────────
    stats = _supabase_get(f"stock_stats?stock_id=eq.{stock_id}&limit=1")
    if stats:
        s = stats[0]
        hi52  = s.get("week_52_high")
        lo52  = s.get("week_52_low")
        price = context.get("price", {}).get("price")
        pos52 = week52_position(float(price), float(lo52), float(hi52)) if (price and hi52 and lo52) else None
        context["stats"] = {
            "week_52_high":    hi52,
            "week_52_low":     lo52,
            "annual_return":   s.get("annual_return"),
            "annual_vol":      s.get("annual_volatility"),
            "position_in_52w": pos52,
        }
        context_used.append("stock_stats")

    # ── Risk metrics ────────────────────────────────────────────────────────
    risk = _supabase_get(
        f"risk_metrics?stock_id=eq.{stock_id}&order=computed_at.desc&limit=1"
    )
    if risk:
        r = risk[0]
        context["risk"] = {
            "var_95_historical": r.get("var_95_hist"),
            "volatility_annual": r.get("vol_252d"),
            "max_drawdown":      r.get("max_drawdown"),
            "risk_score":        r.get("overall_score"),
            "risk_level":        r.get("risk_level"),
            "sr_break_detected": r.get("sr_break_detected", False),
            "sr_break_level":    r.get("sr_break_level"),
        }
        context_used.append("risk_metrics")

    # ── Monte Carlo ─────────────────────────────────────────────────────────
    mc = _supabase_get(f"monte_carlo_results?stock_id=eq.{stock_id}&limit=1")
    if mc:
        m = mc[0]
        percentiles = m.get("percentiles") or {}
        p5_series  = percentiles.get("p5",  [])
        p50_series = percentiles.get("p50", [])
        p95_series = percentiles.get("p95", [])
        context["monte_carlo"] = {
            "days":      m.get("days", 252),
            "mc_var_95": m.get("mc_var_95"),
            "p5_final":  p5_series[-1]  if p5_series  else None,
            "p50_final": p50_series[-1] if p50_series else None,
            "p95_final": p95_series[-1] if p95_series else None,
        }
        context_used.append("monte_carlo")

    # ── Sentiment ───────────────────────────────────────────────────────────
    scores = _supabase_get(
        f"sentiment_scores?stock_id=eq.{stock_id}&order=analyzed_at.desc&limit=20"
    )
    if scores:
        total = len(scores)
        pos   = sum(1 for s in scores if s.get("sentiment") == "positive")
        neg   = sum(1 for s in scores if s.get("sentiment") == "negative")
        neu   = total - pos - neg
        context["sentiment"] = {
            "total_articles": total,
            "positive_pct":   round(pos / total * 100),
            "negative_pct":   round(neg / total * 100),
            "neutral_pct":    round(neu / total * 100),
            "avg_confidence": round(sum(s.get("confidence", 0) for s in scores) / total, 2),
        }
        context_used.append("sentiment_summary")

    # ── News headlines ──────────────────────────────────────────────────────
    articles = _supabase_get(
        f"news_articles?stock_id=eq.{stock_id}&order=published_at.desc&limit=10"
    )
    if articles:
        context["news"] = [
            {
                "headline": a.get("headline_ar", ""),
                "source":   a.get("source", ""),
                "date":     (a.get("published_at") or "")[:10],
            }
            for a in articles
        ]
        context_used.append("news_articles")

    context["context_used"] = context_used
    return context


# ─── System prompt ────────────────────────────────────────────────────────────

def build_system_prompt(context: dict, is_first_message: bool = False) -> str:
    data_lines: list[str] = []

    # Price + change
    if "price" in context:
        p        = context["price"]
        chg      = p.get("change", 0)
        chg_pct  = p.get("change_percent", 0)
        arrow    = "↑" if chg >= 0 else "↓"
        chg_str  = f"{arrow} {'+' if chg >= 0 else ''}{chg} ر.س ({'+' if chg_pct >= 0 else ''}{chg_pct}%)"
        data_lines.append(f"**السعر الحالي**: {p['price']} {p['currency']}  {chg_str} عن أمس")
        data_lines.append(f"الاسم: {p['name_ar']} ({p['name_en']})")

    # 52-week position
    if "stats" in context:
        s = context["stats"]
        if s.get("week_52_high") and s.get("week_52_low"):
            data_lines.append(
                f"النطاق 52 أسبوع: {s['week_52_low']:.1f} — {s['week_52_high']:.1f} ر.س"
                + (f"  |  {s['position_in_52w']}" if s.get("position_in_52w") else "")
            )
        if s.get("annual_return") is not None:
            ret_pct = float(s["annual_return"]) * 100
            data_lines.append(
                f"العائد السنوي التاريخي: {ret_pct:+.1f}%"
            )

    # Risk
    if "risk" in context:
        r = context["risk"]
        if r.get("risk_score") is not None:
            data_lines.append(
                f"\n**درجة المخاطرة**: {r['risk_score']:.0f}/100 ({r.get('risk_level') or 'غير معروف'})"
            )
        if r.get("var_95_historical") is not None:
            data_lines.append(
                f"القيمة المعرضة للخطر (VaR 95%): {abs(r['var_95_historical']) * 100:.2f}%"
            )
        if r.get("volatility_annual"):
            data_lines.append(f"التقلب السنوي: {r['volatility_annual'] * 100:.2f}%")
        if r.get("max_drawdown"):
            data_lines.append(f"أقصى انخفاض تاريخي: {abs(r['max_drawdown']) * 100:.2f}%")
        if r.get("sr_break_detected"):
            data_lines.append(
                f"⚠ **تم اختراق مستوى دعم/مقاومة عند**: {r.get('sr_break_level') or 'غير معروف'} ر.س"
            )

    # Technical indicators
    if "indicators" in context:
        ind = context["indicators"]
        data_lines.append("\n**المؤشرات الفنية**:")
        if "rsi" in ind:
            data_lines.append(
                f"- مؤشر القوة النسبية (RSI 14) = **{ind['rsi']['value']}** — {ind['rsi']['label']}"
            )
        if "sma20" in ind:
            data_lines.append(f"- {ind['sma20']['label']}")
        if "momentum" in ind:
            data_lines.append(f"- {ind['momentum']['label']}")

    # Monte Carlo
    if "monte_carlo" in context:
        mc = context["monte_carlo"]
        data_lines.append(f"\n**محاكاة مونت كارلو ({mc['days']} يوم)**:")
        if mc.get("mc_var_95") is not None:
            data_lines.append(
                f"- أقصى خسارة متوقعة (95%): {abs(mc['mc_var_95']) * 100:.2f}%"
            )
        if mc.get("p50_final"):
            data_lines.append(f"- السعر المتوقع (المتوسط): {mc['p50_final']:.2f} ر.س")
        if mc.get("p5_final") and mc.get("p95_final"):
            data_lines.append(
                f"- النطاق المتوقع: {mc['p5_final']:.2f} — {mc['p95_final']:.2f} ر.س"
            )

    # Sentiment
    if "sentiment" in context:
        s = context["sentiment"]
        data_lines.append(
            f"\nتحليل المشاعر ({s['total_articles']} مقال): "
            f"إيجابي {s['positive_pct']}% | سلبي {s['negative_pct']}% | محايد {s['neutral_pct']}%"
        )

    # News
    if "news" in context:
        data_lines.append("\nآخر الأخبار:")
        for article in context["news"]:
            data_lines.append(
                f"- [{article.get('date', '')}] {article.get('headline', '')}"
            )

    data_section = "\n".join(data_lines) if data_lines else "لا تتوفر بيانات حالياً"

    # First-message handling
    if is_first_message:
        welcome_instruction = """

## رسالة أولى:
إذا كانت الرسالة تحية فقط (مرحبا، اهلا، hi، hello): ردّ بجملة ترحيب واحدة فقط. لا تعطِ تقريراً.
إذا كانت سؤالاً فعلياً: ابدأ بجملة ترحيب قصيرة ثم استخدم الهيكل الكامل.
"""
    else:
        welcome_instruction = ""

    no_stock_note = ""
    if context.get("no_stock_specified"):
        no_stock_note = """

## ملاحظة:
المستخدم لم يحدد سهماً. الأسهم المتوفرة: أرامكو (2222)، الراجحي (1120)، سابك (2010)، STC (7010).
اسأله أي سهم يريد — لا تفترض أرامكو.
"""

    return f"""أنت **نبيه**، محلل مخاطر متخصص في سوق الأسهم السعودي (تداول). أنت جزء من منصة Nabeeh.

## شخصيتك:
- تحليلي، دقيق، موضوعي — تتحدث بلغة المحلل الحقيقي
- تتحدث بالعربية الفصيحة
- تركز على البيانات والأرقام الفعلية — لا تقديرات مبهمة
- واثق لكن تقول "لا أعلم" إذا البيانات غير كافية
- موجز ومنظم

## هيكل الرد (إلزامي):

```
## الخلاصة
[جملة واحدة تلخص الإجابة]

## البيانات الحالية
- **المقياس**: القيمة (التفسير)

## لماذا تحرك السعر؟ (اذكرها فقط إذا سأل عن السبب أو كان هناك حدث واضح)
- [ربط الأخبار + المؤشرات + اختراق الدعم/المقاومة]

## ما الذي يجب متابعته
- راقب / تابع / انتبه إلى...
```

## كيف تفسّر تحرك الأسعار:
عندما يسأل المستخدم لماذا ارتفع أو انخفض السعر، استخدم هذه البيانات معاً:
- إذا كان تغيير السعر موجباً + أخبار إيجابية + RSI مرتفع → اشرح أن الارتفاع مدعوم بزخم إيجابي واهتمام السوق
- إذا كان تغيير السعر سلبياً + اختراق مستوى دعم + مشاعر سلبية → اشرح أن الضغط البيعي مرتبط بضعف الأخبار واختراق المستوى
- إذا لم تكن هناك أسباب واضحة في البيانات → قل ذلك صراحة: "لا تتوفر بيانات كافية لتفسير التحرك"
- ربط الأخبار بالحركة: إذا كان هناك خبر حديث (آخر يومين) يتوافق مع اتجاه السعر، اذكره صراحة

## استخدام المؤشرات الفنية في الردود:
- RSI > 70: "السهم في منطقة تشبع شراء — الارتفاع قد يكون مؤقتاً"
- RSI < 30: "السهم في منطقة تشبع بيع — قد يرتد"
- RSI 40-60: "المؤشر في المنطقة المحايدة — لا إشارة واضحة"
- سعر فوق المتوسط 20 يوم: "الزخم القصير إيجابي"
- سعر تحت المتوسط 20 يوم: "الزخم القصير سلبي"
{welcome_instruction}{no_stock_note}
## قواعد صارمة:

**١. ممنوع تقديم نصائح استثمارية**
ممنوع: "اشترِ"، "بع"، "احتفظ"، "فرصة جيدة"، "خطير لا تقربه"
مسموح: "راقب"، "تابع"، "انتبه إلى"، "البيانات تشير إلى"

**٢. الأرقام الفعلية دائماً**
لا "المخاطرة متوسطة" — قل "درجة المخاطرة: X/100"
لا "الأخبار سلبية" — قل "35% من الأخبار سلبية من أصل 20 مقال"

**٣. البيانات المتوفرة فقط**
لا تخترع أرقاماً. لا تذكر مقاييس غير موجودة في البيانات (P/E، أرباح، إلخ)

**٤. العربية فقط** — ممنوع الكلمات الصينية أو اليابانية أو الكورية

**٥. الإيجاز** — الحد الأقصى 150 كلمة. إذا كان السؤال بسيطاً، الرد في 3 أسطر

**٦. قسم "ما يجب متابعته" إلزامي** في كل رد — 2-3 نقاط ملموسة

## البيانات الحالية للسهم:
{data_section}

## إخلاء مسؤولية (يُضاف تلقائياً في نهاية كل رد):
> ⚠ هذا التحليل لأغراض تعليمية وبحثية فقط ولا يُعتبر نصيحة استثمارية."""


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if not OPENROUTER_API_KEY:
            self._respond({
                "reply": "عذراً، المساعد الذكي غير مُفعّل حالياً.",
                "context_used": [],
            })
            return

        try:
            length  = int(self.headers.get("Content-Length", 0))
            body    = json.loads(self.rfile.read(length)) if length else {}

            message = body.get("message", "")
            symbol  = body.get("symbol", "2222")
            history = body.get("conversation_history", [])

            if not message:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "message is required"}).encode())
                return

            detected = detect_symbol_from_message(message, history)
            if detected:
                symbol = detected

            no_stock_context = not detected and symbol == "2222" and len(history) == 0

            context = gather_context(symbol)
            if no_stock_context:
                context["no_stock_specified"] = True

            is_first_message = len(history) == 0
            system_prompt    = build_system_prompt(context, is_first_message=is_first_message)
            context_used     = context.get("context_used", [])

            messages = [{"role": "system", "content": system_prompt}]
            for msg in history:
                role    = msg.get("role", "user")
                content = msg.get("content", "")
                if role in ("user", "assistant") and content:
                    messages.append({"role": role, "content": content})
            messages.append({"role": "user", "content": message})

            payload = json.dumps({
                "model":       MODEL,
                "max_tokens":  800,
                "temperature": 0.4,
                "messages":    messages,
                # DeepSeek is a reasoning model — disable chain-of-thought so the
                # token budget is spent on the actual reply.
                "reasoning":   {"enabled": False},
            }).encode()

            req = urllib.request.Request(OPENROUTER_URL, data=payload, headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type":  "application/json",
            })
            with urllib.request.urlopen(req, timeout=45, context=_ssl_ctx) as resp:
                result = json.loads(resp.read())
            reply = result["choices"][0]["message"]["content"] or ""
            reply = _CJK_RE.sub('', reply).strip()

            self._respond({
                "reply":        reply or "عذراً، لم أتمكن من إنشاء رد.",
                "context_used": context_used,
            })

        except Exception:
            self._respond({
                "reply":        "عذراً، حدث خطأ أثناء معالجة طلبك. يرجى المحاولة مرة أخرى لاحقاً.",
                "context_used": [],
            })

    def _respond(self, data: dict, status: int = 200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))
