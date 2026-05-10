"""
UN01 — Search Module
Verify the user can search for a stock by symbol or company name.
Related FR: Sys-FR1
"""

STOCKS = [
    {"ticker": "2222.SR", "name_ar": "أرامكو السعودية", "name_en": "Saudi Aramco"},
    {"ticker": "1120.SR", "name_ar": "مصرف الراجحي", "name_en": "Al Rajhi Bank"},
    {"ticker": "7010.SR", "name_ar": "الاتصالات السعودية", "name_en": "STC"},
    {"ticker": "2010.SR", "name_ar": "سابك", "name_en": "SABIC"},
]


def search_stock(query: str):
    if not query:
        return STOCKS
    q = query.strip().lower()
    return [
        s for s in STOCKS
        if q in s["ticker"].lower()
        or q in s["name_ar"]
        or q in s["name_en"].lower()
    ]


def test_un01_search_by_arabic_name():
    result = search_stock("أرامكو")
    assert len(result) == 1
    assert result[0]["ticker"] == "2222.SR"
