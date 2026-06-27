"""
database.py — PostgreSQL persistence layer for News Pulse.
"""

import json
import logging
from typing import Any

import psycopg
from psycopg.rows import dict_row

from config import DATABASE_URL

log = logging.getLogger(__name__)

# ─── DDL ──────────────────────────────────────────────────────────────────────

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS articles (
    id            SERIAL PRIMARY KEY,
    url           TEXT    NOT NULL UNIQUE,
    source        TEXT    NOT NULL,
    title         TEXT,
    summary       TEXT,
    body          TEXT,
    published_at  TEXT,
    fetched_at    TEXT    NOT NULL DEFAULT (CURRENT_TIMESTAMP::text),
    keywords      TEXT    DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS clusters (
    id            SERIAL PRIMARY KEY,
    cluster_key   TEXT    NOT NULL UNIQUE,
    label         TEXT    NOT NULL,
    article_ids   TEXT    NOT NULL DEFAULT '[]',
    created_at    TEXT    NOT NULL DEFAULT (CURRENT_TIMESTAMP::text)
);

CREATE INDEX IF NOT EXISTS idx_articles_url          ON articles(url);
CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at);
CREATE INDEX IF NOT EXISTS idx_clusters_key          ON clusters(cluster_key);
"""


# ─── Connection helper ─────────────────────────────────────────────────────────

def get_connection() -> psycopg.Connection:
    """Return a psycopg connection with row_factory set to dict_row."""
    # autocommit=True avoids holding idle transactions
    return psycopg.connect(DATABASE_URL, row_factory=dict_row, autocommit=True)


def init_db() -> None:
    """Create tables / indexes if they don't already exist."""
    with get_connection() as conn:
        conn.execute(_SCHEMA_SQL)
    log.info("Database initialised at %s", DATABASE_URL.split("@")[-1])


# ─── Articles ──────────────────────────────────────────────────────────────────

def insert_article(article: dict[str, Any]) -> int | None:
    """
    Insert one article.  Returns the new rowid, or None if already present
    (deduplication via UNIQUE url constraint).
    """
    sql = """
        INSERT INTO articles
            (url, source, title, summary, body, published_at, keywords)
        VALUES
            (%(url)s, %(source)s, %(title)s, %(summary)s, %(body)s, %(published_at)s, %(keywords)s)
        ON CONFLICT (url) DO NOTHING
        RETURNING id
    """
    row = dict(article)
    row["keywords"] = json.dumps(row.get("keywords", []))

    with get_connection() as conn:
        cur = conn.execute(sql, row)
        res = cur.fetchone()
        if res:
            return res["id"]
    return None   # duplicate


def fetch_all_articles() -> list[dict]:
    """Return every article as a plain dict (keywords de-serialised)."""
    sql = "SELECT * FROM articles ORDER BY published_at DESC NULLS LAST"
    with get_connection() as conn:
        rows = conn.execute(sql).fetchall()
    articles = []
    for r in rows:
        d = dict(r)
        if isinstance(d["keywords"], str):
            d["keywords"] = json.loads(d["keywords"] or "[]")
        articles.append(d)
    return articles


def fetch_articles_since(iso_ts: str) -> list[dict]:
    """Articles published after *iso_ts* (ISO-8601 string)."""
    sql = """
        SELECT * FROM articles
        WHERE published_at > %s
        ORDER BY published_at DESC
    """
    with get_connection() as conn:
        rows = conn.execute(sql, [iso_ts]).fetchall()
    articles = []
    for r in rows:
        d = dict(r)
        if isinstance(d["keywords"], str):
            d["keywords"] = json.loads(d["keywords"] or "[]")
        articles.append(d)
    return articles


# ─── Clusters ─────────────────────────────────────────────────────────────────

def replace_clusters(clusters: list[dict[str, Any]]) -> None:
    """
    Atomically drop all existing cluster rows and insert the new set.
    Each cluster dict must have: cluster_key, label, article_ids (list[int]).
    """
    with get_connection() as conn:
        with conn.transaction():
            conn.execute("DELETE FROM clusters")
            
            # Using executemany for bulk insert
            sql = """
                INSERT INTO clusters (cluster_key, label, article_ids)
                VALUES (%(cluster_key)s, %(label)s, %(article_ids)s)
            """
            params = [
                {
                    "cluster_key": c["cluster_key"],
                    "label":       c["label"],
                    "article_ids": json.dumps(c["article_ids"]),
                }
                for c in clusters
            ]
            conn.cursor().executemany(sql, params)
    log.info("Saved %d clusters to database.", len(clusters))


def fetch_all_clusters() -> list[dict]:
    """Return all clusters with article_ids de-serialised."""
    sql = "SELECT * FROM clusters ORDER BY id"
    with get_connection() as conn:
        rows = conn.execute(sql).fetchall()
    result = []
    for r in rows:
        d = dict(r)
        if isinstance(d["article_ids"], str):
            d["article_ids"] = json.loads(d["article_ids"] or "[]")
        result.append(d)
    return result


def fetch_cluster_with_articles(cluster_key: str) -> dict | None:
    """Return a cluster dict including the full article objects."""
    sql = "SELECT * FROM clusters WHERE cluster_key = %s"
    with get_connection() as conn:
        row = conn.execute(sql, [cluster_key]).fetchone()
    if not row:
        return None

    cluster = dict(row)
    if isinstance(cluster["article_ids"], str):
        cluster["article_ids"] = json.loads(cluster["article_ids"] or "[]")

    if cluster["article_ids"]:
        # PostgreSQL syntax for IN clause with multiple parameters
        placeholders = ",".join(["%s"] * len(cluster["article_ids"]))
        art_sql = f"SELECT * FROM articles WHERE id IN ({placeholders})"
        with get_connection() as conn:
            art_rows = conn.execute(art_sql, cluster["article_ids"]).fetchall()
        articles = []
        for r in art_rows:
            d = dict(r)
            if isinstance(d["keywords"], str):
                d["keywords"] = json.loads(d["keywords"] or "[]")
            articles.append(d)
        cluster["articles"] = articles
    else:
        cluster["articles"] = []

    return cluster
