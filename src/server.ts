import createApp from "./app.js";
import { checkDatabaseConnection, disconnectDatabase } from "./config/database.js";
import env from "./config/env.js";
import logger from "./config/logger.js";
/* eslint-disable n/no-process-exit */
async function startServer(): Promise<void> {
  const app = createApp();
  const isDBConnected = await checkDatabaseConnection();
  if (!isDBConnected) {
    logger.error("Failed to connect to database. Server not started.");
    process.exit(1);
  }

  const server = app.listen(env.PORT, () => {
    logger.info(`Server running on port ${env.PORT} [${env.NODE_ENV}]`);
  });
  let isShuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info(`Received ${signal}, shutting down gracefully`);

    const forceExitTimeout = setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, 10_000);

    server.close(async () => {
      clearTimeout(forceExitTimeout);
      await disconnectDatabase();
      logger.info("Server closed successfully");
      process.exit(0);
    });
  };

  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled Rejection", { reason });
    process.exit(1);
  });

  process.on("uncaughtException", (error) => {
    logger.error("Uncaught Exception", { error });
    process.exit(1);
  });

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

startServer().catch((error) => {
  logger.error("Failed to start server", { error });
  process.exit(1);
});
