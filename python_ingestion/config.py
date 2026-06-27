"""
config.py — Central configuration for the News Pulse ingestion pipeline.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()  # Load variables from .env

# ─── Paths & DB ───────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("ERROR: DATABASE_URL is missing! Please set it in your .env file.")


# ─── RSS Feed Sources ─────────────────────────────────────────────────────────
RSS_FEEDS = [
    {
        "name": "BBC News",
        "url": "http://feeds.bbci.co.uk/news/rss.xml",
        "language": "en",
    },
    {
        "name": "NPR News",
        "url": "https://feeds.npr.org/1001/rss.xml",
        "language": "en",
    },
    {
        "name": "Reuters",
        "url": "https://feeds.reuters.com/reuters/topNews",
        "language": "en",
    },
    {
        "name": "Al Jazeera",
        "url": "https://www.aljazeera.com/xml/rss/all.xml",
        "language": "en",
    },
    {
        "name": "The Guardian",
        "url": "https://www.theguardian.com/world/rss",
        "language": "en",
    },
]

# ─── HTTP / Scraping ───────────────────────────────────────────────────────────
REQUEST_TIMEOUT = 15          # seconds per HTTP request
MAX_ARTICLE_BODY_LEN = 5000   # truncate body text at N chars to keep DB lean

# ─── Clustering — TF-IDF + Cosine Similarity ──────────────────────────────────
#   We use TF-IDF vectors over (headline + summary) and group articles whose
#   pairwise cosine similarity exceeds SIMILARITY_THRESHOLD into the same cluster.
#   A conservative threshold (0.20) works well across noisy news text; lower it
#   to get larger but looser clusters, raise it for tighter clusters.
SIMILARITY_THRESHOLD = 0.20   # cosine-sim threshold to merge two articles
MIN_CLUSTER_SIZE     = 2      # singletons are kept but labelled "standalone"
MAX_FEATURES         = 3000   # TF-IDF vocabulary cap
TOP_LABEL_TERMS      = 4      # how many top TF-IDF terms form the cluster label

# ─── Scheduler ────────────────────────────────────────────────────────────────
FETCH_INTERVAL_MINUTES = 30   # how often the daemon re-polls all feeds
