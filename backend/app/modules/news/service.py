"""Business logic for the news module - fetching from Argaam RSS and GNews API."""

import asyncio
import html
import logging
import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import httpx

from app.config import settings
from app.database import get_supabase, get_supabase_service
from app.modules.news import repository
from app.modules.news.schemas import NewsFetchResult, NewsFetchSummary

logger = logging.getLogger(__name__)

# Argaam RSS feed URLs (general Saudi market news)
ARGAAM_FEEDS = [
    "https://www.argaam.com/ar/rss/ho-main-news?sectionid=1523",  # Latest News
    "https://www.argaam.com/ar/rss/ho-market-pulse?sectionid=70",  # Market Pulse
    "https://www.argaam.com/ar/rss/companies?sectionid=1543",  # Companies
    "https://www.argaam.com/ar/rss/articles?sectionid=501",  # Analysis & Reports
    "https://www.argaam.com/ar/rss/articles?sectionid=10",  # Petrochemicals & Industry
]

# Company-specific RSS feeds — directly from the company's IR/news page
# These are 100% about the company, so all articles get stock_id automatically.
# Note: Al Rajhi & STC feeds have malformed XML — removed until fixed upstream.
COMPANY_FEEDS: dict[str, list[str]] = {
    "2222": [
        "https://www.aramco.com/api/v1/com/rss/news?sc_lang=ar",  # Aramco Arabic news (50+ articles)
    ],
}

# Argaam company-specific news pages — entity IDs mapped to Tadawul symbols.
# URL pattern: /ar/article/entityarticles/sectionid/{SID}/entityid/4/{ENTITY_ID}/pageno/1
# Arabic section IDs: 1523 (Latest News), 1543 (Companies), 70 (Market Pulse)
# English 205 — DO NOT USE (returns English headlines).
ARGAAM_ENTITY_IDS: dict[str, int] = {
    "2222": 3509,   # Saudi Aramco
    "2010": 77,     # SABIC
    "1120": 3413,   # Al Rajhi Bank
    "7010": 30,     # STC
}
ARGAAM_AR_SECTIONS: list[int] = [1523, 1543, 70]  # Arabic-only section IDs

# GNews API endpoints
GNEWS_HEADLINES_URL = "https://gnews.io/api/v4/top-headlines"
GNEWS_SEARCH_URL = "https://gnews.io/api/v4/search"

# Stock-specific search queries for GNews (top stocks by market cap)
# GNews free API has limited queries, so only the most important stocks
GNEWS_STOCK_QUERIES: dict[str, str] = {
    "2222": "أرامكو",
    "1120": "الراجحي",
    "2010": "سابك",
    "7010": "الاتصالات السعودية",
}

# Stock keywords for matching headlines to stocks
# Maps keyword -> stock symbol (Tadawul symbol without .SR suffix)
#
# ONLY direct mentions of the company — general market/oil/TASI news
# is NOT specific to any single stock and should remain unmatched.
# Rules: Use UNIQUE part of company name. Avoid generic terms like
# "البنك" (bank), "شركة" (company), "بتروكيماويات" (petrochemicals).
STOCK_KEYWORDS: dict[str, str] = {
    # 2222 - Aramco
    "أرامكو": "2222", "ارامكو": "2222", "aramco": "2222",
    # 1120 - Al Rajhi Bank
    "الراجحي": "1120", "مصرف الراجحي": "1120", "rajhi": "1120",
    # 7010 - STC
    "الاتصالات السعودية": "7010", "stc": "7010", "اس تي سي": "7010",
    # 2010 - SABIC
    "سابك": "2010", "sabic": "2010",
}

# HTML tag stripping regex
_HTML_TAG_RE = re.compile(r"<[^>]+>")

# HTTP timeout for external requests (seconds)
_HTTP_TIMEOUT = 15.0


def _strip_html(text: str | None) -> str | None:
    """Strip HTML tags from text and decode HTML entities."""
    if not text:
        return text
    cleaned = _HTML_TAG_RE.sub("", text)
    cleaned = html.unescape(cleaned)
    return cleaned.strip() or None


def _parse_rfc2822_date(date_str: str) -> str:
    """
    Convert RFC 2822 date to ISO 8601 datetime string.

    Example: "Sat, 07 Feb 2026 15:15:00 GMT" -> "2026-02-07T15:15:00+00:00"
    """
    try:
        dt = parsedate_to_datetime(date_str)
        # Ensure timezone-aware (assume UTC if naive)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    except Exception:
        # Fallback: return current time if parsing fails
        return datetime.now(timezone.utc).isoformat()


