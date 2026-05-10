"""
UN02 — Risk Analysis Module
Verify the system returns the correct risk level (Low / Medium / High)
based on VaR and volatility.
Related FR: Sys-FR2
"""


def compute_risk_level(var: float, volatility: float) -> str:
    score = (abs(var) * 100) + (volatility * 100)
    if score >= 30:
        return "High"
    if score >= 15:
        return "Medium"
    return "Low"


def test_un02_risk_level_high():
    level = compute_risk_level(var=-0.05, volatility=0.40)
    assert level == "High"


def test_un02_risk_level_medium():
    level = compute_risk_level(var=-0.025, volatility=0.20)
    assert level == "Medium"


def test_un02_risk_level_low():
    level = compute_risk_level(var=-0.005, volatility=0.05)
    assert level == "Low"
