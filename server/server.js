const http = require("http");
const app = require("./app");
const { connectDb } = require("./config/db");
const { port, env } = require("./config/env");
const logger = require("./utils/logger.util");

async function start() {
  await connectDb();

  const server = http.createServer(app);

  server.listen(port, () => {
    logger.server(port, env);
  });

  // Graceful shutdown
  function shutdown(signal) {
    logger.shutdown(`Received ${signal}, shutting down gracefully...`);

    server.close(() => {
      logger.success("HTTP server closed");
      process.exit(0);
    });

    // Force exit if not closed in time
    setTimeout(() => {
      logger.error("Forcing process exit after shutdown timeout");
      process.exit(1);
    }, 10_000);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// Handle top-level rejections
process.on("unhandledRejection", (err) => {
  logger.error("Unhandled promise rejection", err);
});

start().catch((err) => {
  logger.error("Fatal startup error", err);
  process.exit(1);
});
