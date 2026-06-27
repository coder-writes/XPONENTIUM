/**
 * index.js — Entry point. Starts the HTTP server.
 */
require("dotenv").config();
const app = require("./src/app");

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`[News Pulse API] Server running on http://localhost:${PORT}`);
});
