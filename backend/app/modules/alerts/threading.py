"""RFC-5322 message-ID + References helpers for threading risk alerts.

Goal: each (user, symbol) pair gets one Gmail / Apple-Mail conversation that
collapses successive risk updates instead of producing N stand-alone emails.

Strategy:
  - thread_root_message_id(user, symbol) is deterministic — never changes.
  - The first email for a (user, symbol) uses the thread root as its Message-ID.
  - Every subsequent email gets a new unique Message-ID, and sets In-Reply-To
    to the previous message's ID and References to "{root} {prev1} {prev2}..."
    (truncated to keep header length sane).
  - Subject is normalised with a "Re:" prefix from the second email on so most
    mail clients group by subject + References.
  - sent_alerts is the source of truth for "what did we last send to this user
    for this symbol".

The helpers do not depend on Resend at all — they just produce strings and
records that service.py wires into the API call.
"""

from datetime import datetime, timezone
from typing import Iterable

from app.database import get_supabase_service

_DOMAIN = "nabeeh.app"
_MAX_REFERENCES = 5  # cap header length


def thread_root_message_id(user_id: str, symbol: str) -> str:
    return f"<nabeeh-thread-{user_id}-{symbol}@{_DOMAIN}>"


def new_message_id(user_id: str, symbol: str, computed_at: datetime | None = None) -> str:
    ts = int((computed_at or datetime.now(timezone.utc)).timestamp())
    return f"<nabeeh-{user_id}-{symbol}-{ts}@{_DOMAIN}>"


def fetch_last_sent_alerts(user_id: str, symbol: str, limit: int = _MAX_REFERENCES) -> list[dict]:
    """Most-recent-first list of prior sent_alerts rows for (user, symbol)."""
    client = get_supabase_service()
    result = (
        client.table("sent_alerts")
        .select("id, message_id, sent_at")
        .eq("user_id", user_id)
        .eq("symbol", symbol)
        .order("sent_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data or []


def build_threading_headers(user_id: str, symbol: str, this_message_id: str) -> dict[str, str]:
    """Return the {Message-ID, In-Reply-To, References} headers for the next email.

    For first-ever send: only Message-ID is set (no parent to reply to).
    Subsequent sends: In-Reply-To = previous Message-ID; References = root + chain.
    """
    history = fetch_last_sent_alerts(user_id, symbol)
    headers: dict[str, str] = {"Message-ID": this_message_id}

    if not history:
        return headers

    previous_ids = [row["message_id"] for row in history if row.get("message_id")]
    if not previous_ids:
        return headers

    headers["In-Reply-To"] = previous_ids[0]
    refs: list[str] = [thread_root_message_id(user_id, symbol)]
    for mid in reversed(previous_ids):  # oldest → newest per RFC 5322
        if mid not in refs:
            refs.append(mid)
    headers["References"] = " ".join(refs)
    return headers


def is_first_send(user_id: str, symbol: str) -> bool:
    """True iff there are no prior sent_alerts rows for this (user, symbol)."""
    return len(fetch_last_sent_alerts(user_id, symbol, limit=1)) == 0


def persist_sent_alert(
    *,
    user_id: str,
    stock_id: int,
    symbol: str,
    risk_note_id: int | None,
    message_id: str,
    resend_email_id: str | None,
    score_at_send: float,
    prev_score_at_send: float | None,
) -> None:
    """Record an outgoing alert. Failures are caught by the caller — never
    block the actual email send because of a logging failure."""
    client = get_supabase_service()
    row = {
        "user_id": user_id,
        "stock_id": stock_id,
        "symbol": symbol,
        "risk_note_id": risk_note_id,
        "message_id": message_id,
        "resend_email_id": resend_email_id,
        "thread_root_message_id": thread_root_message_id(user_id, symbol),
        "score_at_send": str(round(score_at_send, 2)),
        "prev_score_at_send": str(round(prev_score_at_send, 2)) if prev_score_at_send is not None else None,
    }
    client.table("sent_alerts").insert(row).execute()


def normalise_subject(symbol: str, name_ar: str, is_first: bool) -> str:
    base = f"تحديث مخاطر: {name_ar} ({symbol}.SR)"
    return base if is_first else f"Re: {base}"
