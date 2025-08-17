"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadHachikoConfig = loadHachikoConfig;
exports.validateConfig = validateConfig;
const tslib_1 = require("tslib");
const js_yaml_1 = tslib_1.__importDefault(require("js-yaml"));
const schema_js_1 = require("../config/schema.js");
const errors_js_1 = require("../utils/errors.js");
const logger_js_1 = require("../utils/logger.js");
const logger = (0, logger_js_1.createLogger)("config");
const DEFAULT_CONFIG_PATH = ".hachiko.yml";
/**
 * Load and validate Hachiko configuration from repository
 */
async function loadHachikoConfig(context) {
    try {
        // Try to get the config file from the repository
        const configFile = await context.octokit.repos.getContent({
            owner: context.payload.repository.owner.login,
            repo: context.payload.repository.name,
            path: DEFAULT_CONFIG_PATH,
        });
        if (Array.isArray(configFile.data) || configFile.data.type !== "file") {
            throw new errors_js_1.ConfigurationError(`${DEFAULT_CONFIG_PATH} is not a file`);
        }
        // Decode base64 content
        const content = Buffer.from(configFile.data.content, "base64").toString("utf-8");
        // Parse YAML
        const rawConfig = js_yaml_1.default.load(content);
        // Validate and apply defaults
        const config = (0, schema_js_1.validateHachikoConfig)(rawConfig);
        logger.info({
            configPath: DEFAULT_CONFIG_PATH,
            planDirectory: config.plans.directory,
            agents: Object.keys(config.agents),
        }, "Loaded Hachiko configuration");
        return config;
    }
    catch (error) {
        if (error instanceof errors_js_1.ConfigurationError) {
            throw error;
        }
        // If config file doesn't exist, use defaults
        if (error && typeof error === "object" && "status" in error && error.status === 404) {
            logger.info("No .hachiko.yml found, using default configuration");
            return schema_js_1.HachikoConfigSchema.parse({});
        }
        logger.error({ error }, "Failed to load Hachiko configuration");
        throw new errors_js_1.ConfigurationError(`Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`, { configPath: DEFAULT_CONFIG_PATH });
    }
}
/**
 * Validate a configuration object without loading from repository
 */
function validateConfig(rawConfig) {
    try {
        return (0, schema_js_1.validateHachikoConfig)(rawConfig);
    }
    catch (error) {
        throw new errors_js_1.ConfigurationError(`Invalid configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
}
//# sourceMappingURL=config.js.map