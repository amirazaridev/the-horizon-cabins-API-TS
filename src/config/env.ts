import "dotenv/config";

const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT) || 3000,
};

export default env;