# Cache: symbol -> stock_id (avoids repeated DB lookups)
_symbol_id_cache: dict[str, int] = {}


def _resolve_stock_id(symbol: str) -> int | None:
    """Resolve a Tadawul symbol to its database stock_id, with caching.

    Only resolves active stocks (is_active=true). Inactive stocks return None,
    so new articles won't be matched to deactivated stocks.
    """
    if symbol in _symbol_id_cache:
        return _symbol_id_cache[symbol]
    client = get_supabase()
    result = (
        client.table("stocks")
        .select("id")
        .eq("symbol", symbol)
        .eq("is_active", True)
        .execute()
    )
    if result.data:
        _symbol_id_cache[symbol] = result.data[0]["id"]
        return result.data[0]["id"]
    return None


def _match_stock(headline: str) -> int | None:
    """
    Match a headline to a stock by checking for known keywords.

    Only matches against the headline (title) to avoid false positives where
    a stock name appears tangentially in the article description.

    Returns stock_id from the database if matched, None otherwise.
    """
    text_lower = headline.lower()
    for keyword, symbol in STOCK_KEYWORDS.items():
        if keyword in text_lower:
            stock_id = _resolve_stock_id(symbol)
            if stock_id is not None:
                return stock_id
    return None


async def fetch_argaam_news() -> tuple[list[dict], list[str]]:
    """
    Fetch news articles from Argaam RSS feeds.

    Returns:
        tuple of (articles list, errors list)
    """
    articles: list[dict] = []
    errors: list[str] = []

    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        for feed_url in ARGAAM_FEEDS:
            try:
                response = await client.get(feed_url)
                response.raise_for_status()

                # Parse XML
                root = ET.fromstring(response.text)

                # RSS feeds have structure: <rss><channel><item>...</item></channel></rss>
                channel = root.find("channel")
                if channel is None:
                    errors.append(f"No <channel> in {feed_url}")
                    continue

                for item in channel.findall("item"):
                    title = item.findtext("title", "").strip()
                    if not title:
                        continue

                    description = _strip_html(item.findtext("description", ""))
                    link = item.findtext("link", "")
                    pub_date_str = item.findtext("pubDate", "")

                    published_at = (
                        _parse_rfc2822_date(pub_date_str)
                        if pub_date_str
                        else datetime.now(timezone.utc).isoformat()
                    )

                    stock_id = _match_stock(title)

                    articles.append(
                        {
                            "source": "argaam",
                            "headline_ar": title,
                            "snippet_ar": description,
                            "source_url": link or None,
                            "published_at": published_at,
                            "stock_id": stock_id,
                            "is_analyzed": False,
                        }
                    )

            except httpx.HTTPStatusError as e:
                errors.append(f"Argaam HTTP {e.response.status_code}: {feed_url}")
                logger.warning("Argaam RSS fetch failed: %s -> %s", feed_url, e)
            except httpx.RequestError as e:
                errors.append(f"Argaam request error: {feed_url} - {e}")
                logger.warning("Argaam RSS request error: %s -> %s", feed_url, e)
            except ET.ParseError as e:
                errors.append(f"Argaam XML parse error: {feed_url} - {e}")
                logger.warning("Argaam XML parse error: %s -> %s", feed_url, e)

    return articles, errors


async def fetch_company_feeds() -> tuple[list[dict], list[str]]:
    """
    Fetch news directly from company IR/news RSS feeds.

    Every article from a company feed is automatically matched to that stock.
    Returns:
        tuple of (articles list, errors list)
    """
    articles: list[dict] = []
    errors: list[str] = []

    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT, follow_redirects=True) as client:
        for symbol, feeds in COMPANY_FEEDS.items():
            stock_id = _resolve_stock_id(symbol)
            for feed_url in feeds:
                try:
                    response = await client.get(feed_url)
                    response.raise_for_status()

                    root = ET.fromstring(response.text)
                    channel = root.find("channel")
                    if channel is None:
                        errors.append(f"No <channel> in company feed: {feed_url}")
                        continue

                    for item in channel.findall("item"):
                        title = item.findtext("title", "").strip()
                        if not title:
                            continue

                        description = _strip_html(item.findtext("description", ""))
                        link = item.findtext("link", "")
                        pub_date_str = item.findtext("pubDate", "")

                        published_at = (
                            _parse_rfc2822_date(pub_date_str)
                            if pub_date_str
                            else datetime.now(timezone.utc).isoformat()
                        )

                        articles.append(
                            {
                                "source": symbol,
                                "headline_ar": title,
                                "snippet_ar": description,
                                "source_url": link or None,
                                "published_at": published_at,
                                "stock_id": stock_id,
                                "is_analyzed": False,
                            }
                        )

                except httpx.HTTPStatusError as e:
                    errors.append(f"Company feed HTTP {e.response.status_code}: {feed_url}")
                    logger.warning("Company feed fetch failed: %s -> %s", feed_url, e)
                except httpx.RequestError as e:
                    errors.append(f"Company feed request error: {feed_url} - {e}")
                    logger.warning("Company feed request error: %s -> %s", feed_url, e)
                except ET.ParseError as e:
                    errors.append(f"Company feed XML parse error: {feed_url} - {e}")
                    logger.warning("Company feed XML parse error: %s -> %s", feed_url, e)

    logger.info("Company feeds: fetched %d articles", len(articles))
    return articles, errors


