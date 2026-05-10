"""Persistence for AI-generated risk notes."""

from datetime import datetime, timezone

from app.database import get_supabase, get_supabase_service
from app.modules.notes.schemas import RiskNote, RiskNoteInput


async def insert_risk_note(
    stock_id: int,
    note: RiskNote,
    inp: RiskNoteInput,
) -> int | None:
    """Insert a risk_notes row and return its id."""
    client = get_supabase_service()
    row = {
        "stock_id": stock_id,
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "overall_score": str(round(inp.overall_score, 2)),
        "prev_score": str(round(inp.prev_score, 2)) if inp.prev_score is not None else None,
        "headline_ar": note.headline_ar,
        "paragraphs_ar": note.paragraphs_ar,
        "watch_points_ar": note.watch_points_ar,
        "source": note.source,
        "model_used": note.model_used,
        "raw_input": inp.model_dump(),
    }
    result = client.table("risk_notes").insert(row).execute()
    if result.data and len(result.data) > 0:
        return result.data[0].get("id")
    return None


async def get_latest_risk_note(stock_id: int) -> dict | None:
    """Read the most recent risk_notes row for a stock (anon client)."""
    client = get_supabase()
    result = (
        client.table("risk_notes")
        .select("*")
        .eq("stock_id", stock_id)
        .order("computed_at", desc=True)
        .limit(1)
        .execute()
    )
    if result.data:
        return result.data[0]
    return None
