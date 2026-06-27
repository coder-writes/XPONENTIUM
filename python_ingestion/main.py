"""
main.py — CLI entry-point for the News Pulse ingestion pipeline.

Usage
─────
# One-shot run (ingest + group)
python main.py

# Ingest only (skip body scraping for speed)
python main.py --no-scrape

# Group only (re-cluster articles already in DB without re-fetching)
python main.py --group-only

# Daemon mode — re-run every N minutes (default: config.FETCH_INTERVAL_MINUTES)
python main.py --daemon

# Export clusters to JSON (useful for debugging / passing to the backend)
python main.py --export clusters.json
"""

import argparse
import json
import logging
import sys
import time
from pathlib import Path

# Force UTF-8 on Windows consoles (default is CP1252 which can't encode → ─ etc.)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import schedule as sched

from config import FETCH_INTERVAL_MINUTES
from database import init_db, fetch_all_articles, fetch_all_clusters
from fetcher import run_ingestion
from grouper import run_grouping

# ─── Logging setup ─────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(
            stream=open(sys.stdout.fileno(), mode="w", encoding="utf-8", buffering=1, closefd=False)
        ),
        logging.FileHandler(Path(__file__).parent / "data" / "pipeline.log", encoding="utf-8"),
    ],
)
log = logging.getLogger("main")


# ─── Pipeline step ─────────────────────────────────────────────────────────────

def run_pipeline(scrape_body: bool = True) -> None:
    """Full ingestion → grouping cycle."""
    log.info("=" * 60)
    log.info("News Pulse pipeline starting…")

    new = run_ingestion(scrape_body=scrape_body)
    log.info("New articles fetched: %d", new)

    clusters = run_grouping()
    log.info(
        "Topics identified: %d  (out of %d total articles)",
        sum(1 for c in clusters if not c.get("is_standalone")),
        len(fetch_all_articles()),
    )

    log.info("Pipeline finished.")
    log.info("=" * 60)


# ─── Export helper ─────────────────────────────────────────────────────────────

def export_clusters(output_path: str) -> None:
    """Write clusters + embedded articles to a JSON file."""
    from database import fetch_cluster_with_articles

    clusters = fetch_all_clusters()
    rich_clusters = []
    for c in clusters:
        rich = fetch_cluster_with_articles(c["cluster_key"])
        if rich:
            rich_clusters.append(rich)

    Path(output_path).write_text(
        json.dumps(rich_clusters, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    log.info("Exported %d clusters to %s", len(rich_clusters), output_path)


# ─── CLI ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        prog="news_pulse",
        description="News Pulse — RSS ingestion & topic clustering pipeline",
    )
    parser.add_argument(
        "--no-scrape",
        action="store_true",
        help="Skip full-body scraping (headlines + summaries only; much faster)",
    )
    parser.add_argument(
        "--group-only",
        action="store_true",
        help="Re-cluster articles already in DB without re-fetching feeds",
    )
    parser.add_argument(
        "--daemon",
        action="store_true",
        help=f"Run continuously, polling feeds every {FETCH_INTERVAL_MINUTES} minutes",
    )
    parser.add_argument(
        "--export",
        metavar="PATH",
        help="After the run, export clusters as JSON to PATH",
    )
    parser.add_argument(
        "--stats",
        action="store_true",
        help="Print DB statistics and exit",
    )

    args = parser.parse_args()

    # Ensure DB schema exists
    init_db()

    # ── Stats mode ────────────────────────────────────────────────────────────
    if args.stats:
        articles = fetch_all_articles()
        clusters = fetch_all_clusters()
        print(f"\n{'─'*40}")
        print(f"  Articles in DB : {len(articles)}")
        print(f"  Clusters       : {len(clusters)}")
        by_source: dict[str, int] = {}
        for a in articles:
            by_source[a["source"]] = by_source.get(a["source"], 0) + 1
        print("  By source:")
        for src, cnt in sorted(by_source.items(), key=lambda x: -x[1]):
            print(f"    {src:30s} {cnt:4d}")
        print(f"{'─'*40}\n")
        return

    # ── Group-only mode ───────────────────────────────────────────────────────
    if args.group_only:
        clusters = run_grouping()
        if args.export:
            export_clusters(args.export)
        return

    # ── Daemon mode ───────────────────────────────────────────────────────────
    if args.daemon:
        log.info("Daemon mode: polling every %d minutes.", FETCH_INTERVAL_MINUTES)

        def _job():
            try:
                run_pipeline(scrape_body=not args.no_scrape)
                if args.export:
                    export_clusters(args.export)
            except Exception as exc:
                log.error("Pipeline job failed: %s", exc, exc_info=True)

        _job()  # run immediately on start
        sched.every(FETCH_INTERVAL_MINUTES).minutes.do(_job)

        while True:
            sched.run_pending()
            time.sleep(30)

    # ── One-shot mode (default) ───────────────────────────────────────────────
    else:
        run_pipeline(scrape_body=not args.no_scrape)
        if args.export:
            export_clusters(args.export)


if __name__ == "__main__":
    main()
