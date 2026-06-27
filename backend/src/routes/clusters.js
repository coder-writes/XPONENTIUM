/**
 * src/routes/clusters.js — Cluster resource routes.
 *
 * GET /clusters       → clustersController.listClusters
 * GET /clusters/:id   → clustersController.getCluster
 */
const { Router } = require("express");
const { listClusters, getCluster } = require("../controllers/clustersController");

const router = Router();

router.get("/", listClusters);
router.get("/:id", getCluster);

module.exports = router;
