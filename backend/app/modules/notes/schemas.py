"""Schemas for AI-generated risk notes (NabeehNotes)."""

from typing import Literal

from pydantic import BaseModel, Field


class RiskNoteInput(BaseModel):
    """Snapshot passed to the AI generator. Plain dicts in / out so the
    same payload can be persisted as raw_input for audit."""

    symbol: str
    name_ar: str
    overall_score: float
    prev_score: float | None
    score_delta: float | None
    interpretation_ar: str
    var_95_hist: float
    prev_var_95_hist: float | None
    vol_252d: float
    prev_vol_252d: float | None
    sentiment_neg_pct: float
    price_change_pct: float | None
    sr_break_detected: bool
    sr_break_level: str | None


class RiskNote(BaseModel):
    """Output of the note generator. Persisted to risk_notes table."""

    headline_ar: str = Field(min_length=4, max_length=200)
    paragraphs_ar: list[str]
    watch_points_ar: list[str]
    source: Literal["ai", "fallback"]
    model_used: str | None = None
