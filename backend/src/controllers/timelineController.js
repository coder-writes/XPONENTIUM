/**
 * src/controllers/timelineController.js
 *
 * Formats cluster data specifically for plotting on a timeline chart.
 * Returns a shape that charting libraries (Chart.js, Recharts, Nivo, etc.)
 * can consume directly.
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
 * GET /timeline
 *
 * Only returns clusters with 2+ articles (meaningful events).
 *
 * Response shape per cluster:
 * {
 *   cluster_key:    "cluster_0001",
 *   label:          "Israel Lebanon conflict",
 *   start:          "2026-06-26T18:00:00Z",   <- earliest article
 *   end:            "2026-06-27T09:00:00Z",   <- latest article
 *   article_count:  6,
 *   duration_hours: 15,
 *   intensity:      0.87  <- normalized 0-1 relative to largest cluster
 * }
 */
exports.getTimeline = async (_req, res, next) => {
  try {
    const { rows: clusters } = await pool.query(
      `SELECT cluster_key, label, article_ids FROM clusters ORDER BY id`
    );

    if (clusters.length === 0) {
      return res.json({ count: 0, clusters: [] });
    }

    // Collect all IDs for a batch date lookup
    const allIds = [];
    const parsed = clusters.map((c) => {
      const ids = parseIds(c.article_ids);
      ids.forEach((id) => allIds.push(id));
      return { ...c, parsedIds: ids };
    });

    const dateMap = {};
    if (allIds.length > 0) {
      const { rows: dates } = await pool.query(
        `SELECT id, published_at FROM articles WHERE id = ANY($1::int[])`,
        [allIds]
      );
      dates.forEach((d) => { dateMap[d.id] = d.published_at; });
    }

    // Build timeline rows — only clusters with 2+ articles
    const rawTimeline = parsed
      .map((c) => {
        const times = c.parsedIds
          .map((id) => dateMap[id])
          .filter(Boolean)
          .sort();
        return {
          cluster_key:   c.cluster_key,
          label:         c.label,
          start:         times[0] || null,
          end:           times[times.length - 1] || null,
          article_count: c.parsedIds.length,
        };
      })
      .filter((c) => c.article_count >= 2 && c.start);

    if (rawTimeline.length === 0) {
      return res.json({ count: 0, clusters: [] });
    }

    // Compute intensity
    const maxCount = Math.max(...rawTimeline.map((c) => c.article_count));

    const result = rawTimeline.map((c) => {
      const start = new Date(c.start);
      const end   = c.end ? new Date(c.end) : start;
      const durationHours = parseFloat(
        ((end - start) / (1000 * 60 * 60)).toFixed(2)
      );
      return {
        cluster_key:    c.cluster_key,
        label:          c.label,
        start:          c.start,
        end:            c.end,
        article_count:  c.article_count,
        duration_hours: durationHours,
        intensity:      parseFloat((c.article_count / maxCount).toFixed(4)),
      };
    });

    // Sort chronologically by start time
    result.sort((a, b) => new Date(a.start) - new Date(b.start));

    res.json({ count: result.length, clusters: result });
  } catch (err) {
    next(err);
  }
};
