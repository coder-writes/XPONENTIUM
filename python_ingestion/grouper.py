"""
grouper.py — TF-IDF based topic clustering for News Pulse.

Algorithm (Option B from the spec)
────────────────────────────────────
1. Build a TF-IDF matrix over (title + summary) for all stored articles.
2. Compute pairwise cosine similarity using a sparse dot-product; only
   pairs above SIMILARITY_THRESHOLD are considered "related".
3. Build a graph where nodes are articles and edges connect similar pairs.
4. Extract connected components → each component is one topic cluster.
5. Assign a human-readable label using the top TF-IDF terms shared
   across the component's articles.
6. Singletons (components of size 1) are kept as "standalone" clusters
   so no article is ever lost from the output.

Why TF-IDF + cosine + connected components instead of KMeans/DBSCAN?
• KMeans requires specifying k upfront — impossible for live news.
• DBSCAN needs careful epsilon tuning and can be slow on sparse matrices.
• Connected-components on a similarity graph scales well, is transparent,
  and produces naturally-sized clusters without a k parameter.

Thresholds
──────────
• SIMILARITY_THRESHOLD = 0.20  — chosen empirically; news headlines share
  few words so even 0.20 cosine sim indicates meaningful overlap.  Raising
  to 0.30 gives tighter clusters; lowering to 0.10 merges more aggressively.

Known limitation
────────────────
• TF-IDF is bag-of-words: "US election" and "American vote" may not cluster
  unless both terms appear in both documents.  Semantic embeddings
  (sentence-transformers) would fix this at the cost of GPU / model download.
"""

import logging
import os
import re
import string
from collections import defaultdict
from typing import Any

import nltk
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

try:
    import google.generativeai as genai
except ImportError:
    genai = None

from config import (
    MAX_FEATURES,
    MIN_CLUSTER_SIZE,
    SIMILARITY_THRESHOLD,
    TOP_LABEL_TERMS,
)
from database import fetch_all_articles, replace_clusters

log = logging.getLogger(__name__)

# ─── NLTK data (downloaded on first run, cached locally) ─────────────────────
def _ensure_nltk():
    for resource in ("stopwords", "punkt", "punkt_tab"):
        try:
            nltk.data.find(f"tokenizers/{resource}" if resource.startswith("punkt") else f"corpora/{resource}")
        except (LookupError, OSError):
            log.info("Downloading NLTK resource: %s", resource)
            nltk.download(resource, quiet=True)


_ensure_nltk()

from nltk.corpus import stopwords  # noqa: E402 (after download)

_STOP_WORDS = set(stopwords.words("english")) | {
    # extra news-specific filler that TF-IDF rarely penalises enough
    "says", "said", "say", "told", "tell", "according", "report",
    "reports", "reported", "new", "one", "two", "three", "also",
    "would", "could", "may", "will", "us", "u", "s", "like", "use",
    "year", "years", "day", "days", "week", "time", "people", "make",
    "way", "know", "think", "want", "come", "go", "get", "take",
    "first", "last", "latest", "today", "monday", "tuesday",
    "wednesday", "thursday", "friday", "saturday", "sunday",
}

# ─── Text pre-processing ──────────────────────────────────────────────────────

def _clean(text: str) -> str:
    """Lowercase, strip punctuation/numbers, remove stop words."""
    text = text.lower()
    text = re.sub(r"https?://\S+", " ", text)           # remove URLs
    text = text.translate(str.maketrans("", "", string.punctuation + "0123456789"))
    tokens = [t for t in text.split() if t not in _STOP_WORDS and len(t) > 2]
    return " ".join(tokens)


def _article_text(article: dict) -> str:
    """Combine title (weighted 3×) + summary for richer signal."""
    title   = article.get("title", "") or ""
    summary = article.get("summary", "") or ""
    # Repeat title 3 times to give it higher TF-IDF weight
    combined = f"{title} {title} {title} {summary}"
    return _clean(combined)


# ─── Connected-component clustering ──────────────────────────────────────────

def _build_clusters(ids: list[int], similarity_matrix: np.ndarray) -> list[list[int]]:
    """
    Given a symmetric similarity matrix, return connected components
    where any edge (i, j) exists when similarity >= SIMILARITY_THRESHOLD.

    Uses iterative BFS (no recursion limit issues).
    """
    n = len(ids)
    visited = [False] * n
    components: list[list[int]] = []

    for start in range(n):
        if visited[start]:
            continue
        component = []
        queue = [start]
        visited[start] = True
        while queue:
            node = queue.pop(0)
            component.append(node)
            for neighbour in range(n):
                if not visited[neighbour] and similarity_matrix[node, neighbour] >= SIMILARITY_THRESHOLD:
                    visited[neighbour] = True
                    queue.append(neighbour)
        components.append(component)

    return components


# ─── Cluster label generation ─────────────────────────────────────────────────

import time

