"""
UN03 — Risk Analysis Module
Verify the risk explanation lists the contributing factors driving
the assigned risk level.
Related FR: Sys-FR3
"""


def generate_risk_explanation(high_volatility: bool, negative_news: bool, large_loss: bool) -> str:
    factors = []
    if high_volatility:
        factors.append("تقلب مرتفع في السعر")
    if negative_news:
        factors.append("أخبار سلبية حديثة")
    if large_loss:
        factors.append("خسارة محتملة كبيرة")
    if not factors:
        return "لا توجد عوامل خطر بارزة"
    return "العوامل المساهمة في المخاطر: " + " - ".join(factors)


def test_un03_explanation_includes_contributing_factors():
    text = generate_risk_explanation(
        high_volatility=True,
        negative_news=True,
        large_loss=False,
    )
    assert "تقلب" in text
    assert "أخبار سلبية" in text
