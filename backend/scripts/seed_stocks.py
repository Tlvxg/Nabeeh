#!/usr/bin/env python3
"""Seed the stocks table with the 4 covered Tadawul stocks.

Idempotent: safe to run multiple times. Existing rows are updated by symbol.

Usage:
    SUPABASE_URL=... SUPABASE_SERVICE_KEY=... python scripts/seed_stocks.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from supabase import create_client


STOCKS = [
    {
        "symbol": "2222",
        "name_ar": "أرامكو السعودية",
        "name_en": "Saudi Aramco",
        "sector_ar": "الطاقة",
        "sector_en": "Energy",
        "currency": "SAR",
        "is_active": True,
    },
    {
        "symbol": "2010",
        "name_ar": "سابك",
        "name_en": "SABIC",
        "sector_ar": "المواد الأساسية",
        "sector_en": "Materials",
        "currency": "SAR",
        "is_active": True,
    },
    {
        "symbol": "1120",
        "name_ar": "مصرف الراجحي",
        "name_en": "Al Rajhi Bank",
        "sector_ar": "البنوك",
        "sector_en": "Banking",
        "currency": "SAR",
        "is_active": True,
    },
    {
        "symbol": "7010",
        "name_ar": "الاتصالات السعودية",
        "name_en": "STC",
        "sector_ar": "الاتصالات",
        "sector_en": "Telecom",
        "currency": "SAR",
        "is_active": True,
    },
]


def seed_stocks() -> None:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")

    if not url or not key:
        print("Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
        print("  export SUPABASE_URL=https://your-project.supabase.co")
        print("  export SUPABASE_SERVICE_KEY=your-service-role-key")
        sys.exit(1)

    client = create_client(url, key)

    result = (
        client.table("stocks")
        .upsert(STOCKS, on_conflict="symbol")
        .execute()
    )

    if result.data:
        print(f"Seeded {len(result.data)} stocks:")
        for row in result.data:
            print(f"  {row['symbol']}  {row['name_en']}")
    else:
        print("Upsert returned no rows (already current)")


if __name__ == "__main__":
    seed_stocks()
