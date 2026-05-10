"""Pipeline data completeness verification for all 10 Tadawul stocks.

Checks all 7 pipeline tables (PIPE-01 through PIPE-07) for data presence
and quality thresholds. Also verifies the cron schedule in scheduler.py
against the AUTO-02 specification.

Usage:
    # With environment variables:
    SUPABASE_URL=... SUPABASE_KEY=... python3 scripts/verify_pipeline.py

    # With dotenv fallback (reads backend/.env):
    python3 scripts/verify_pipeline.py

Exit codes:
    0 - All checks passed
    1 - One or more checks failed
"""

import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Environment setup
# ---------------------------------------------------------------------------

_project_root = Path(__file__).resolve().parent.parent
_env_path = _project_root / "backend" / ".env"

try:
    from dotenv import load_dotenv
    load_dotenv(_env_path)
except ImportError:
    pass  # dotenv optional if env vars already set

from supabase import create_client, Client

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY") or os.getenv("SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: SUPABASE_URL and SUPABASE_KEY (or SUPABASE_ANON_KEY) must be set.")
    print(f"  Tried loading from: {_env_path}")
    sys.exit(1)

client: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


# ---------------------------------------------------------------------------
# Pipeline checks (PIPE-01 through PIPE-07)
# ---------------------------------------------------------------------------

def check_prices(stock_id: int) -> tuple[bool, str]:
    """PIPE-01: daily_prices >= 100 rows AND latest within 5 calendar days."""
    result = (
        client.table("daily_prices")
        .select("trade_date", count="exact")
        .eq("stock_id", stock_id)
        .execute()
    )
    count = result.count if result.count is not None else len(result.data or [])

    if count < 100:
        return False, f"{count} rows (need >= 100)"

    if not result.data:
        return False, "no data rows returned"

    latest = max(row["trade_date"] for row in result.data)
    cutoff = (datetime.now(timezone.utc) - timedelta(days=5)).strftime("%Y-%m-%d")
    if latest < cutoff:
        return False, f"latest={latest} (> 5 days old)"

    return True, f"{count} rows, latest={latest}"


def check_stats(stock_id: int) -> tuple[bool, str]:
    """PIPE-02: stock_stats has annual_volatility and week_52_high non-null."""
    result = (
        client.table("stock_stats")
        .select("annual_volatility, week_52_high, week_52_low")
        .eq("stock_id", stock_id)
        .execute()
    )
    if not result.data:
        return False, "no stats row"

    row = result.data[0]
    missing = []
    if row.get("annual_volatility") is None:
        missing.append("annual_volatility")
    if row.get("week_52_high") is None:
        missing.append("week_52_high")

    if missing:
        return False, f"null: {', '.join(missing)}"
    return True, "OK"


def check_risk(stock_id: int) -> tuple[bool, str]:
    """PIPE-03: risk_metrics has overall_score, var_95_hist, vol_252d non-null."""
    result = (
        client.table("risk_metrics")
        .select("overall_score, var_95_hist, vol_252d")
        .eq("stock_id", stock_id)
        .execute()
    )
    if not result.data:
        return False, "no risk row"

    row = result.data[0]
    missing = []
    if row.get("overall_score") is None:
        missing.append("overall_score")
    if row.get("var_95_hist") is None:
        missing.append("var_95_hist")
    if row.get("vol_252d") is None:
        missing.append("vol_252d")

    if missing:
        return False, f"null: {', '.join(missing)}"
    return True, f"score={row['overall_score']:.1f}"


def check_monte_carlo(stock_id: int) -> tuple[bool, str]:
    """PIPE-04: monte_carlo_results has days=252, paths=10000, percentiles.p50 exists."""
    result = (
        client.table("monte_carlo_results")
        .select("days, paths, percentiles")
        .eq("stock_id", stock_id)
        .execute()
    )
    if not result.data:
        return False, "no MC row"

    row = result.data[0]
    issues = []

    if row.get("days") != 252:
        issues.append(f"days={row.get('days')} (need 252)")
    if row.get("paths") != 10000:
        issues.append(f"paths={row.get('paths')} (need 10000)")

    percentiles = row.get("percentiles")
    if not percentiles or not isinstance(percentiles, dict):
        issues.append("no percentiles")
    elif "p50" not in percentiles:
        issues.append("missing p50")
    elif not isinstance(percentiles["p50"], list) or len(percentiles["p50"]) == 0:
        issues.append("p50 empty")

    if issues:
        return False, "; ".join(issues)
    return True, f"252d x 10k, p50[{len(percentiles['p50'])}]"


