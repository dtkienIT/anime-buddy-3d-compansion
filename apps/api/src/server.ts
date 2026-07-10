import { createApp } from "./app.js";
import { getEnv } from "./config/env.js";

const env = getEnv();
const app = await createApp(env);

try {
  await app.listen({ host: env.API_HOST, port: env.API_PORT });
  app.log.info(`API listening at http://${env.API_HOST}:${env.API_PORT}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
