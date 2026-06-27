/**
 * src/middleware/errorHandler.js — Centralized Express error handler.
 *
 * Catches any error thrown by controllers and returns a consistent JSON shape.
 * Production-safe: hides stack traces unless NODE_ENV === 'development'.
 */

// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, _req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const isDev = process.env.NODE_ENV === "development";

  console.error(`[Error] ${status} — ${err.message}`);
  if (isDev) console.error(err.stack);

  res.status(status).json({
    error: err.message || "Internal Server Error",
    ...(isDev && { stack: err.stack }),
  });
};