def check_pivots(stock_id: int) -> tuple[bool, str]:
    """PIPE-05: pivot_levels has at least one row with non-null pivot_point."""
    result = (
        client.table("pivot_levels")
        .select("pivot_point, r1, s1")
        .eq("stock_id", stock_id)
        .execute()
    )
    if not result.data:
        return False, "no pivot row"

    row = result.data[0]
    if row.get("pivot_point") is None:
        return False, "pivot_point is null"
    return True, f"PP={row['pivot_point']:.2f}"


def check_news(stock_id: int) -> tuple[bool, str]:
    """PIPE-06: news_articles has at least 1 article for this stock."""
    result = (
        client.table("news_articles")
        .select("id", count="exact")
        .eq("stock_id", stock_id)
        .execute()
    )
    count = result.count if result.count is not None else len(result.data or [])
    if count < 1:
        return False, "0 articles"
    return True, f"{count} articles"


def check_sentiment(stock_id: int) -> tuple[bool, str]:
    """PIPE-07: sentiment_scores has at least 1 score for this stock."""
    result = (
        client.table("sentiment_scores")
        .select("id", count="exact")
        .eq("stock_id", stock_id)
        .execute()
    )
    count = result.count if result.count is not None else len(result.data or [])
    if count < 1:
        return False, "0 scores"
    return True, f"{count} scores"


# ---------------------------------------------------------------------------
# Cron schedule verification (AUTO-02)
# ---------------------------------------------------------------------------

