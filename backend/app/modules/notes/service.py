"""AI-powered Arabic risk-note generator.

Provider order:
  1. OpenRouter deepseek/deepseek-v4-pro  (primary — strongest Arabic reasoning)
  2. Deterministic rule-based fallback    (always succeeds)

Output is validated for: schema, length, Arabic-character ratio, presence of
at least one number per paragraph (numeric grounding), and absence of banned
recommendation tokens. Any failure trips the rule-based fallback.
"""

import json
import logging
import re

import httpx

from app.config import settings
from app.modules.notes.fallback import build_fallback_note
from app.modules.notes.schemas import RiskNote, RiskNoteInput

logger = logging.getLogger(__name__)

_OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
_OPENROUTER_MODEL = "deepseek/deepseek-v4-pro"

_BANNED_TOKENS = ("اشتري", "ابيع", "بِع", "توصية", "نصيحة استثمارية")
_ARABIC_CHAR_RE = re.compile(r"[؀-ۿ]")
_NUMERIC_RE = re.compile(r"[0-9٠-٩]")


def _system_prompt() -> str:
    return (
        "أنت محلل مخاطر مالي تكتب باللغة العربية الفصحى لمستثمري السوق السعودي. "
        "مهمتك: شرح التغير في درجة مخاطرة سهم بناءً على البيانات المُعطاة فقط. "
        "قواعد صارمة لا تقبل التساهل: "
        "(1) لا تقدّم نصيحة استثمارية ولا توصيات شراء أو بيع. "
        "(2) لا تستخدم كلمات إنجليزية إلا إذا كانت رمز السهم. "
        "(3) كل فقرة من paragraphs_ar يجب أن تحتوي على رقم واحد صريح على الأقل (مثل 45.2 أو 12% أو 0.5)؛ "
        "إن لم يوجد رقم فالفقرة مرفوضة. "
        "(4) قارن بين القراءة الحالية والسابقة بصراحة (ارتفعت / انخفضت / مستقرة) واذكر السبب الكمي. "
        "(5) أعِد JSON صالحاً فقط بدون أي نص قبله أو بعده، بهذا الشكل بالضبط: "
        '{"headline_ar": "نص قصير", '
        '"paragraphs_ar": ["فقرة1 برقم", "فقرة2 برقم", "فقرة3 برقم"], '
        '"watch_points_ar": ["نقطة1", "نقطة2"]} '
        "بحيث paragraphs_ar مصفوفة من 3 سلاسل نصية (افتتاحية، سبب التغيير، خلاصة)، "
        "و watch_points_ar مصفوفة من سلسلتين إلى أربع سلاسل. "
        "لا تستخدم سلاسل JSON متعددة الأسطر — كل سلسلة في سطر واحد منطقي. "
        "تأكد من إغلاق جميع الأقواس وعلامات الاقتباس قبل الإرسال."
    )


def _user_payload(inp: RiskNoteInput) -> str:
    return json.dumps(
        {
            "السهم": f"{inp.name_ar} ({inp.symbol}.SR)",
            "الدرجة_الحالية": round(inp.overall_score, 1),
            "الدرجة_السابقة": round(inp.prev_score, 1) if inp.prev_score is not None else None,
            "فرق_الدرجة": round(inp.score_delta, 1) if inp.score_delta is not None else None,
            "تفسير": inp.interpretation_ar,
            "VaR_95_حالي_%": round(abs(inp.var_95_hist) * 100, 2),
            "VaR_95_سابق_%": round(abs(inp.prev_var_95_hist) * 100, 2) if inp.prev_var_95_hist is not None else None,
            "التقلب_السنوي_حالي_%": round(inp.vol_252d * 100, 2),
            "التقلب_السنوي_سابق_%": round(inp.prev_vol_252d * 100, 2) if inp.prev_vol_252d is not None else None,
            "نسبة_الأخبار_السلبية_%": round(inp.sentiment_neg_pct, 0),
            "تغير_السعر_آخر_جلسة_%": round(inp.price_change_pct, 2) if inp.price_change_pct is not None else None,
            "كسر_دعم_مقاومة": inp.sr_break_detected,
            "مستوى_الكسر": inp.sr_break_level,
        },
        ensure_ascii=False,
    )


