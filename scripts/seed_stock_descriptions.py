"""Seed Arabic company descriptions for the 10 active Tadawul stocks.

Usage:
    cd <project-root>
    python scripts/seed_stock_descriptions.py

Requires SUPABASE_URL and SUPABASE_SERVICE_KEY in backend/.env.
Requires the description_ar / description_en columns to already exist
(run the DDL in Supabase SQL Editor first — see Phase 58-01).

Idempotent: UPDATEs overwrite existing description_ar values.
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

_env_path = Path(__file__).resolve().parent.parent / "backend" / ".env"
load_dotenv(_env_path)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in backend/.env")
    sys.exit(1)


# ---------------------------------------------------------------------------
# Real Arabic company descriptions for the 10 active Tadawul stocks
# (Phase 58 — INFO-02)
# ---------------------------------------------------------------------------

DESCRIPTIONS: dict[str, str] = {
    "2222": (
        "شركة الزيت العربية السعودية (أرامكو) هي أكبر شركة نفط متكاملة في العالم "
        "من حيث الإنتاج والاحتياطيات المؤكدة. تأسست عام ١٩٣٣ ومقرها الظهران، "
        "وتوفر النفط الخام والغاز الطبيعي والمنتجات البتروكيماوية لأسواق العالم، "
        "وتلعب دوراً محورياً في الاقتصاد السعودي."
    ),
    "1120": (
        "أكبر بنك إسلامي في العالم من حيث القيمة السوقية، تأسس عام ١٩٥٧ ومقره الرياض. "
        "يقدم خدمات مصرفية متكاملة للأفراد والشركات وفق أحكام الشريعة الإسلامية، "
        "ويمتلك شبكة فروع واسعة ومحفظة تمويلية من الأكبر في المنطقة."
    ),
    "1211": (
        "شركة التعدين العربية السعودية، الرائدة في قطاع التعدين بالمملكة. "
        "تنتج الذهب والفوسفات والألومنيوم والنحاس، وتُعدّ ركيزة أساسية "
        "لاستراتيجية التنويع الاقتصادي ضمن رؤية المملكة ٢٠٣٠."
    ),
    "1180": (
        "أكبر بنك في المملكة العربية السعودية من حيث الأصول، نتج عن اندماج "
        "البنك الأهلي التجاري مع مجموعة سامبا المالية عام ٢٠٢١. "
        "يقدم خدمات مصرفية شاملة للأفراد والشركات والجهات الحكومية، "
        "ويمتلك حضوراً إقليمياً قوياً."
    ),
    "7010": (
        "شركة الاتصالات السعودية (stc) هي المشغل الرائد لخدمات الاتصالات في المنطقة. "
        "تقدم خدمات الجوال والإنترنت والحلول الرقمية والترفيه الرقمي، "
        "ولها حضور توسعي في عدة دول بالشرق الأوسط وشمال أفريقيا."
    ),
    "2010": (
        "الشركة السعودية للصناعات الأساسية، إحدى أكبر شركات البتروكيماويات في العالم. "
        "تنتج المواد البلاستيكية والأسمدة والكيماويات المتخصصة والمعادن، "
        "وتوزع منتجاتها على أكثر من ١٤٠ دولة حول العالم."
    ),
    "2082": (
        "شركة سعودية رائدة في تطوير وتشغيل محطات توليد الكهرباء ومحطات تحلية المياه. "
        "تدير مشاريع في أكثر من ١٢ دولة، وتركز على الطاقة النظيفة والمتجددة "
        "كجزء من تحولات قطاع الطاقة ضمن رؤية المملكة ٢٠٣٠."
    ),
    "1010": (
        "أحد أقدم البنوك السعودية وأكبرها، تأسس عام ١٩٥٧. "
        "يقدم خدمات مصرفية متكاملة للأفراد والشركات، "
        "ويتميز بخدماته في تمويل المشاريع الكبرى والخدمات الاستثمارية والتجزئة المصرفية."
    ),
    "4013": (
        "مجموعة الدكتور سليمان الحبيب الطبية، أكبر مقدّم للرعاية الصحية في القطاع الخاص بالمملكة. "
        "تدير شبكة واسعة من المستشفيات والمراكز الطبية المتخصصة في المملكة ودول الخليج، "
        "وتشتهر بمستوى خدماتها الطبية المتطورة."
    ),
    "1060": (
        "البنك الأول (SABB) أحد أكبر البنوك التجارية في المملكة، "
        "نتج عن اندماج ساب مع بنك الأول عام ٢٠١٩. "
        "يقدم خدمات مصرفية شاملة للأفراد والشركات، "
        "ويتميز بخبرته في التجارة الدولية وخدمات الثروات."
    ),
}


def seed_descriptions() -> None:
    """Update description_ar for all 10 active Tadawul stocks."""
    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    print(f"Seeding descriptions for {len(DESCRIPTIONS)} stocks...")

    updated = 0
    missing = []

    for symbol, description in DESCRIPTIONS.items():
        result = (
            client.table("stocks")
            .update({"description_ar": description})
            .eq("symbol", symbol)
            .execute()
        )
        if result.data:
            updated += 1
            print(f"  [OK]   {symbol} — {description[:45]}...")
        else:
            missing.append(symbol)
            print(f"  [SKIP] {symbol} — not found in stocks table")

    print()
    print(f"Updated {updated}/{len(DESCRIPTIONS)} stocks.")
    if missing:
        print(f"WARNING: Symbols not found: {missing}")

    # Verify: fetch all active stocks with non-null descriptions
    verify = (
        client.table("stocks")
        .select("symbol, description_ar")
        .eq("is_active", True)
        .not_.is_("description_ar", "null")
        .execute()
    )
    seeded_count = len(verify.data or [])
    print(f"Verification: {seeded_count} active stocks now have description_ar set.")

    if seeded_count == 10:
        print("SUCCESS: All 10 active stocks have Arabic descriptions.")
    else:
        print(f"WARNING: Expected 10, got {seeded_count}.")


if __name__ == "__main__":
    seed_descriptions()
