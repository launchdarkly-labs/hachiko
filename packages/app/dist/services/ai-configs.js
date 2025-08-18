"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIConfigManager = void 0;
exports.createAIConfigManager = createAIConfigManager;
exports.initializeAIConfigs = initializeAIConfigs;
const tslib_1 = require("tslib");
const node_server_sdk_1 = tslib_1.__importDefault(require("@launchdarkly/node-server-sdk"));
const errors_js_1 = require("../utils/errors.js");
const logger_js_1 = require("../utils/logger.js");
const logger = (0, logger_js_1.createLogger)("ai-configs");
/**
 * AI configuration manager using LaunchDarkly for dynamic prompt management
 */
class AIConfigManager {
    static instance = null;
    ldClient = null;
    config = null;
    initialized = false;
    constructor() { }
    static getInstance() {
        if (!AIConfigManager.instance) {
            AIConfigManager.instance = new AIConfigManager();
        }
        return AIConfigManager.instance;
    }
    /**
     * Initialize the AI config manager
     */
    async initialize(config) {
        if (this.initialized) {
            return;
        }
        this.config = config;
        if (config.aiConfigs.provider === "launchdarkly") {
            await this.initializeLaunchDarkly();
        }
        this.initialized = true;
        logger.info({ provider: config.aiConfigs.provider }, "AI config manager initialized");
    }
    /**
     * Get prompt configuration for a migration step
     */
    async getPromptConfig(planId, stepId, context) {
        if (!this.initialized || !this.config) {
            throw new errors_js_1.ConfigurationError("AI config manager not initialized");
        }
        const flagKey = this.buildFlagKey(planId, stepId);
        if (this.config.aiConfigs.provider === "launchdarkly" && this.ldClient) {
            return this.getPromptFromLaunchDarkly(flagKey, context);
        }
        return this.getPromptFromLocal(planId, stepId);
    }
    /**
     * Get available prompt configurations
     */
    async getAvailablePrompts() {
        if (!this.initialized || !this.config) {
            throw new errors_js_1.ConfigurationError("AI config manager not initialized");
        }
        if (this.config.aiConfigs.provider === "launchdarkly") {
            // In a real implementation, this would fetch all flags matching our pattern
            // For now, return empty object as LaunchDarkly doesn't have a simple way to list all flags
            logger.warn("Listing LaunchDarkly prompts not implemented");
            return {};
        }
        return this.getLocalPrompts();
    }
    /**
     * Test a prompt configuration
     */
    async testPromptConfig(config, context) {
        const errors = [];
        // Validate template
        if (!config.template || config.template.trim().length === 0) {
            errors.push("Template cannot be empty");
        }
        // Validate version
        if (!config.version) {
            errors.push("Version is required");
        }
        // Test template interpolation
        try {
            this.interpolateTemplate(config.template, context);
        }
        catch (error) {
            errors.push(`Template interpolation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        // Validate parameters
        if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 2)) {
            errors.push("Temperature must be between 0 and 2");
        }
        if (config.maxTokens !== undefined && config.maxTokens <= 0) {
            errors.push("Max tokens must be positive");
        }
        return {
            isValid: errors.length === 0,
            errors,
        };
    }
    /**
     * Interpolate prompt template with context
     */
    interpolateTemplate(template, context) {
        let result = template;
        // Replace context variables
        const variables = {
            planId: context.planId,
            stepId: context.stepId,
            repository: context.repository.name,
            owner: context.repository.owner,
            defaultBranch: context.repository.defaultBranch,
            user: context.user?.login || "unknown",
            environment: context.environment,
            ...context.metadata,
        };
        for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
            result = result.replace(regex, String(value));
        }
        // Check for unresolved variables
        const unresolvedMatches = result.match(/\{\{\s*\w+\s*\}\}/g);
        if (unresolvedMatches) {
            throw new Error(`Unresolved template variables: ${unresolvedMatches.join(", ")}`);
        }
        return result;
    }
    /**
     * Close the AI config manager
     */
    async close() {
        if (this.ldClient) {
            await this.ldClient.close();
            this.ldClient = null;
        }
        this.initialized = false;
        logger.info("AI config manager closed");
    }
    /**
     * Initialize LaunchDarkly client
     */
    async initializeLaunchDarkly() {
        const sdkKey = process.env.LAUNCHDARKLY_SDK_KEY;
        if (!sdkKey) {
            throw new errors_js_1.ConfigurationError("LAUNCHDARKLY_SDK_KEY environment variable is required");
        }
        try {
            this.ldClient = node_server_sdk_1.default.init(sdkKey, {
                stream: true,
                offline: process.env.NODE_ENV === "test",
            });
            await this.ldClient.waitForInitialization({ timeout: 10 });
            logger.info("LaunchDarkly client initialized");
        }
        catch (error) {
            logger.error({ error }, "Failed to initialize LaunchDarkly client");
            throw new errors_js_1.ConfigurationError(`LaunchDarkly initialization failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Get prompt configuration from LaunchDarkly
     */
    async getPromptFromLaunchDarkly(flagKey, context) {
        if (!this.ldClient || !this.config) {
            throw new errors_js_1.ConfigurationError("LaunchDarkly client not initialized");
        }
        const ldUser = {
            key: `${context.repository.owner}/${context.repository.name}`,
            custom: {
                planId: context.planId,
                stepId: context.stepId,
                repository: context.repository.name,
                owner: context.repository.owner,
                environment: context.environment,
                ...(context.user?.login && { userLogin: context.user.login }),
                ...(context.user?.type && { userType: context.user.type }),
                ...context.metadata,
            },
        };
        try {
            const flagValue = await this.ldClient.variation(flagKey, ldUser, null);
            if (!flagValue) {
                logger.debug({ flagKey }, "No LaunchDarkly flag found, using default");
                return this.getDefaultPromptConfig();
            }
            // Parse the flag value as AI prompt config
            if (typeof flagValue === "string") {
                return JSON.parse(flagValue);
            }
            if (typeof flagValue === "object") {
                return flagValue;
            }
            throw new Error(`Invalid flag value type: ${typeof flagValue}`);
        }
        catch (error) {
            logger.error({ error, flagKey }, "Failed to get prompt from LaunchDarkly");
            return this.getDefaultPromptConfig();
        }
    }
    /**
     * Get prompt configuration from local files
     */
    async getPromptFromLocal(planId, stepId) {
        if (!this.config) {
            throw new errors_js_1.ConfigurationError("Config not available");
        }
        if (this.config.aiConfigs.localPromptsDir) {
            try {
                const fs = await import("node:fs/promises");
                const { join } = await import("node:path");
                const promptPath = join(this.config.aiConfigs.localPromptsDir, `${planId}-${stepId}.json`);
                const promptData = await fs.readFile(promptPath, "utf-8");
                return JSON.parse(promptData);
            }
            catch (error) {
                logger.debug({ error, planId, stepId }, "Local prompt file not found, using default");
            }
        }
        return this.getDefaultPromptConfig();
    }
    /**
     * Get local prompts from files
     */
    async getLocalPrompts() {
        if (!this.config?.aiConfigs.localPromptsDir) {
            return {};
        }
        try {
            const fs = await import("node:fs/promises");
            const { join } = await import("node:path");
            const { glob } = await import("glob");
            const pattern = join(this.config.aiConfigs.localPromptsDir, "*.json");
            const files = await glob(pattern);
            const prompts = {};
            for (const file of files) {
                try {
                    const content = await fs.readFile(file, "utf-8");
                    const config = JSON.parse(content);
                    const fileName = file.split("/").pop()?.replace(".json", "") || "unknown";
                    prompts[fileName] = config;
                }
                catch (error) {
                    logger.warn({ error, file }, "Failed to load local prompt file");
                }
            }
            return prompts;
        }
        catch (error) {
            logger.error({ error }, "Failed to load local prompts");
            return {};
        }
    }
    /**
     * Build LaunchDarkly flag key
     */
    buildFlagKey(planId, stepId) {
        if (!this.config) {
            throw new errors_js_1.ConfigurationError("Config not available");
        }
        const prefix = this.config.aiConfigs.flagKeyPrefix;
        return `${prefix}${planId}_${stepId}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    }
    /**
     * Get default prompt configuration
     */
    getDefaultPromptConfig() {
        return {
            template: `You are a helpful assistant for performing code migrations.

Plan: {{planId}}
Step: {{stepId}}
Repository: {{owner}}/{{repository}}

Please help with the following migration task. Be careful to only make the necessary changes and preserve existing functionality.`,
            version: "1.0.0",
            temperature: 0.1,
            model: "gpt-4",
            maxTokens: 4000,
        };
    }
}
exports.AIConfigManager = AIConfigManager;
/**
 * Factory function to get AI config manager instance
 */
function createAIConfigManager() {
    return AIConfigManager.getInstance();
}
/**
 * Initialize AI configs from configuration
 */
async function initializeAIConfigs(config) {
    const manager = createAIConfigManager();
    await manager.initialize(config);
    return manager;
}
//# sourceMappingURL=ai-configs.js.map