async def _ask(url: str, key: str, model: str, inp: RiskNoteInput) -> str:
    # OpenRouter routes reasoning models (e.g. deepseek-v4-pro) which spend tokens
    # on chain-of-thought before emitting `content`. We disable reasoning output to
    # keep latency low and the token budget on the actual JSON.
    is_openrouter = "openrouter.ai" in url
    payload: dict = {
        "model": model,
        "temperature": 0.2,
        "max_tokens": 1500,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": _system_prompt()},
            {"role": "user", "content": _user_payload(inp)},
        ],
    }
    if is_openrouter:
        # `enabled: false` fully disables chain-of-thought; `exclude: true` would
        # only hide it but still consume the token budget, leaving no room for content.
        payload["reasoning"] = {"enabled": False}
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"] or ""


def _validate(raw: str, inp: RiskNoteInput) -> tuple[str, list[str], list[str]] | None:
    """Return (headline, paragraphs, watch_points) on success, None on rejection."""
    try:
        # Strip code fences if model wrapped JSON in ```json ... ```.
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.MULTILINE).strip()
        obj = json.loads(cleaned)
    except Exception as e:
        logger.warning("AI note JSON parse failed: %s", e)
        return None

    headline = obj.get("headline_ar")
    paragraphs = obj.get("paragraphs_ar")
    watch = obj.get("watch_points_ar")

    if not isinstance(headline, str) or not isinstance(paragraphs, list) or not isinstance(watch, list):
        logger.warning("AI note schema invalid")
        return None
    if not (4 <= len(headline) <= 200):
        logger.warning("AI note headline length out of range: %d", len(headline))
        return None
    if not (2 <= len(paragraphs) <= 4):
        logger.warning("AI note paragraph count out of range: %d", len(paragraphs))
        return None
    if not (1 <= len(watch) <= 5):
        logger.warning("AI note watch_points count out of range: %d", len(watch))
        return None

    all_text_segments = [headline, *paragraphs, *watch]
    for seg in all_text_segments:
        if not isinstance(seg, str) or not seg.strip():
            logger.warning("AI note segment empty or non-string")
            return None
        if len(seg) > 500:
            logger.warning("AI note segment too long: %d chars", len(seg))
            return None
        for banned in _BANNED_TOKENS:
            if banned in seg:
                logger.warning("AI note contains banned token %s", banned)
                return None
        # Arabic-char ratio (over alphanumeric chars only) must exceed 60%.
        letters = [c for c in seg if c.isalpha()]
        if letters:
            ratio = sum(1 for c in letters if _ARABIC_CHAR_RE.match(c)) / len(letters)
            if ratio < 0.6:
                logger.warning("AI note segment Arabic ratio too low: %.2f", ratio)
                return None

    # Numeric grounding: every paragraph must reference a digit.
    for p in paragraphs:
        if not _NUMERIC_RE.search(p):
            logger.warning("AI note paragraph missing numeric grounding: %r", p[:60])
            return None

    return headline, [p.strip() for p in paragraphs], [w.strip() for w in watch]


async def generate_risk_note(inp: RiskNoteInput) -> RiskNote:
    """Generate the Arabic narrative for a risk update.

    Tries OpenRouter (DeepSeek), then the deterministic fallback. The
    fallback always succeeds — this function never raises.
    """
    providers: list[tuple[str, str, str, str]] = []
    if getattr(settings, "OPENROUTER_API_KEY", ""):
        providers.append(("openrouter", _OPENROUTER_URL, settings.OPENROUTER_API_KEY, _OPENROUTER_MODEL))

    for name, url, key, model in providers:
        try:
            raw = await _ask(url, key, model, inp)
        except Exception as e:
            logger.warning("AI note provider %s request failed: %s", name, e)
            continue

        validated = _validate(raw, inp)
        if validated is None:
            continue

        headline, paragraphs, watch = validated
        return RiskNote(
            headline_ar=headline,
            paragraphs_ar=paragraphs,
            watch_points_ar=watch,
            source="ai",
            model_used=f"{name}:{model}",
        )

    logger.info("AI note generators unavailable or rejected — using rule-based fallback")
    return build_fallback_note(inp)