def _cluster_label(
    texts: list[str], 
    tfidf_matrix, 
    component_indices: list[int], 
    feature_names: list[str],
    original_articles: list[dict] = None
) -> str:
    """
    Generate a label using Gemini AI if API key is present, 
    otherwise fallback to top-N TF-IDF terms.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if api_key and genai and original_articles:
        try:
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel('gemini-2.5-flash')
            titles = [a.get("title", "") for a in original_articles[:10]]
            prompt = (
                "You are a news editor. Read the following news headlines which all belong to the same topic cluster. "
                "Write a single, concise, and punchy headline (3 to 6 words max) that summarizes the core topic. "
                "Do NOT use quotes, punctuation at the end, or prefix it with 'Headline:'. Just return the short phrase.\n\n"
                + "\n".join(f"- {t}" for t in titles if t)
            )
            
            # Simple retry for 429 Rate Limit (Free tier has 5 RPM limit)
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    response = model.generate_content(prompt)
                    if response and response.text:
                        clean_label = response.text.strip().strip('"').strip("'")
                        return clean_label
                    break
                except Exception as e:
                    if "429" in str(e) and attempt < max_retries - 1:
                        log.warning("Gemini API rate limit hit. Sleeping for 15s...")
                        time.sleep(15)
                    else:
                        raise e
        except Exception as e:
            log.warning("Gemini AI labeling failed, falling back to TF-IDF. Error: %s", e)

    # Fallback to TF-IDF
    sub_matrix = tfidf_matrix[component_indices]
    centroid = np.asarray(sub_matrix.mean(axis=0)).flatten()
    top_indices = centroid.argsort()[::-1][:TOP_LABEL_TERMS]
    terms = [feature_names[i] for i in top_indices if centroid[i] > 0]
    if not terms:
        return "general news"
    return " · ".join(terms)


# ─── Public API ───────────────────────────────────────────────────────────────

def run_grouping() -> list[dict[str, Any]]:
    """
    Read all articles from the database, cluster them, write clusters back,
    and return the cluster list.

    Returns
    -------
    list[dict]
        Each dict: {cluster_key, label, article_ids, size, is_standalone}
    """
    articles = fetch_all_articles()
    if not articles:
        log.warning("No articles in database — skipping grouping.")
        return []

    log.info("Grouping %d articles with TF-IDF + cosine similarity…", len(articles))

    # Build clean text corpus
    corpus = [_article_text(a) for a in articles]
    article_ids = [a["id"] for a in articles]

    # ── TF-IDF matrix ──────────────────────────────────────────────────────────
    vectorizer = TfidfVectorizer(
        max_features=MAX_FEATURES,
        ngram_range=(1, 2),       # unigrams + bigrams capture "climate change" etc.
        min_df=1,
        sublinear_tf=True,        # log-scale TF dampens very common terms
    )
    try:
        tfidf_matrix = vectorizer.fit_transform(corpus)
    except ValueError as exc:
        log.error("TF-IDF failed (maybe corpus is empty?): %s", exc)
        return []

    feature_names: list[str] = vectorizer.get_feature_names_out().tolist()

    # ── Pairwise cosine similarity ─────────────────────────────────────────────
    # cosine_similarity returns a dense ndarray; for large corpora you'd use
    # sparse batch computation, but for ~500 articles this is fine.
    sim_matrix = cosine_similarity(tfidf_matrix)

    # ── Connected components ────────────────────────────────────────────────────
    components = _build_clusters(article_ids, sim_matrix)

    # ── Build cluster dicts ────────────────────────────────────────────────────
    clusters: list[dict[str, Any]] = []
    for cluster_idx, component in enumerate(components):
        member_article_ids = [article_ids[i] for i in component]
        member_texts = [corpus[i] for i in component]
        is_standalone = len(component) < MIN_CLUSTER_SIZE

        label = _cluster_label(
            member_texts,
            tfidf_matrix,
            component,
            feature_names,
            original_articles=[articles[i] for i in component]
        ) if not is_standalone else _single_label(articles[component[0]])

        clusters.append(
            {
                "cluster_key":   f"cluster_{cluster_idx:04d}",
                "label":         label,
                "article_ids":   member_article_ids,
                "size":          len(member_article_ids),
                "is_standalone": is_standalone,
            }
        )

    # Sort largest clusters first
    clusters.sort(key=lambda c: c["size"], reverse=True)

    # Re-key sequentially after sort so IDs are stable front-to-back
    for i, c in enumerate(clusters):
        c["cluster_key"] = f"cluster_{i:04d}"

    # Persist
    replace_clusters(clusters)

    grouped   = sum(1 for c in clusters if not c["is_standalone"])
    singleton = sum(1 for c in clusters if c["is_standalone"])
    log.info(
        "Clustering done: %d topic clusters, %d standalone articles.",
        grouped, singleton
    )

    return clusters


def _single_label(article: dict) -> str:
    """Generate a terse label for a singleton cluster from its title."""
    title = article.get("title", "") or "Standalone Article"
    words = [w for w in title.split() if w.lower() not in _STOP_WORDS and len(w) > 3]
    return " · ".join(words[:4]) or title[:40]
