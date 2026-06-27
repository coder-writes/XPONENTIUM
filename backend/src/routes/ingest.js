/**
 * src/routes/ingest.js — Ingest pipeline routes.
 *
 * POST /ingest/trigger           → ingestController.triggerIngest
 * GET  /ingest/status/:jobId     → ingestController.getJobStatus
 */
const { Router } = require("express");
const { triggerIngest, getJobStatus } = require("../controllers/ingestController");

const router = Router();

router.post("/trigger", triggerIngest);
router.get("/status/:jobId", getJobStatus);

module.exports = router;
