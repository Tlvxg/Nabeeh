"""Branded Arabic HTML email template for risk alerts.

Renders the AI-generated narrative (headline + paragraphs + watch points)
inside the existing Nabeeh visual chrome (navy header, score circle, metrics
table, CTA, disclaimer). Falls back to a minimal body if note fields are
missing — the backend pipeline always provides them, so this only triggers
for handcrafted manual sends.
"""

from app.config import settings
from app.modules.alerts.schemas import RiskAlertData


def _get_score_color(interpretation: str) -> str:
    if interpretation == "منخفض":
        return "#2d6a4f"
    if interpretation == "متوسط":
        return "#e67e22"
    return "#c0392b"


def _translate_trigger(trigger: str) -> str:
    return {
        "scheduled": "تحديث مجدول",
        "sr_break": "كسر مستوى دعم/مقاومة",
        "manual": "يدوي",
        "startup": "تحديث أولي",
        "initial": "تحديث أولي",
    }.get(trigger, "تحديث مجدول")


def _stock_url(symbol: str) -> str:
    base = settings.FRONTEND_BASE_URL.rstrip("/")
    return f"{base}/stock/{symbol}"


def build_risk_alert_html(data: RiskAlertData) -> str:
    score_color = _get_score_color(data.interpretation_ar)
    trigger_ar = _translate_trigger(data.trigger)
    var_pct = f"{abs(data.var_95_hist) * 100:.2f}%"
    vol_pct = f"{data.vol_252d * 100:.2f}%"
    score_display = f"{data.overall_score:.0f}"
    stock_url = _stock_url(data.symbol)

    sr_break_row = ""
    if data.sr_break_detected and data.sr_break_level:
        sr_break_row = f"""
                        <tr>
                          <td style="padding: 10px 14px; border-bottom: 1px solid #eee; color: #333; font-size: 14px; text-align: right;">
                            مستوى الكسر
                          </td>
                          <td style="padding: 10px 14px; border-bottom: 1px solid #eee; color: #0d1b2a; font-weight: 600; font-size: 14px; text-align: left;">
                            {data.sr_break_level}
                          </td>
                        </tr>"""

    headline = data.headline_ar or "تحديث المخاطر"
    paragraphs = data.paragraphs_ar or []
    watch_points = data.watch_points_ar or []

    narrative_html = "".join(
        f'<p style="margin: 0 0 10px; font-family: \'Segoe UI\', Tahoma, Arial, sans-serif; '
        f'font-size: 14px; color: #1b3a4b; line-height: 1.8; text-align: right;">{p}</p>'
        for p in paragraphs
    )
    watch_html = "".join(
        f'<li style="margin-bottom: 6px; font-family: \'Segoe UI\', Tahoma, Arial, sans-serif; '
        f'font-size: 13px; color: #5c6b73; line-height: 1.6;">{w}</li>'
        for w in watch_points
    )

    notes_section = ""
    if narrative_html:
        ai_badge = ""
        if data.note_source == "ai":
            ai_badge = (
                '<span style="display: inline-block; margin-right: 8px; padding: 2px 8px; '
                'border-radius: 999px; background: #e8f5ee; color: #2d6a4f; '
                'font-size: 10px; font-weight: 700; vertical-align: middle;">'
                'تم توليده بالذكاء الاصطناعي</span>'
            )
        watch_block = (
            f'<div style="margin-top: 14px; background: #f8f9fa; border-right: 3px solid #c8cbc7; '
            f'padding: 12px 14px; border-radius: 4px;">'
            f'<p style="margin: 0 0 8px; font-family: \'Segoe UI\', Tahoma, Arial, sans-serif; '
            f'font-size: 11px; font-weight: 700; color: #999; text-transform: uppercase; text-align: right;">'
            f'نقاط المتابعة</p>'
            f'<ul style="margin: 0; padding-right: 16px; text-align: right;">{watch_html}</ul>'
            f'</div>'
            if watch_html else ""
        )
        notes_section = f"""
          <tr>
            <td style="padding: 0 30px 8px; text-align: right;">
              <p style="margin: 0 0 12px; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; font-size: 15px; font-weight: 700; color: #0d1b2a;">
                ملاحظات نبيه{ai_badge}
              </p>
              {narrative_html}
              {watch_block}
            </td>
          </tr>
"""

    return f"""<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>تنبيه مخاطر - نبيه</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f0f0f0; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f0f0f0;">
    <tr>
      <td align="center" style="padding: 20px 10px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; max-width: 600px;">

          <tr>
            <td bgcolor="#0d1b2a" style="background-color: #0d1b2a; padding: 24px 30px; text-align: center;">
              <span style="font-size: 24px; font-weight: 700; color: #ffffff;">نبيه</span>
              <br>
              <span style="font-size: 14px; color: #4a9d7a;">تنبيه مخاطر</span>
            </td>
          </tr>

          <tr>
            <td style="padding: 24px 30px 8px 30px; text-align: center;">
              <span style="font-size: 18px; font-weight: 700; color: #0d1b2a;">{data.name_ar}</span>
              <br>
              <span style="font-size: 13px; color: #5c6b73;">{data.symbol}.SR</span>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding: 16px 30px 8px 30px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="width: 100px; height: 100px; border-radius: 50px; background-color: {score_color}; text-align: center; vertical-align: middle;">
                    <span style="font-size: 36px; font-weight: 700; color: #ffffff; line-height: 100px;">{score_display}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding: 4px 30px 16px 30px; text-align: center;">
              <span style="font-size: 16px; font-weight: 600; color: {score_color};">
                مستوى المخاطر: {data.interpretation_ar}
              </span>
            </td>
          </tr>

          <tr>
            <td style="padding: 0 30px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-top: 1px solid #e0e1dd; height: 1px; font-size: 0; line-height: 0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding: 16px 30px 4px; text-align: right;">
              <p style="margin: 0; font-size: 14px; font-weight: 700; color: #0d1b2a;">{headline}</p>
            </td>
          </tr>
{notes_section}

          <tr>
            <td style="padding: 16px 30px 8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border: 1px solid #e0e1dd; border-radius: 6px; overflow: hidden;">
                <tr style="background-color: #f8f9fa;">
                  <td style="padding: 10px 14px; border-bottom: 1px solid #eee; color: #5c6b73; font-size: 13px; font-weight: 600; text-align: right;">المقياس</td>
                  <td style="padding: 10px 14px; border-bottom: 1px solid #eee; color: #5c6b73; font-size: 13px; font-weight: 600; text-align: left;">القيمة</td>
                </tr>
                <tr>
                  <td style="padding: 10px 14px; border-bottom: 1px solid #eee; color: #333; font-size: 14px; text-align: right;">القيمة المعرضة للخطر (VaR 95%)</td>
                  <td style="padding: 10px 14px; border-bottom: 1px solid #eee; color: #0d1b2a; font-weight: 600; font-size: 14px; text-align: left;">{var_pct}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 14px; border-bottom: 1px solid #eee; color: #333; font-size: 14px; text-align: right;">التقلب السنوي</td>
                  <td style="padding: 10px 14px; border-bottom: 1px solid #eee; color: #0d1b2a; font-weight: 600; font-size: 14px; text-align: left;">{vol_pct}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 14px; border-bottom: 1px solid #eee; color: #333; font-size: 14px; text-align: right;">المحفز</td>
                  <td style="padding: 10px 14px; border-bottom: 1px solid #eee; color: #0d1b2a; font-weight: 600; font-size: 14px; text-align: left;">{trigger_ar}</td>
                </tr>{sr_break_row}
              </table>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding: 10px 30px 24px 30px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="#2d6a4f" style="background-color: #2d6a4f; border-radius: 6px;">
                    <a href="{stock_url}" target="_blank" style="display: inline-block; padding: 12px 28px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none;">
                      عرض تفاصيل السهم
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td bgcolor="#f5f5f5" style="background-color: #f5f5f5; padding: 20px 30px; text-align: center;">
              <p style="margin: 0 0 8px 0; font-size: 12px; color: #666; line-height: 1.6;">
                هذا التنبيه لأغراض تعليمية فقط وليس نصيحة استثمارية
              </p>
              <p style="margin: 0; font-size: 12px; color: #999;">
                نبيه &mdash; منصة تحليل مخاطر الأسهم السعودية
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""
