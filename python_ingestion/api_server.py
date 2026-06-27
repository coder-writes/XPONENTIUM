"""
api_server.py — Thin Flask/FastAPI-compatible REST layer over the SQLite DB.

Endpoints
─────────
GET  /api/articles               → paginated article list
GET  /api/articles/<id>          → single article
GET  /api/clusters               → all clusters (without embedded articles)
GET  /api/clusters/<key>         → single cluster with full article objects
GET  /api/clusters/<key>/timeline → articles sorted by published_at for timeline
POST /api/run                    → trigger a pipeline run (ingest + group)
GET  /api/stats                  → summary statistics

CORS is enabled for all origins so the separate frontend (Vite/Next.js) can
talk to this server during local development without a proxy.

Usage
─────
python api_server.py             # default: http://0.0.0.0:8000
python api_server.py --port 5050
"""

import argparse
import json
import logging
import threading
from datetime import datetime

from flask import Flask, jsonify, request
from flask_cors import CORS

from database import (
    fetch_all_articles,
    fetch_all_clusters,
    fetch_articles_since,
    fetch_cluster_with_articles,
    init_db,
)

log = logging.getLogger(__name__)
app = Flask(__name__)
CORS(app)   # allow all origins

# ─── Helpers ──────────────────────────────────────────────────────────────────

def _paginate(items: list, page: int, per_page: int) -> dict:
    total = len(items)
    start = (page - 1) * per_page
    end   = start + per_page
    return {
        "data":     items[start:end],
        "page":     page,
        "per_page": per_page,
        "total":    total,
        "pages":    (total + per_page - 1) // per_page,
    }


# ─── Articles ─────────────────────────────────────────────────────────────────

@app.get("/api/articles")
def list_articles():
    """
    Query params:
    • page      — 1-based (default 1)
    • per_page  — default 20, max 100
    • since     — ISO-8601 timestamp; return only articles published after this
    • source    — filter by source name (case-insensitive)
    • q         — simple keyword filter against title+summary
    """
    page     = max(1, int(request.args.get("page", 1)))
    per_page = min(100, int(request.args.get("per_page", 20)))
    since    = request.args.get("since")
    source   = request.args.get("source", "").strip().lower()
    q        = request.args.get("q", "").strip().lower()

    articles = fetch_articles_since(since) if since else fetch_all_articles()

    if source:
        articles = [a for a in articles if a["source"].lower() == source]
    if q:
        articles = [a for a in articles if q in (a.get("title") or "").lower()
                    or q in (a.get("summary") or "").lower()]

    return jsonify(_paginate(articles, page, per_page))


@app.get("/api/articles/<int:article_id>")
def get_article(article_id: int):
    all_articles = fetch_all_articles()
    for a in all_articles:
        if a["id"] == article_id:
            return jsonify(a)
    return jsonify({"error": "Article not found"}), 404


# ─── Clusters ─────────────────────────────────────────────────────────────────

@app.get("/api/clusters")
def list_clusters():
    """Return all clusters (article_ids list only, not full article objects)."""
    clusters = fetch_all_clusters()
    return jsonify({"data": clusters, "total": len(clusters)})


@app.get("/api/clusters/<cluster_key>")
def get_cluster(cluster_key: str):
    cluster = fetch_cluster_with_articles(cluster_key)
    if not cluster:
        return jsonify({"error": "Cluster not found"}), 404
    return jsonify(cluster)


@app.get("/api/clusters/<cluster_key>/timeline")
def cluster_timeline(cluster_key: str):
    """
    Articles in the cluster sorted ascending by published_at — ready to
    render as a timeline in the frontend.
    """
    cluster = fetch_cluster_with_articles(cluster_key)
    if not cluster:
        return jsonify({"error": "Cluster not found"}), 404

    articles = sorted(
        cluster.get("articles", []),
        key=lambda a: a.get("published_at") or "",
    )
    return jsonify({
        "cluster_key": cluster_key,
        "label":       cluster["label"],
        "timeline":    articles,
    })


# ─── Pipeline trigger ─────────────────────────────────────────────────────────

_pipeline_lock = threading.Lock()
_pipeline_status = {"running": False, "last_run": None, "message": "idle"}


@app.post("/api/run")
def trigger_run():
    """
    Kick off a background pipeline run (ingest + group).
    Returns immediately with {"status": "started"} or {"status": "already_running"}.
    """
    if not _pipeline_lock.acquire(blocking=False):
        return jsonify({"status": "already_running"}), 409

    def _bg():
        try:
            _pipeline_status["running"] = True
            from fetcher import run_ingestion
            from grouper import run_grouping
            scrape = request.args.get("scrape", "true").lower() != "false"
            run_ingestion(scrape_body=scrape)
            run_grouping()
            _pipeline_status["message"] = "success"
        except Exception as exc:
            log.error("Background pipeline failed: %s", exc, exc_info=True)
            _pipeline_status["message"] = f"error: {exc}"
        finally:
            _pipeline_status["running"] = False
            _pipeline_status["last_run"] = datetime.utcnow().isoformat() + "Z"
            _pipeline_lock.release()

    threading.Thread(target=_bg, daemon=True).start()
    return jsonify({"status": "started"})


@app.get("/api/run/status")
def run_status():
    return jsonify(_pipeline_status)


# ─── Stats ────────────────────────────────────────────────────────────────────

@app.get("/api/stats")
def stats():
    articles = fetch_all_articles()
    clusters = fetch_all_clusters()

    by_source: dict[str, int] = {}
    for a in articles:
        by_source[a["source"]] = by_source.get(a["source"], 0) + 1

    topic_clusters   = [c for c in clusters if len(c["article_ids"]) >= 2]
    standalone       = [c for c in clusters if len(c["article_ids"]) < 2]

    return jsonify({
        "total_articles":      len(articles),
        "total_clusters":      len(clusters),
        "topic_clusters":      len(topic_clusters),
        "standalone_articles": len(standalone),
        "by_source":           by_source,
    })


# ─── Health check ─────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return jsonify({"status": "ok"})


# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--host", default="0.0.0.0")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO)
    init_db()

    app.run(host=args.host, port=args.port, debug=False)
