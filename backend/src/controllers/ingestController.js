/**
 * src/controllers/ingestController.js
 *
 * Handles pipeline triggers and job status polling.
 *
 * Flow:
 *  POST /ingest/trigger  →  spawns python main.py as a child process
 *                           returns a jobId immediately (non-blocking)
 *  GET  /ingest/status/:jobId → returns { status, startedAt, finishedAt, output }
 */
const { spawn } = require("child_process");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

// In-memory job store. In production this would be Redis or a DB table.
// Shape: { [jobId]: { status, startedAt, finishedAt, output, error } }
const jobs = {};

// Absolute path to the Python ingestion directory
const PYTHON_DIR = path.resolve(
  __dirname,
  "../../../python_ingestion"
);

// The Python executable — defaults to "python" but can be overridden via env
const PYTHON_BIN = process.env.PYTHON_BIN || "python";

/**
 * POST /ingest/trigger
 * Spawns the pipeline and returns a job ID for polling.
 */
exports.triggerIngest = (req, res, next) => {
  try {
    const jobId = uuidv4();
    const startedAt = new Date().toISOString();

    jobs[jobId] = {
      status: "running",
      startedAt,
      finishedAt: null,
      output: [],
      error: null,
    };

    // Spawn python main.py as a non-blocking child process
    const child = spawn(PYTHON_BIN, ["main.py"], {
      cwd: PYTHON_DIR,
      env: { ...process.env },  // Pass environment (includes DATABASE_URL)
    });

    child.stdout.on("data", (data) => {
      jobs[jobId].output.push(data.toString().trim());
    });

    child.stderr.on("data", (data) => {
      jobs[jobId].output.push(data.toString().trim());
    });

    child.on("close", (code) => {
      jobs[jobId].finishedAt = new Date().toISOString();
      if (code === 0) {
        jobs[jobId].status = "completed";
      } else {
        jobs[jobId].status = "failed";
        jobs[jobId].error = `Process exited with code ${code}`;
      }
    });

    child.on("error", (err) => {
      jobs[jobId].status = "failed";
      jobs[jobId].error = err.message;
      jobs[jobId].finishedAt = new Date().toISOString();
    });

    // Respond immediately with the job ID for client polling
    res.status(202).json({
      message: "Pipeline triggered successfully",
      jobId,
      pollUrl: `/ingest/status/${jobId}`,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /ingest/status/:jobId
 * Returns the current state of a pipeline job.
 */
exports.getJobStatus = (req, res, next) => {
  try {
    const { jobId } = req.params;

    if (!jobs[jobId]) {
      const err = new Error(`Job '${jobId}' not found`);
      err.status = 404;
      return next(err);
    }

    const job = jobs[jobId];
    res.json({
      jobId,
      status: job.status,           // "running" | "completed" | "failed"
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      output: job.output,
      error: job.error,
    });
  } catch (err) {
    next(err);
  }
};
