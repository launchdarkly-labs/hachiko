import { createProbotApp } from "./probot.js";
import { createLogger } from "./utils/logger.js";
const logger = createLogger("main");
export default (app) => {
  logger.info("Hachiko GitHub App starting up");
  try {
    createProbotApp(app);
    logger.info("Hachiko GitHub App initialized successfully");
  } catch (error) {
    logger.error({ error }, "Failed to initialize Hachiko GitHub App");
    throw error;
  }
};
//# sourceMappingURL=index.js.map
