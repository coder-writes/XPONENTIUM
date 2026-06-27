# News Pulse — Python Ingestion & Topic Grouping

> **Part 1** of the XPONENTIUM Internship Assessment  
> RSS ingestion · full-body scraping · TF-IDF topic clustering · SQLite storage · REST API

---

## Quick Start

```bash
cd python_ingestion

# 1 — create a virtual environment
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS / Linux

# 2 — install dependencies
pip install -r requirements.txt

# 3 — run the full pipeline (ingest → scrape → cluster)
python main.py

# 4 — (optional) start the REST API for the frontend / Node.js backend
python api_server.py --port 8000
```

---

## File Structure

```
python_ingestion/
├── config.py        — feed URLs, paths, clustering thresholds
├── database.py      — SQLite schema, insert/query helpers
├── fetcher.py       — RSS parsing + body scraping
├── grouper.py       — TF-IDF clustering + label generation
├── main.py          — CLI entry-point
├── api_server.py    — Flask REST API (for the frontend)
├── requirements.txt
└── data/
    ├── news_pulse.db   (created on first run)
    └── pipeline.log
```

---

## RSS Sources Used

| Outlet | Feed URL |
|--------|----------|
| **BBC News** | `http://feeds.bbci.co.uk/news/rss.xml` |
| **NPR News** | `https://feeds.npr.org/1001/rss.xml` |
| **Reuters** | `https://feeds.reuters.com/reuters/topNews` |
| **Al Jazeera** | `https://www.aljazeera.com/xml/rss/all.xml` |
| **The Guardian** | `https://www.theguardian.com/world/rss` |

These are all public, reputable, English-language feeds. Five were included instead of the required three to improve cluster quality by having more articles per topic.

---

## Approach & Design Decisions

### 1a — Feed Ingestion

#### Feed format inconsistencies
`feedparser` normalises most Atom/RSS quirks automatically. On top of that, `_get_summary()` in `fetcher.py` tries `content:encoded` first (WordPress-style feeds) then falls back to `<summary>` / `<description>`. Date parsing uses `python-dateutil` after trying feedparser's pre-parsed tuples, so formats like `Thu, 27 Jun 2024 10:00:00 +0000`, ISO-8601, and RFC-822 all normalise to a single UTC string.

#### Full-body extraction (three-strategy cascade)
`_scrape_body()` tries, in order:
1. **trafilatura** — best-in-class article extractor; handles most news sites
2. **newspaper3k** — good fallback for outlet-specific templates
3. **BeautifulSoup heuristic** — grabs `<article>` tag or largest collection of `<p>` blocks

If all three fail (paywalled articles, JavaScript-heavy pages, bot detection) the function returns `""` and the summary is used instead. Errors are logged at DEBUG level so the overall run never crashes.

#### Deduplication
`INSERT OR IGNORE` on a `UNIQUE` URL index in SQLite. Same article ingested on multiple runs is silently skipped. Cross-outlet deduplication (same story, different URLs) is a stretch goal not yet implemented.

#### Re-runnability
`main.py --daemon` uses the `schedule` library to re-poll feeds every 30 minutes (configurable in `config.py`). Only new articles (new URLs) are inserted; the grouping step re-clusters the full corpus so topic memberships stay fresh.

---

### 1b — Topic Grouping

**Chosen approach: Option B — TF-IDF + cosine similarity + connected components**

#### Why TF-IDF over keyword overlap?
Keyword overlap requires manual stop-word tuning and a fixed "N shared words" threshold that doesn't adapt to document length. TF-IDF automatically down-weights common words (so "government" in every article doesn't drive spurious merges) and up-weights rare, discriminative terms like "Gaza ceasefire" or "Fed rate cut". It's only slightly more complex but substantially more reliable.

#### Why connected components instead of KMeans / DBSCAN?
- **KMeans** requires specifying `k` upfront — impossible for live news where the number of stories changes daily.
- **DBSCAN** needs careful `epsilon` tuning and can be slow on dense sparse matrices.
- **Connected components on a similarity graph**: `O(n²)` similarity computation, then a BFS sweep. For ≤ 1000 articles this is fast, transparent, and produces naturally-sized clusters without any pre-set `k`.

#### How thresholds were chosen
`SIMILARITY_THRESHOLD = 0.20` was selected empirically:
- News headlines are short, so raw cosine similarity rarely exceeds 0.40 even for clearly related articles.
- 0.20 captures articles that share 2–3 significant terms (e.g., both contain "Ukraine", "Russia", "ceasefire") without merging unrelated stories.
- Raising to 0.30 gives tighter clusters; 0.10 produces large mega-clusters that are too noisy.

Title text is repeated 3× in the TF-IDF corpus to give headlines higher weight than body summaries (a simple but effective signal boost).

#### Cluster labels
The cluster label is the top-`N` TF-IDF terms from the centroid of the cluster's article vectors. This produces human-readable labels like `"ukraine · russia · ceasefire · war"` automatically.

#### Known limitation
**Synonym blindness** — TF-IDF is a bag-of-words model. If BBC writes "US election" and Al Jazeera writes "American vote", these may not cluster together unless both terms appear in both texts. Semantic sentence-level embeddings (e.g., `sentence-transformers` with `all-MiniLM-L6-v2`) would fix this, but require ~80 MB model download and GPU-friendly hardware. For the scope of this assessment, TF-IDF is a clean, explainable baseline.

---

## CLI Reference

```bash
# Full pipeline (ingest + scrape + group)
python main.py

# Headlines only — skip full-body scraping (much faster, good for testing)
python main.py --no-scrape

# Re-cluster without re-fetching (useful after tweaking thresholds)
python main.py --group-only

# Daemon: re-run every 30 minutes
python main.py --daemon

# Export clusters as JSON (for the Node.js backend or debugging)
python main.py --export data/clusters.json

# Print database statistics
python main.py --stats
```

## REST API Reference

Start with `python api_server.py --port 8000`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/articles` | Paginated articles (`?page=1&per_page=20&source=BBC+News&q=keyword&since=ISO`) |
| `GET` | `/api/articles/<id>` | Single article |
| `GET` | `/api/clusters` | All clusters (without embedded articles) |
| `GET` | `/api/clusters/<key>` | Single cluster with full article objects |
| `GET` | `/api/clusters/<key>/timeline` | Articles sorted by `published_at` for timeline render |
| `POST` | `/api/run` | Trigger background pipeline run |
| `GET` | `/api/run/status` | Pipeline run status |
| `GET` | `/api/stats` | DB statistics summary |
| `GET` | `/health` | Health check |

---

## SQLite Schema

```sql
articles  (id, url UNIQUE, source, title, summary, body, published_at, fetched_at, keywords JSON)
clusters  (id, cluster_key UNIQUE, label, article_ids JSON, created_at)
```

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `feedparser` | RSS/Atom parsing with format quirk handling |
| `requests` | HTTP fetching with custom User-Agent |
| `trafilatura` | Primary article body extractor |
| `beautifulsoup4` + `lxml` | HTML parsing fallback |
| `python-dateutil` | Robust date string normalisation |
| `scikit-learn` | TF-IDF vectorisation + cosine similarity |
| `nltk` | Stop-word lists |
| `schedule` | Daemon scheduling |
| `flask` + `flask-cors` | REST API server |