def verify_cron_schedule() -> list[tuple[str, bool, str]]:
    """Read scheduler.py and verify cron triggers match AUTO-02 spec.

    Expected schedule:
      - price_fetch: CronTrigger hour=12, minute=30, day_of_week includes sun,mon,tue,wed,thu
      - stats_and_pivots: CronTrigger hour=12, minute=35, same days
      - news_and_sentiment: IntervalTrigger(minutes=30)
      - risk_and_monte_carlo: CronTrigger hour=12, minute=40, same days
    """
    scheduler_path = _project_root / "backend" / "app" / "scheduler.py"
    if not scheduler_path.exists():
        return [("scheduler.py", False, f"file not found: {scheduler_path}")]

    content = scheduler_path.read_text()
    results: list[tuple[str, bool, str]] = []

    # Expected cron jobs with their parameters
    expected_crons = [
        ("price_fetch", 12, 30),
        ("stats_and_pivots", 12, 35),
        ("risk_and_monte_carlo", 12, 40),
    ]

    tadawul_days = {"sun", "mon", "tue", "wed", "thu"}

    # Strategy: find each add_job block by locating id="<job_id>" and then
    # extracting the surrounding add_job(...) call text backward to find
    # the trigger parameters. Simpler approach: find the text between
    # consecutive add_job calls and parse each block independently.
    #
    # We split the file into blocks per add_job call, then match by id.
    job_blocks: dict[str, str] = {}
    # Find all add_job positions
    add_job_positions = [m.start() for m in re.finditer(r'_scheduler\.add_job\(', content)]
    for i, pos in enumerate(add_job_positions):
        end = add_job_positions[i + 1] if i + 1 < len(add_job_positions) else len(content)
        block = content[pos:end]
        id_match = re.search(r'id="([^"]+)"', block)
        if id_match:
            job_blocks[id_match.group(1)] = block

    for job_id, exp_hour, exp_minute in expected_crons:
        if job_id not in job_blocks:
            results.append((job_id, False, f'id="{job_id}" not found'))
            continue

        block = job_blocks[job_id]

        # Check for CronTrigger
        cron_match = re.search(r'CronTrigger\((.*?)\)', block, re.DOTALL)
        if not cron_match:
            results.append((job_id, False, "CronTrigger not found in block"))
            continue

        trigger_args = cron_match.group(1)

        # Check hour
        hour_match = re.search(r'hour\s*=\s*(\d+)', trigger_args)
        if not hour_match or int(hour_match.group(1)) != exp_hour:
            actual = hour_match.group(1) if hour_match else "missing"
            results.append((job_id, False, f"hour={actual} (expected {exp_hour})"))
            continue

        # Check minute
        minute_match = re.search(r'minute\s*=\s*(\d+)', trigger_args)
        if not minute_match or int(minute_match.group(1)) != exp_minute:
            actual = minute_match.group(1) if minute_match else "missing"
            results.append((job_id, False, f"minute={actual} (expected {exp_minute})"))
            continue

        # Check day_of_week — may be a variable reference
        dow_match = re.search(r'day_of_week\s*=\s*(["\']?)([^"\')\s,]+)\1', trigger_args)
        if dow_match:
            dow_value = dow_match.group(2)
            # If it looks like a variable name (no commas), resolve it
            if "," not in dow_value and dow_value.isidentifier():
                var_def = re.search(rf'{dow_value}\s*=\s*["\']([^"\']+)', content)
                if var_def:
                    actual_days = set(var_def.group(1).split(","))
                else:
                    results.append((job_id, False, f"day_of_week variable '{dow_value}' not resolved"))
                    continue
            else:
                actual_days = set(dow_value.split(","))
        else:
            results.append((job_id, False, "day_of_week not found"))
            continue

        if not tadawul_days.issubset(actual_days):
            missing_days = tadawul_days - actual_days
            results.append((job_id, False, f"missing days: {missing_days}"))
            continue

        results.append((job_id, True, f"CronTrigger(hour={exp_hour}, minute={exp_minute}, days=sun-thu)"))

    # Check news_and_sentiment IntervalTrigger
    if "news_and_sentiment" in job_blocks:
        block = job_blocks["news_and_sentiment"]
        interval_match = re.search(r'IntervalTrigger\((.*?)\)', block, re.DOTALL)
        if interval_match:
            interval_args = interval_match.group(1)
            minutes_match = re.search(r'minutes\s*=\s*(\d+)', interval_args)
            if minutes_match and int(minutes_match.group(1)) == 30:
                results.append(("news_and_sentiment", True, "IntervalTrigger(minutes=30)"))
            else:
                actual = minutes_match.group(1) if minutes_match else "missing"
                results.append(("news_and_sentiment", False, f"interval minutes={actual} (expected 30)"))
        else:
            results.append(("news_and_sentiment", False, "IntervalTrigger not found in block"))
    else:
        results.append(("news_and_sentiment", False, 'id="news_and_sentiment" not found'))

    return results


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    """Run all pipeline verification checks and print results."""
    print("=" * 80)
    print("  Nabeeh Pipeline Verification Report")
    print(f"  Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print("=" * 80)
    print()

    # ---- Get active stocks ----
    stocks_result = (
        client.table("stocks")
        .select("id, symbol, name_en")
        .eq("is_active", True)
        .order("symbol")
        .execute()
    )
    stocks = stocks_result.data or []

    if not stocks:
        print("ERROR: No active stocks found in database.")
        return 1

    print(f"Active stocks: {len(stocks)}")
    print()

    # ---- Pipeline data checks ----
    checks = [
        ("Prices", check_prices),
        ("Stats", check_stats),
        ("Risk", check_risk),
        ("MC", check_monte_carlo),
        ("Pivots", check_pivots),
        ("News", check_news),
        ("Sentiment", check_sentiment),
    ]

    header_labels = [c[0] for c in checks]

    # Column widths
    sym_w = 8
    col_w = 10

    # Print header
    header = f"{'Stock':<{sym_w}}"
    for label in header_labels:
        header += f" | {label:^{col_w}}"
    print(header)
    print("-" * len(header))

    total_pass = 0
    total_checks = 0
    stock_pass_counts: dict[str, int] = {}
    all_details: list[tuple[str, str, bool, str]] = []

    for stock in stocks:
        stock_id = stock["id"]
        symbol = stock["symbol"]
        row = f"{symbol:<{sym_w}}"
        passes = 0

        for label, check_fn in checks:
            total_checks += 1
            try:
                passed, detail = check_fn(stock_id)
            except Exception as e:
                passed, detail = False, f"error: {e}"

            status = "PASS" if passed else "FAIL"
            row += f" | {status:^{col_w}}"

            if passed:
                passes += 1
                total_pass += 1

            all_details.append((symbol, label, passed, detail))

        stock_pass_counts[symbol] = passes
        print(row)

    total_possible = len(stocks) * len(checks)
    fully_complete = sum(1 for v in stock_pass_counts.values() if v == len(checks))

    print()
    print(f"Summary: {fully_complete}/{len(stocks)} stocks fully complete. "
          f"{total_pass} checks passed out of {total_possible}.")
    print()

    # ---- Show details for failures ----
    failures = [(s, l, d) for s, l, passed, d in all_details if not passed]
    if failures:
        print("--- Failure Details ---")
        for sym, label, detail in failures:
            print(f"  {sym} / {label}: {detail}")
        print()

    # ---- Cron schedule verification (AUTO-02) ----
    print("=" * 80)
    print("  Cron Schedule Verification (AUTO-02)")
    print("=" * 80)
    print()

    cron_results = verify_cron_schedule()
    cron_all_pass = True
    for job_id, passed, detail in cron_results:
        status = "PASS" if passed else "FAIL"
        print(f"  [{status}] {job_id}: {detail}")
        if not passed:
            cron_all_pass = False

    print()
    cron_status = "ALL PASS" if cron_all_pass else "SOME FAILED"
    print(f"Cron schedule: {cron_status}")
    print()

    # ---- Final verdict ----
    all_pass = (total_pass == total_possible) and cron_all_pass
    print("=" * 80)
    if all_pass:
        print("  RESULT: ALL CHECKS PASSED")
    else:
        print("  RESULT: SOME CHECKS FAILED")
    print("=" * 80)

    return 0 if all_pass else 1


if __name__ == "__main__":
    sys.exit(main())
