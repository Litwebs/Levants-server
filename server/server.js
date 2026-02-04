const http = require("http");
const app = require("./app");
const { connectDb } = require("./config/db");
const { port, env } = require("./config/env");

async function start() {
  await connectDb();

  const server = http.createServer(app);

  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`API running on port ${port} (${env})`);
  });

  // Graceful shutdown
  function shutdown(signal) {
    // eslint-disable-next-line no-console
    console.log(`Received ${signal}, shutting down gracefully...`);

    server.close(() => {
      // eslint-disable-next-line no-console
      console.log("HTTP server closed");
      process.exit(0);
    });

    // Force exit if not closed in time
    setTimeout(() => {
      // eslint-disable-next-line no-console
      console.error("Forcing process exit after shutdown timeout");
      process.exit(1);
    }, 10_000);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// Handle top-level rejections
process.on("unhandledRejection", (err) => {
  // eslint-disable-next-line no-console
  console.error("Unhandled promise rejection", err);
});

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal startup error", err);
  process.exit(1);
});