# Regex for extracting articles from Argaam entity pages
_ARGAAM_ARTICLE_RE = re.compile(
    r'<a[^>]*href="(?:/ar)?/article/articledetail/id/(\d+)"[^>]*>(.*?)</a>',
    re.DOTALL,
)
_ARGAAM_DATE_RE = re.compile(r"(\d{4}/\d{2}/\d{2})")

# Regex to extract first meaningful paragraph from Argaam article detail pages
_ARGAAM_BODY_RE = re.compile(
    r'<div[^>]*class="[^"]*article-body[^"]*"[^>]*>(.*?)</div>',
    re.DOTALL,
)
_PARAGRAPH_RE = re.compile(r'<p[^>]*>(.*?)</p>', re.DOTALL)

# Max snippets to fetch per run (limits extra HTTP requests)
_MAX_SNIPPET_FETCHES = 8


async def _fetch_argaam_snippet(client: httpx.AsyncClient, article_url: str) -> str | None:
    """Fetch the first paragraph from an Argaam article detail page as a snippet."""
    try:
        resp = await client.get(article_url, headers={"User-Agent": "Mozilla/5.0"})
        resp.raise_for_status()
        page = resp.text

        # Try to find article body div first
        body_match = _ARGAAM_BODY_RE.search(page)
        search_text = body_match.group(1) if body_match else page

        # Find the first <p> with substantial text
        for p_match in _PARAGRAPH_RE.finditer(search_text):
            text = _HTML_TAG_RE.sub("", p_match.group(1)).strip()
            if len(text) > 40:
                # Truncate to ~200 chars at word boundary
                if len(text) > 200:
                    text = text[:200].rsplit(" ", 1)[0] + "..."
                return text
        return None
    except Exception:
        return None


async def fetch_argaam_company_news() -> tuple[list[dict], list[str]]:
    """
    Scrape Argaam company-specific news pages for each stock.

    Argaam's entity articles pages list ~50 recent news articles per company.
    Every article from a company page is automatically matched to that stock.

    Returns:
        tuple of (articles list, errors list)
    """
    articles: list[dict] = []
    errors: list[str] = []

    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
        for symbol, entity_id in ARGAAM_ENTITY_IDS.items():
            stock_id = _resolve_stock_id(symbol)
            # Fetch from all Arabic section IDs for each company
            for section_id in ARGAAM_AR_SECTIONS:
                url = (
                    f"https://www.argaam.com/ar/article/entityarticles"
                    f"/sectionid/{section_id}/entityid/4/{entity_id}/pageno/1"
                )
                try:
                    response = await client.get(
                        url, headers={"User-Agent": "Mozilla/5.0"}
                    )
                    response.raise_for_status()
                    html_text = response.text

                    # Extract article links and titles
                    matches = _ARGAAM_ARTICLE_RE.findall(html_text)
                    # Extract dates (appear in page in order matching articles)
                    dates = _ARGAAM_DATE_RE.findall(html_text)

                    seen_ids: set[str] = set()
                    date_idx = 0
                    for article_id, title_html in matches:
                        if article_id in seen_ids:
                            continue
                        # Clean HTML from title
                        title = _HTML_TAG_RE.sub("", title_html).strip()
                        if not title or len(title) < 5:
                            continue
                        seen_ids.add(article_id)

                        # Match date if available
                        published_at = datetime.now(timezone.utc).isoformat()
                        if date_idx < len(dates):
                            try:
                                dt = datetime.strptime(dates[date_idx], "%Y/%m/%d")
                                published_at = dt.replace(tzinfo=timezone.utc).isoformat()
                                date_idx += 1
                            except ValueError:
                                pass

                        article_url = f"https://www.argaam.com/ar/article/articledetail/id/{article_id}"
                        articles.append(
                            {
                                "source": "argaam",
                                "headline_ar": title,
                                "snippet_ar": None,
                                "source_url": article_url,
                                "published_at": published_at,
                                "stock_id": stock_id,
                                "is_analyzed": False,
                            }
                        )

                    if seen_ids:
                        logger.info(
                            "Argaam company %s sid=%d: %d articles",
                            symbol, section_id, len(seen_ids),
                        )

                except httpx.HTTPStatusError as e:
                    errors.append(f"Argaam entity {symbol} sid={section_id} HTTP {e.response.status_code}")
                except httpx.RequestError as e:
                    errors.append(f"Argaam entity {symbol} sid={section_id} request error: {e}")
                except Exception as e:
                    errors.append(f"Argaam entity {symbol} sid={section_id} parse error: {e}")
                    logger.warning("Argaam entity parse error: %s sid=%d -> %s", symbol, section_id, e)

    logger.info("Argaam company pages: fetched %d articles total", len(articles))
    return articles, errors


