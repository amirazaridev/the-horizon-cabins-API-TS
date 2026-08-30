import createApp from "./app.js";
import env from "./config/env.js";
import logger from "./config/logger.js";

async function startServer(): Promise<void> {
  const app = createApp();

  const server = app.listen(env.port, () => {
    logger.info(`Server running on port ${env.port} [${env.nodeEnv}]`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down gracefully`);
    server.close(() => {
      process.exit(0);
    });
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

startServer().catch((error) => {
  logger.error("Failed to start server", { error });
  process.exit(1);
});
