"""Seed 10 top Tadawul stocks into the stocks table.

Usage:
    cd <project-root>
    python scripts/seed_stocks.py

Requires SUPABASE_URL and SUPABASE_SERVICE_KEY in backend/.env.
Idempotent: uses upsert on symbol conflict.
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

# Load environment variables from backend/.env
_env_path = Path(__file__).resolve().parent.parent / "backend" / ".env"
load_dotenv(_env_path)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in backend/.env")
    sys.exit(1)


# ---------------------------------------------------------------------------
# 10 Top Tadawul Stocks by Market Cap (validated 2026-02-24)
# Original 4 (Aramco, Al Rajhi, SABIC, STC) + 6 new
# ---------------------------------------------------------------------------

STOCKS: list[dict] = [
    # 1. Energy (original)
    {"symbol": "2222", "name_ar": "أرامكو السعودية", "name_en": "Saudi Aramco",
     "sector_ar": "الطاقة", "sector_en": "Energy", "currency": "SAR", "is_active": True},
    # 2. Banking (original)
    {"symbol": "1120", "name_ar": "مصرف الراجحي", "name_en": "Al Rajhi Bank",
     "sector_ar": "البنوك", "sector_en": "Banking", "currency": "SAR", "is_active": True},
    # 3. Mining (new)
    {"symbol": "1211", "name_ar": "معادن", "name_en": "Ma'aden",
     "sector_ar": "التعدين", "sector_en": "Mining", "currency": "SAR", "is_active": True},
    # 4. Banking (new)
    {"symbol": "1180", "name_ar": "البنك الأهلي السعودي", "name_en": "Saudi National Bank",
     "sector_ar": "البنوك", "sector_en": "Banking", "currency": "SAR", "is_active": True},
    # 5. Telecom (original)
    {"symbol": "7010", "name_ar": "الاتصالات السعودية", "name_en": "STC",
     "sector_ar": "الاتصالات", "sector_en": "Telecom", "currency": "SAR", "is_active": True},
    # 6. Petrochemicals (original)
    {"symbol": "2010", "name_ar": "سابك", "name_en": "SABIC",
     "sector_ar": "البتروكيماويات", "sector_en": "Petrochemicals", "currency": "SAR", "is_active": True},
    # 7. Utilities (new)
    {"symbol": "2082", "name_ar": "أكوا باور", "name_en": "ACWA Power",
     "sector_ar": "المرافق العامة", "sector_en": "Utilities", "currency": "SAR", "is_active": True},
    # 8. Banking (new)
    {"symbol": "1010", "name_ar": "بنك الرياض", "name_en": "Riyad Bank",
     "sector_ar": "البنوك", "sector_en": "Banking", "currency": "SAR", "is_active": True},
    # 9. Healthcare (new)
    {"symbol": "4013", "name_ar": "مجموعة سليمان الحبيب", "name_en": "Dr. Sulaiman Al Habib",
     "sector_ar": "الرعاية الصحية", "sector_en": "Healthcare", "currency": "SAR", "is_active": True},
    # 10. Banking (new)
    {"symbol": "1060", "name_ar": "البنك الأول", "name_en": "Saudi Awwal Bank (SABB)",
     "sector_ar": "البنوك", "sector_en": "Banking", "currency": "SAR", "is_active": True},
]

# Symbols that were previously seeded but should be deactivated
DEACTIVATE_SYMBOLS = [
    "1150", "2020", "5110", "7203", "7020", "1050", "1080", "2280",
    "1140", "4280", "4030", "8210", "4325", "7202", "4300", "8010",
    "2382", "4142", "4250", "6015", "1111", "1030", "4190", "4100",
    "1303", "2223", "1020", "2380", "2290", "4263", "4002", "4164",
    "4200", "4004", "2310", "1212", "7030", "8313", "4264", "4072",
]


def seed_stocks() -> None:
    """Upsert 10 Tadawul stocks into the stocks table and deactivate the rest."""
    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    print(f"Seeding {len(STOCKS)} stocks into Supabase...")
    result = client.table("stocks").upsert(
        STOCKS, on_conflict="symbol"
    ).execute()

    upserted = len(result.data) if result.data else 0
    print(f"Upserted {upserted} stocks.")

    # Deactivate previously seeded stocks that are not in the top 10
    if DEACTIVATE_SYMBOLS:
        deactivate_result = (
            client.table("stocks")
            .update({"is_active": False})
            .in_("symbol", DEACTIVATE_SYMBOLS)
            .execute()
        )
        deactivated = len(deactivate_result.data) if deactivate_result.data else 0
        print(f"Deactivated {deactivated} stocks.")

    # Verify count
    count_result = (
        client.table("stocks")
        .select("symbol", count="exact")
        .eq("is_active", True)
        .execute()
    )
    total = count_result.count if count_result.count is not None else len(count_result.data or [])
    print(f"Total active stocks in DB: {total}")

    if total == 10:
        print("SUCCESS: All 10 stocks seeded.")
    else:
        print(f"WARNING: Expected 10 active stocks, got {total}.")


if __name__ == "__main__":
    seed_stocks()