async def fetch_gnews() -> tuple[list[dict], list[str]]:
    """
    Fetch news articles from GNews API — both general headlines and stock-specific searches.

    Requires GNEWS_API_KEY in settings. If not set, returns empty list with warning.

    Returns:
        tuple of (articles list, errors list)
    """
    errors: list[str] = []

    api_key = settings.GNEWS_API_KEY
    if not api_key:
        logger.info("GNEWS_API_KEY not set, skipping GNews fetch")
        return [], ["GNEWS_API_KEY not configured - skipped"]

    articles: list[dict] = []

    params = {
        "category": "business",
        "lang": "ar",
        "country": "sa",
        "max": 10,
        "apikey": api_key,
    }

    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        # 1. General Saudi business headlines
        try:
            response = await client.get(GNEWS_HEADLINES_URL, params=params)
            response.raise_for_status()
            data = response.json()
            for item in data.get("articles", []):
                title = item.get("title", "").strip()
                if not title:
                    continue
                description = item.get("description", "")
                url = item.get("url", "")
                published_at_str = item.get("publishedAt", "")
                published_at = published_at_str if published_at_str else datetime.now(timezone.utc).isoformat()
                stock_id = _match_stock(title)
                articles.append({
                    "source": "gnews",
                    "headline_ar": title,
                    "snippet_ar": description or None,
                    "source_url": url or None,
                    "published_at": published_at,
                    "stock_id": stock_id,
                    "is_analyzed": False,
                })
        except Exception as e:
            errors.append(f"GNews headlines error: {e}")
            logger.warning("GNews headlines fetch failed: %s", e)

        # 2. Stock-specific searches (e.g. "أرامكو")
        for symbol, query in GNEWS_STOCK_QUERIES.items():
            stock_id = _resolve_stock_id(symbol)
            try:
                search_params = {
                    "q": query,
                    "lang": "ar",
                    "max": 10,
                    "apikey": api_key,
                }
                response = await client.get(GNEWS_SEARCH_URL, params=search_params)
                response.raise_for_status()
                data = response.json()
                for item in data.get("articles", []):
                    title = item.get("title", "").strip()
                    if not title:
                        continue
                    description = item.get("description", "")
                    url = item.get("url", "")
                    published_at_str = item.get("publishedAt", "")
                    published_at = published_at_str if published_at_str else datetime.now(timezone.utc).isoformat()
                    articles.append({
                        "source": "gnews",
                        "headline_ar": title,
                        "snippet_ar": description or None,
                        "source_url": url or None,
                        "published_at": published_at,
                        "stock_id": stock_id,
                        "is_analyzed": False,
                    })
            except Exception as e:
                errors.append(f"GNews search '{query}' error: {e}")
                logger.warning("GNews stock search failed for '%s': %s", query, e)

    return articles, errors


