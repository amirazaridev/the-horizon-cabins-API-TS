import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import logger from "./config/logger.js";
import routes from "./routes/index.js";
import { errorHandler } from "./middlewares/errorHandler.middleware.js";
import { notFoundHandler } from "./middlewares/notFound.middleware.js";
import cookieParser from "cookie-parser";

function createApp(): Express {
  const app = express();

  //   app.use(helmet());
  //   app.use(cors());
  app.use(express.json());
  app.use(cookieParser());

  app.use("/api/v1", routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  logger.info("Express app initialized");
  return app;
}

export default createApp;
