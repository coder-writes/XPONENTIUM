"""
fetcher.py — RSS ingestion: parse feeds, normalise articles, scrape full bodies.

Responsibilities
────────────────
1. Parse each RSS/Atom feed with feedparser (handles most quirks automatically).
2. Normalise every entry into a canonical ArticleDict regardless of which field
   names the feed uses (<description> / <content:encoded> / <summary>, etc.).
3. For each article attempt to scrape the full body text from the article URL
   using trafilatura first, then newspaper3k, then raw BeautifulSoup — if all
   three fail the summary is used as a fallback (never crash the whole run).
4. Persist new articles to SQLite; skip duplicates silently.

Normalisation decisions
───────────────────────
• pubDate, published, updated, dc:date — we try each in order and parse with
  dateutil so every outlet's date quirk is handled.
• The canonical body is stored truncated to MAX_ARTICLE_BODY_LEN characters to
  keep the database size sensible.
"""

import hashlib
import logging
import re
import time
from datetime import datetime, timezone
from typing import Any, TypedDict

import feedparser
import requests
from bs4 import BeautifulSoup

# trafilatura is optional — it requires lxml which may not be available
try:
    import trafilatura as _trafilatura
except ImportError:
    _trafilatura = None  # type: ignore
from dateutil import parser as dateutil_parser

from config import MAX_ARTICLE_BODY_LEN, REQUEST_TIMEOUT, RSS_FEEDS
from database import insert_article

log = logging.getLogger(__name__)

# User-agent that mimics a normal browser — some outlets block Python's default UA.
_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)
_HEADERS = {"User-Agent": _UA}


# ─── Type alias ───────────────────────────────────────────────────────────────

class ArticleDict(TypedDict, total=False):
    url:          str
    source:       str
    title:        str
    summary:      str
    body:         str
    published_at: str   # ISO-8601 UTC or None
    keywords:     list[str]


# ─── Date normalisation ────────────────────────────────────────────────────────

def _parse_date(entry: Any) -> str | None:
    """
    Try multiple feedparser date fields, return an ISO-8601 UTC string or None.
    feedparser may already provide a parsed 9-tuple in *_parsed fields.
    """
    candidates = [
        entry.get("published"),
        entry.get("updated"),
        entry.get("created"),
        entry.get("dc_date"),
    ]

    # feedparser also provides pre-parsed tuples
    for attr in ("published_parsed", "updated_parsed", "created_parsed"):
        parsed = entry.get(attr)
        if parsed:
            try:
                dt = datetime(*parsed[:6], tzinfo=timezone.utc)
                return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
            except Exception:
                pass

    for raw in candidates:
        if not raw:
            continue
        try:
            dt = dateutil_parser.parse(str(raw))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        except Exception:
            pass

    return None


# ─── Summary extraction ────────────────────────────────────────────────────────

def _get_summary(entry: Any) -> str:
    """
    Extract a plain-text summary from a feedparser entry.
    Tries content:encoded first (richer), then summary/description.
    Strips HTML tags so the summary is clean text.
    """
    raw = ""

    # content:encoded — some feeds (e.g. WordPress) put the full body here
    if entry.get("content"):
        raw = entry["content"][0].get("value", "") or ""
    if not raw:
        raw = entry.get("summary", "") or entry.get("description", "") or ""

    # strip HTML
    soup = BeautifulSoup(raw, "html.parser")
    return soup.get_text(separator=" ", strip=True)[:1500]


# ─── Full-body scraping ───────────────────────────────────────────────────────

