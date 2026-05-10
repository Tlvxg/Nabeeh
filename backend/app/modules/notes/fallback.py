"""Deterministic Arabic narrative generator. Single canonical fallback used
when the AI provider fails, returns malformed output, or trips a safety check.
"""

from app.modules.notes.schemas import RiskNote, RiskNoteInput


def _level(score: float) -> tuple[str, str]:
    if score <= 33:
        return "low", "منخفض"
    if score <= 66:
        return "medium", "متوسط"
    return "high", "مرتفع"


def build_fallback_note(inp: RiskNoteInput) -> RiskNote:
    score = inp.overall_score
    prev_score = inp.prev_score
    name = inp.name_ar
    _, level_ar = _level(score)
    vol_pct = inp.vol_252d * 100
    var_pct = abs(inp.var_95_hist) * 100
    prev_vol = (inp.prev_vol_252d * 100) if inp.prev_vol_252d is not None else None
    prev_var = (abs(inp.prev_var_95_hist) * 100) if inp.prev_var_95_hist is not None else None
    neg_pct = inp.sentiment_neg_pct
    chg_pct = inp.price_change_pct
    sr_break = inp.sr_break_detected
    sr_level = inp.sr_break_level

    paragraphs: list[str] = []
    watch_points: list[str] = []

    # Opening
    if prev_score is not None:
        diff = score - prev_score
        if abs(diff) < 2:
            opening = f"درجة مخاطرة {name} مستقرة عند {round(score)} نقطة ({level_ar})."
        elif diff > 0:
            opening = (
                f"ارتفعت درجة مخاطرة {name} من {round(prev_score)} إلى {round(score)} نقطة "
                f"(+{round(diff)} نقطة)."
            )
            if score > 66:
                opening += " المستوى الحالي مرتفع ويستدعي الحذر."
        else:
            opening = (
                f"تراجعت درجة مخاطرة {name} من {round(prev_score)} إلى {round(score)} نقطة "
                f"({round(diff)} نقطة) — تحسن مقارنة بالقراءة السابقة."
            )
        if chg_pct is not None:
            direction = "ارتفع" if chg_pct >= 0 else "انخفض"
            opening += f" السعر {direction} بنسبة {abs(chg_pct):.1f}% في آخر جلسة."
        paragraphs.append(opening)
    else:
        p = f"{name} يُسجّل درجة مخاطرة {level_ar} عند {round(score)} من 100."
        if chg_pct is not None:
            direction = "ارتفع" if chg_pct >= 0 else "انخفض"
            p += f" السعر {direction} بنسبة {abs(chg_pct):.1f}% في آخر جلسة."
        paragraphs.append(p)

    # Drivers
    drivers: list[str] = []
    if prev_vol is not None and abs(vol_pct - prev_vol) >= 0.5:
        vol_dir = "ارتفع" if vol_pct > prev_vol else "انخفض"
        drivers.append(
            f"التقلب السنوي {vol_dir} من {prev_vol:.1f}% إلى {vol_pct:.1f}%"
            + ("، مما يُشير إلى تذبذب سعري متزايد" if vol_pct > prev_vol else "، مما يعكس استقراراً أكبر")
        )
    elif vol_pct > 25:
        drivers.append(f"التقلب السنوي مرتفع عند {vol_pct:.1f}%")

    if prev_var is not None and abs(var_pct - prev_var) >= 0.2:
        var_dir = "ارتفعت" if var_pct > prev_var else "انخفضت"
        drivers.append(
            f"الخسارة المتوقعة (VaR) {var_dir} من {prev_var:.2f}% إلى {var_pct:.2f}%"
            + ("، احتمالية خسارة أكبر في يوم واحد" if var_pct > prev_var else "، احتمالية خسارة أقل")
        )
    elif var_pct > 3:
        drivers.append(f"الخسارة المتوقعة اليومية مرتفعة عند {var_pct:.2f}%")

    if neg_pct > 50:
        drivers.append(f"الأخبار السلبية سائدة ({neg_pct:.0f}%) — ضغط إعلامي على السهم")
    elif neg_pct < 25:
        drivers.append(f"المشاعر الإعلامية إيجابية ({neg_pct:.0f}% أخبار سلبية فقط)")

    if sr_break and sr_level:
        drivers.append(f"تم اختراق مستوى دعم/مقاومة عند {sr_level} ريال")

    if drivers:
        if prev_score is not None and abs(score - prev_score) >= 2:
            paragraphs.append("سبب التغيير: " + ". ".join(drivers[:2]) + ".")
        else:
            paragraphs.append("أبرز العوامل: " + ". ".join(drivers[:2]) + ".")

    # Watch points
    if level_ar == "مرتفع" or (prev_score is not None and score - prev_score > 5):
        watch_points.append("راقب استمرار ارتفاع المخاطرة — تراكم الإشارات السلبية يزيد من الخطر")
    if neg_pct > 40:
        watch_points.append("تابع تحولات الأخبار — تحسن المشاعر قد يخفف الضغط")
    if sr_break:
        watch_points.append("انتبه للمستوى المخترق — قد يتحول إلى مقاومة جديدة")
    if vol_pct > 25:
        watch_points.append("تذبذب مرتفع — توقع تحركات سعرية أكبر في الأيام القادمة")
    if not watch_points:
        watch_points.append("تابع درجة المخاطرة والأخبار بشكل منتظم")

    headline = (
        f"درجة المخاطرة {round(score)} ({level_ar}) — {name}"
        if prev_score is None
        else f"المخاطرة {round(score)} ({level_ar}) مقابل {round(prev_score)} سابقاً — {name}"
    )

    return RiskNote(
        headline_ar=headline,
        paragraphs_ar=paragraphs,
        watch_points_ar=watch_points,
        source="fallback",
        model_used=None,
    )
