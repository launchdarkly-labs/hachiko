"use strict";
const probot_js_1 = require("./probot.js");
const logger_js_1 = require("./utils/logger.js");
const logger = (0, logger_js_1.createLogger)("main");
module.exports = (app) => {
    logger.info("Hachiko GitHub App starting up");
    try {
        (0, probot_js_1.createProbotApp)(app);
        logger.info("Hachiko GitHub App initialized successfully");
    }
    catch (error) {
        logger.error({ error }, "Failed to initialize Hachiko GitHub App");
        throw error;
    }
};
//# sourceMappingURL=index.js.map