def _scrape_body(url: str) -> str:
    """
    Attempt to extract the main body text from *url*.

    Strategy (in order):
    1. trafilatura — fast, very good at article extraction
    2. newspaper3k — good fallback for many news sites
    3. BeautifulSoup heuristic — grabs <article> or biggest <p> block
    4. Return empty string on total failure (caller uses summary instead)
    """
    try:
        resp = requests.get(url, headers=_HEADERS, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        html = resp.text
    except Exception as exc:
        log.debug("HTTP error fetching %s: %s", url, exc)
        return ""

    # 1 — trafilatura (optional, requires lxml)
    if _trafilatura is not None:
        try:
            text = _trafilatura.extract(html, include_comments=False, include_tables=False)
            if text and len(text) > 200:
                return text[:MAX_ARTICLE_BODY_LEN]
        except Exception as exc:
            log.debug("trafilatura failed on %s: %s", url, exc)

    # 2 — newspaper3k  (lazy import so missing install is non-fatal)
    try:
        from newspaper import Article as NpArticle  # type: ignore
        art = NpArticle(url)
        art.download(input_html=html)
        art.parse()
        if art.text and len(art.text) > 200:
            return art.text[:MAX_ARTICLE_BODY_LEN]
    except Exception as exc:
        log.debug("newspaper3k failed on %s: %s", url, exc)

    # 3 — BeautifulSoup heuristic
    try:
        soup = BeautifulSoup(html, "html.parser")
        # Try semantic article tag first
        article_tag = soup.find("article")
        if article_tag:
            return article_tag.get_text(separator=" ", strip=True)[:MAX_ARTICLE_BODY_LEN]
        # Fallback: concatenate all <p> tags
        paragraphs = [p.get_text(strip=True) for p in soup.find_all("p") if len(p.get_text(strip=True)) > 60]
        if paragraphs:
            return " ".join(paragraphs)[:MAX_ARTICLE_BODY_LEN]
    except Exception as exc:
        log.debug("BeautifulSoup heuristic failed on %s: %s", url, exc)

    return ""


# ─── Feed parsing ─────────────────────────────────────────────────────────────

def _parse_feed(feed_cfg: dict) -> list[ArticleDict]:
    """
    Download and parse one RSS/Atom feed; return a list of normalised ArticleDicts.
    Never raises — exceptions are logged and an empty list is returned.
    """
    name = feed_cfg["name"]
    url  = feed_cfg["url"]
    log.info("Fetching feed: %s (%s)", name, url)

    try:
        parsed = feedparser.parse(url, agent=_UA, request_headers=_HEADERS)
    except Exception as exc:
        log.error("feedparser crashed on %s: %s", url, exc)
        return []

    if parsed.bozo and not parsed.entries:
        log.warning("Feed %s is malformed and returned no entries.", name)
        return []

    articles: list[ArticleDict] = []
    for entry in parsed.entries:
        # ── URL ──────────────────────────────────────────────────────────────
        article_url = entry.get("link") or entry.get("id") or ""
        if not article_url or not article_url.startswith("http"):
            continue   # no usable URL — skip

        # ── Title ─────────────────────────────────────────────────────────────
        title = entry.get("title", "").strip()

        # ── Summary ───────────────────────────────────────────────────────────
        summary = _get_summary(entry)

        # ── Published date ────────────────────────────────────────────────────
        published_at = _parse_date(entry)

        articles.append(
            ArticleDict(
                url=article_url,
                source=name,
                title=title,
                summary=summary,
                body="",          # filled in later during scraping step
                published_at=published_at,
                keywords=[],      # filled in by the grouper
            )
        )

    log.info("  → parsed %d entries from %s", len(articles), name)
    return articles


# ─── Public API ───────────────────────────────────────────────────────────────

def run_ingestion(scrape_body: bool = True) -> int:
    """
    Pull all configured RSS feeds, scrape article bodies, and persist to DB.

    Parameters
    ----------
    scrape_body : bool
        If True (default), attempt to fetch and extract the full body text for
        each article.  Set to False for a faster "headlines-only" run.

    Returns
    -------
    int
        Number of *new* articles added (duplicates are silently ignored).
    """
    new_count = 0

    for feed_cfg in RSS_FEEDS:
        articles = _parse_feed(feed_cfg)

        for art in articles:
            # Full-body scraping (best-effort, never crashes the loop)
            if scrape_body and art["url"]:
                body = _scrape_body(art["url"])
                art["body"] = body if body else art["summary"]
                # Polite delay so we don't hammer publishers
                time.sleep(0.5)
            else:
                art["body"] = art["summary"]

            row_id = insert_article(art)
            if row_id is not None:
                new_count += 1
                log.debug("  + saved article id=%d: %s", row_id, art["title"][:60])

    log.info("Ingestion complete. %d new articles saved.", new_count)
    return new_count
