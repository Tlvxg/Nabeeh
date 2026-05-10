"""Business logic for the email alerts module.

Sends branded Arabic risk-alert emails via Resend to premium users who have
the given stock in their watchlist. Emails are *threaded* per (user, symbol)
so successive updates collapse into one inbox conversation, and gated by a
minimum-score-delta so trivial recomputes don't spam.
"""

import logging

from app.config import settings
from app.database import get_supabase_service
from app.modules.alerts import threading as alert_threading
from app.modules.alerts.schemas import RiskAlertData

logger = logging.getLogger(__name__)


def _level(score: float) -> str:
    if score <= 33:
        return "low"
    if score <= 66:
        return "medium"
    return "high"


def should_send_alert(data: RiskAlertData) -> tuple[bool, str]:
    """Return (send?, reason). Reason is logged regardless of decision."""
    if data.prev_overall_score is None:
        return True, "first_run"

    delta = abs(data.overall_score - data.prev_overall_score)
    if delta >= settings.ALERT_MIN_SCORE_DELTA:
        return True, f"delta_{delta:.1f}>={settings.ALERT_MIN_SCORE_DELTA}"

    if data.sr_break_detected and not (data.prev_sr_break_detected or False):
        return True, "sr_break_new"

    if _level(data.overall_score) != _level(data.prev_overall_score):
        return True, "level_changed"

    return False, f"delta_{delta:.1f}<{settings.ALERT_MIN_SCORE_DELTA}"


async def get_watchlist_users_for_stock(symbol: str) -> list[dict]:
    """Premium users with this symbol in their watchlist + alerts enabled."""
    try:
        client = get_supabase_service()

        watchlist_result = (
            client.table("user_watchlist")
            .select("user_id")
            .eq("stock_symbol", symbol)
            .execute()
        )
        if not watchlist_result.data:
            logger.info("No watchlist entries for %s — no alerts to send", symbol)
            return []

        watcher_ids = [row["user_id"] for row in watchlist_result.data]

        profiles_result = (
            client.table("user_profiles")
            .select("user_id")
            .eq("plan", "premium")
            .eq("email_alerts_enabled", True)
            .in_("user_id", watcher_ids)
            .execute()
        )
        if not profiles_result.data:
            logger.info("No premium watchers with alerts enabled for %s", symbol)
            return []

        premium_ids = [row["user_id"] for row in profiles_result.data]

        recipients: list[dict] = []
        for user_id in premium_ids:
            try:
                user_response = client.auth.admin.get_user_by_id(user_id)
                if user_response and user_response.user and user_response.user.email:
                    recipients.append({"user_id": user_id, "email": user_response.user.email})
            except Exception as e:
                logger.warning("Failed to fetch user %s from auth: %s", user_id, e)

        logger.info("Resolved %d email addresses for %s alerts", len(recipients), symbol)
        return recipients

    except Exception as e:
        logger.error("Failed to get watchlist users for %s: %s", symbol, e)
        return []


async def send_risk_alert(alert_data: RiskAlertData) -> dict:
    """Send a threaded risk alert email to all eligible premium watchers.

    Returns a dict with sent / failed / skipped counts and the gating reason.
    """
    if not settings.RESEND_API_KEY:
        logger.warning(
            "Email alerts disabled (no RESEND_API_KEY) — skipping alert for %s",
            alert_data.symbol,
        )
        return {"sent": 0, "skipped": True, "reason": "no_api_key"}

    proceed, reason = should_send_alert(alert_data)
    if not proceed:
        logger.info("Alert skipped for %s: %s", alert_data.symbol, reason)
        return {"sent": 0, "skipped": True, "reason": reason}

    recipients = await get_watchlist_users_for_stock(alert_data.symbol)
    if not recipients:
        return {"sent": 0, "skipped": False, "reason": "no_watchers"}

    from app.modules.alerts.template import build_risk_alert_html

    html_body = build_risk_alert_html(alert_data)

    import resend

    resend.api_key = settings.RESEND_API_KEY

    sent_count = 0
    failed_count = 0

    for recipient in recipients:
        user_id = recipient["user_id"]
        email = recipient["email"]
        is_first = alert_threading.is_first_send(user_id, alert_data.symbol)
        message_id = (
            alert_threading.thread_root_message_id(user_id, alert_data.symbol)
            if is_first
            else alert_threading.new_message_id(user_id, alert_data.symbol)
        )
        headers = alert_threading.build_threading_headers(
            user_id=user_id, symbol=alert_data.symbol, this_message_id=message_id
        )
        subject = alert_threading.normalise_subject(
            alert_data.symbol, alert_data.name_ar, is_first
        )

        resend_email_id: str | None = None
        try:
            result = resend.Emails.send(
                {
                    "from": settings.ALERT_FROM_EMAIL,
                    "to": [email],
                    "subject": subject,
                    "html": html_body,
                    "headers": headers,
                }
            )
            if isinstance(result, dict):
                resend_email_id = result.get("id")
            sent_count += 1
            logger.info(
                "Alert sent to %s for %s (msgid=%s, resend_id=%s)",
                email, alert_data.symbol, message_id, resend_email_id,
            )
        except Exception as e:
            failed_count += 1
            logger.error("Failed to send alert to %s for %s: %s", email, alert_data.symbol, e)
            continue

        if alert_data.stock_id is None:
            logger.warning(
                "alert_data.stock_id missing — cannot persist sent_alerts for %s",
                alert_data.symbol,
            )
            continue

        try:
            alert_threading.persist_sent_alert(
                user_id=user_id,
                stock_id=alert_data.stock_id,
                symbol=alert_data.symbol,
                risk_note_id=alert_data.risk_note_id,
                message_id=message_id,
                resend_email_id=resend_email_id,
                score_at_send=alert_data.overall_score,
                prev_score_at_send=alert_data.prev_overall_score,
            )
        except Exception as e:
            logger.warning("Failed to record sent_alerts row for %s/%s: %s", user_id, alert_data.symbol, e)

    logger.info(
        "Alert sending complete for %s: sent=%d failed=%d (gate=%s)",
        alert_data.symbol, sent_count, failed_count, reason,
    )
    return {"sent": sent_count, "failed": failed_count, "reason": reason}
