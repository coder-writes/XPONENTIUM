/**
 * src/controllers/clustersController.js
 *
 * Business logic for cluster-related endpoints.
 * All DB queries live here, not in route files.
 */
const pool = require("../db/pool");

/**
 * Helper: parse article_ids field (stored as JSON text or native array)
 */
function parseIds(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(Number);
  try { return JSON.parse(raw); } catch { return []; }
}

/**
 * GET /clusters
 * Returns all topic clusters with summary metadata (no article bodies).
 */
exports.listClusters = async (_req, res, next) => {
  try {
    // Fetch all clusters first, then resolve article metadata via a second query
    const { rows: clusters } = await pool.query(
      `SELECT id, cluster_key, label, article_ids, created_at FROM clusters ORDER BY id`
    );

    if (clusters.length === 0) {
      return res.json({ count: 0, clusters: [] });
    }

    // Collect all article IDs across all clusters for one batch query
    const allIds = [];
    const clusterMeta = clusters.map((c) => {
      const ids = parseIds(c.article_ids);
      ids.forEach((id) => allIds.push(id));
      return { ...c, parsedIds: ids };
    });

    // Fetch min/max published_at for all article IDs in one query
    const dateMap = {};
    if (allIds.length > 0) {
      const { rows: dates } = await pool.query(
        `SELECT id, published_at FROM articles WHERE id = ANY($1::int[])`,
        [allIds]
      );
      dates.forEach((d) => { dateMap[d.id] = d.published_at; });
    }

    const result = clusterMeta.map((c) => {
      const times = c.parsedIds.map((id) => dateMap[id]).filter(Boolean).sort();
      return {
        id: c.id,
        cluster_key: c.cluster_key,
        label: c.label,
        article_count: c.parsedIds.length,
        time_range: {
          earliest: times[0] || null,
          latest:   times[times.length - 1] || null,
        },
        created_at: c.created_at,
      };
    });

    // Sort by article_count DESC
    result.sort((a, b) => b.article_count - a.article_count);

    res.json({ count: result.length, clusters: result });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /clusters/:id
 * Returns a single cluster with all its articles sorted chronologically.
 * :id can be the numeric id OR the cluster_key string (e.g. "cluster_0003").
 */
exports.getCluster = async (req, res, next) => {
  const { id } = req.params;

  const isNumeric = /^\d+$/.test(id);
  const whereClause = isNumeric ? "id = $1" : "cluster_key = $1";
  const queryParam = isNumeric ? parseInt(id, 10) : id;

  try {
    const { rows } = await pool.query(
      `SELECT id, cluster_key, label, article_ids, created_at FROM clusters WHERE ${whereClause}`,
      [queryParam]
    );

    if (rows.length === 0) {
      const err = new Error(`Cluster '${id}' not found`);
      err.status = 404;
      return next(err);
    }

    const cluster = rows[0];
    const articleIds = parseIds(cluster.article_ids);

    let articles = [];
    if (articleIds.length > 0) {
      const { rows: artRows } = await pool.query(
        `SELECT id, url, source, title, summary, published_at, fetched_at, keywords
         FROM articles
         WHERE id = ANY($1::int[])
         ORDER BY published_at ASC NULLS LAST`,
        [articleIds]
      );
      articles = artRows.map((a) => ({
        ...a,
        keywords: Array.isArray(a.keywords)
          ? a.keywords
          : JSON.parse(a.keywords || "[]"),
      }));
    }

    res.json({
      id: cluster.id,
      cluster_key: cluster.cluster_key,
      label: cluster.label,
      article_count: articleIds.length,
      created_at: cluster.created_at,
      articles,
    });
  } catch (err) {
    next(err);
  }
};