async def fetch_all_news() -> NewsFetchSummary:
    """
    Orchestrate fetching from all news sources concurrently.

    Calls Argaam RSS, company IR feeds, and GNews API in parallel,
    deduplicates via DB upsert, and returns a summary per source.
    """
    # Fetch from all sources concurrently
    argaam_result, company_result, argaam_co_result, gnews_result = await asyncio.gather(
        fetch_argaam_news(),
        fetch_company_feeds(),
        fetch_argaam_company_news(),
        fetch_gnews(),
    )

    argaam_articles, argaam_errors = argaam_result
    company_articles, company_errors = company_result
    argaam_co_articles, argaam_co_errors = argaam_co_result
    gnews_articles, gnews_errors = gnews_result

    results: list[NewsFetchResult] = []
    total_new = 0

    # Insert Argaam general RSS articles
    argaam_new = await repository.insert_articles(argaam_articles)
    results.append(
        NewsFetchResult(
            source="argaam",
            fetched=len(argaam_articles),
            new=argaam_new,
            errors=argaam_errors,
        )
    )
    total_new += argaam_new

    # Insert Argaam company-specific page articles
    argaam_co_new = await repository.insert_articles(argaam_co_articles)
    results.append(
        NewsFetchResult(
            source="argaam-company",
            fetched=len(argaam_co_articles),
            new=argaam_co_new,
            errors=argaam_co_errors,
        )
    )
    total_new += argaam_co_new

    # Insert company IR feed articles
    company_new = await repository.insert_articles(company_articles)
    results.append(
        NewsFetchResult(
            source="company",
            fetched=len(company_articles),
            new=company_new,
            errors=company_errors,
        )
    )
    total_new += company_new

    # Insert GNews articles
    gnews_new = await repository.insert_articles(gnews_articles)
    results.append(
        NewsFetchResult(
            source="gnews",
            fetched=len(gnews_articles),
            new=gnews_new,
            errors=gnews_errors,
        )
    )
    total_new += gnews_new

    logger.info(
        "News fetch complete: %d new articles (argaam=%d, argaam-company=%d, company=%d, gnews=%d)",
        total_new,
        argaam_new,
        argaam_co_new,
        company_new,
        gnews_new,
    )

    return NewsFetchSummary(results=results, total_new=total_new)


# ---------------------------------------------------------------------------
# Ensure-fresh: auto-fetch on page load if news is stale
# ---------------------------------------------------------------------------

# Concurrency guard with proper async lock
_fetch_lock = asyncio.Lock()
_last_fetch_time = 0.0


async def ensure_fresh_news(max_age_hours: float = 6.0) -> dict:
    """
    Check if news is fresh enough. If not, trigger fetch + sentiment pipeline.

    Returns: {"was_stale": bool, "fetched": bool, "fetch_summary": ..., "article_count": int}

    Design:
    - Idempotent: safe to call on every page load
    - Concurrency guard: prevents duplicate concurrent fetches
    - Graceful: never raises — returns whatever articles exist on failure
    """
    global _last_fetch_time

    # Check freshness
    latest_ts = await repository.get_latest_article_timestamp()
    is_stale = True

    if latest_ts:
        try:
            latest_dt = datetime.fromisoformat(latest_ts)
            # Ensure timezone-aware comparison
            if latest_dt.tzinfo is None:
                latest_dt = latest_dt.replace(tzinfo=timezone.utc)
            age_hours = (datetime.now(timezone.utc) - latest_dt).total_seconds() / 3600
            is_stale = age_hours > max_age_hours
        except (ValueError, TypeError):
            is_stale = True

    fetch_summary = None

    if is_stale and not _fetch_lock.locked():
        async with _fetch_lock:
            # Double-check: re-verify staleness after acquiring lock
            if time.time() - _last_fetch_time < 60:
                logger.info("ensure_fresh_news: skipping fetch — last fetch was <60s ago")
            else:
                try:
                    fetch_summary = await fetch_all_news()
                    _last_fetch_time = time.time()
                    # Run sentiment analysis on new articles
                    try:
                        from app.modules.sentiment import service as sentiment_service
                        await sentiment_service.analyze_unanalyzed()
                    except Exception as e:
                        logger.warning("ensure_fresh_news: sentiment analysis failed (non-critical): %s", e)
                except Exception as e:
                    logger.error("ensure_fresh_news: fetch failed (returning stale articles): %s", e)

    # Return recent articles regardless of fetch outcome
    articles = await repository.get_recent_articles(limit=20)

    return {
        "was_stale": is_stale,
        "fetched": fetch_summary is not None,
        "fetch_summary": fetch_summary,
        "article_count": len(articles),
    }


async def backfill_stock_ids() -> dict:
    """
    One-time backfill: re-check all articles with null stock_id using expanded keywords.

    Returns: {"total": int, "matched": int}
    """
    read_client = get_supabase()
    write_client = get_supabase_service()
    result = (
        read_client.table("news_articles")
        .select("id, headline_ar, snippet_ar")
        .is_("stock_id", "null")
        .execute()
    )
    articles = result.data or []
    matched = 0

    for article in articles:
        headline = article.get("headline_ar", "")
        stock_id = _match_stock(headline)
        if stock_id is not None:
            write_client.table("news_articles").update({"stock_id": stock_id}).eq("id", article["id"]).execute()
            matched += 1

    logger.info("Backfill stock_ids: %d/%d articles matched", matched, len(articles))
    return {"total": len(articles), "matched": matched}
