#!/usr/bin/env python3
"""Backfill AI-generated risk notes for every active stock.

Run once after deploying the risk_notes feature so the dashboard doesn't
show "no AI note yet" for the first 24 hours. Uses the latest two
risk_metrics rows per stock as input — the most recent becomes "current",
the older one (if any) becomes "previous" for diffing.

Usage:
    cd backend && python -m scripts.backfill_risk_notes
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import get_supabase_service  # noqa: E402
from app.modules.notes.repository import insert_risk_note  # noqa: E402
from app.modules.notes.schemas import RiskNoteInput  # noqa: E402
from app.modules.notes.service import generate_risk_note  # noqa: E402


def _f(row: dict, key: str) -> float | None:
    v = row.get(key)
    return float(v) if v is not None else None


async def _sentiment_neg_pct(stock_id: int) -> float:
    client = get_supabase_service()
    result = (
        client.table("sentiment_scores")
        .select("sentiment")
        .eq("stock_id", stock_id)
        .order("analyzed_at", desc=True)
        .limit(20)
        .execute()
    )
    rows = result.data or []
    if not rows:
        return 0.0
    neg = sum(1 for r in rows if r.get("sentiment") == "negative")
    return round(neg / len(rows) * 100, 1)


async def _price_change_pct(stock_id: int) -> float | None:
    client = get_supabase_service()
    result = (
        client.table("daily_prices")
        .select("close_price")
        .eq("stock_id", stock_id)
        .order("trade_date", desc=True)
        .limit(2)
        .execute()
    )
    prices = result.data or []
    if len(prices) < 2:
        return None
    today = float(prices[0]["close_price"])
    prev = float(prices[1]["close_price"])
    if prev == 0:
        return None
    return round((today - prev) / prev * 100, 2)


async def backfill_one(stock: dict) -> str:
    stock_id = stock["id"]
    symbol = stock["symbol"]
    name_ar = stock.get("name_ar", symbol)

    client = get_supabase_service()
    metrics = (
        client.table("risk_metrics")
        .select("*")
        .eq("stock_id", stock_id)
        .order("computed_at", desc=True)
        .limit(2)
        .execute()
    )
    rows = metrics.data or []
    if not rows:
        return f"skip {symbol}: no risk_metrics"

    curr = rows[0]
    prev = rows[1] if len(rows) > 1 else None

    overall_score = float(curr["overall_score"])
    prev_score = _f(prev, "overall_score") if prev else None

    inp = RiskNoteInput(
        symbol=symbol,
        name_ar=name_ar,
        overall_score=overall_score,
        prev_score=prev_score,
        score_delta=(overall_score - prev_score) if prev_score is not None else None,
        interpretation_ar=curr.get("interpretation_ar") or "متوسط",
        var_95_hist=_f(curr, "var_95_hist") or -0.02,
        prev_var_95_hist=_f(prev, "var_95_hist") if prev else None,
        vol_252d=_f(curr, "vol_252d") or 0.2,
        prev_vol_252d=_f(prev, "vol_252d") if prev else None,
        sentiment_neg_pct=await _sentiment_neg_pct(stock_id),
        price_change_pct=await _price_change_pct(stock_id),
        sr_break_detected=bool(curr.get("sr_break_detected") or False),
        sr_break_level=curr.get("sr_break_level"),
    )

    note = await generate_risk_note(inp)
    note_id = await insert_risk_note(stock_id, note, inp)
    return f"ok   {symbol}: source={note.source} model={note.model_used} id={note_id}"


async def main() -> None:
    client = get_supabase_service()
    stocks_result = (
        client.table("stocks")
        .select("id, symbol, name_ar")
        .eq("is_active", True)
        .execute()
    )
    stocks = stocks_result.data or []
    if not stocks:
        print("No active stocks found.")
        return

    print(f"Backfilling risk_notes for {len(stocks)} stocks...")
    for stock in stocks:
        try:
            line = await backfill_one(stock)
        except Exception as e:
            line = f"FAIL {stock.get('symbol')}: {e}"
        print(line)


if __name__ == "__main__":
    asyncio.run(main())
