"""Pydantic schemas for the email alerts module."""

from pydantic import BaseModel


class RiskAlertData(BaseModel):
    """Self-contained payload for a risk alert email.

    Carries the current risk snapshot, the previous one for diffing/gating,
    and the AI-generated narrative (headline + paragraphs + watch points)
    that the email body should render.
    """

    # Identity
    symbol: str
    name_ar: str
    stock_id: int | None = None

    # Current snapshot
    overall_score: float
    interpretation_ar: str  # منخفض / متوسط / مرتفع
    var_95_hist: float
    vol_252d: float
    trigger: str  # "scheduled" | "sr_break" | "manual"
    sr_break_detected: bool
    sr_break_level: str | None = None

    # Previous snapshot (for diffing + alert gating). None on first-ever run.
    prev_overall_score: float | None = None
    prev_var_95_hist: float | None = None
    prev_vol_252d: float | None = None
    prev_sr_break_detected: bool | None = None

    # AI-generated narrative (required — fallback narrative is always available
    # so this is never empty in practice).
    risk_note_id: int | None = None
    headline_ar: str | None = None
    paragraphs_ar: list[str] = []
    watch_points_ar: list[str] = []
    note_source: str | None = None  # "ai" | "fallback"
