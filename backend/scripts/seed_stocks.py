#!/usr/bin/env python3
"""Seed the stocks table with Aramco data."""

import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from supabase import create_client


def seed_stocks():
    """Insert Aramco into the stocks table."""
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")

    if not url or not key:
        print("Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
        print("  export SUPABASE_URL=https://your-project.supabase.co")
        print("  export SUPABASE_SERVICE_KEY=your-service-role-key")
        sys.exit(1)

    client = create_client(url, key)

    # Seed Aramco
    aramco = {
        "symbol": "2222",
        "name_ar": "أرامكو السعودية",
        "name_en": "Saudi Aramco",
        "sector_ar": "الطاقة",
        "sector_en": "Energy",
        "currency": "SAR",
        "is_active": True,
    }

    result = (
        client.table("stocks")
        .upsert(aramco, on_conflict="symbol")
        .execute()
    )

    if result.data:
        print(f"Seeded stock: {result.data[0]['name_en']} ({result.data[0]['symbol']})")
    else:
        print("Seed operation completed (may already exist)")


if __name__ == "__main__":
    seed_stocks()
