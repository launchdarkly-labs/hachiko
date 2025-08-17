"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentRegistry = void 0;
exports.createAgentRegistry = createAgentRegistry;
exports.initializeAgents = initializeAgents;
const claude_cli_js_1 = require("./agents/claude-cli.js");
const cursor_cli_js_1 = require("./agents/cursor-cli.js");
const mock_js_1 = require("./agents/mock.js");
const logger_js_1 = require("../utils/logger.js");
const logger = (0, logger_js_1.createLogger)("agent-registry");
/**
 * Registry for managing agent adapters
 */
class AgentRegistry {
    static instance = null;
    adapters = new Map();
    constructor() { }
    static getInstance() {
        if (!this.instance) {
            this.instance = new AgentRegistry();
        }
        return this.instance;
    }
    /**
     * Initialize agents from configuration
     */
    async initializeFromConfig(config) {
        logger.info("Initializing agent adapters from configuration");
        // Convert global policy config to adapter format
        const policyConfig = {
            allowedPaths: config.policy.allowlistGlobs,
            blockedPaths: config.policy.riskyGlobs,
            maxFileSize: 10 * 1024 * 1024, // 10MB default
            dangerousPatterns: ["rm -rf", "sudo", "curl", "wget", "exec", "eval"],
            networkIsolation: config.policy.network === "none" ? "full" :
                config.policy.network === "restricted" ? "restricted" : "none",
        };
        // Initialize configured agents
        for (const [agentName, agentConfig] of Object.entries(config.agents)) {
            try {
                const adapter = await this.createAdapter(agentName, agentConfig, policyConfig);
                if (adapter) {
                    await this.registerAdapter(agentName, adapter);
                }
            }
            catch (error) {
                logger.error({ error, agentName }, "Failed to initialize agent adapter");
            }
        }
        // Always register mock adapter for testing
        const mockAdapter = new mock_js_1.MockAgentAdapter(policyConfig, {
            successRate: 0.95,
            executionTime: 1000,
            modifyFiles: false,
        });
        await this.registerAdapter("mock", mockAdapter);
        logger.info({
            adapters: Array.from(this.adapters.keys())
        }, "Agent adapters initialized");
    }
    /**
     * Register an adapter
     */
    async registerAdapter(name, adapter) {
        try {
            const isValid = await adapter.validate();
            if (!isValid) {
                logger.warn({ name }, "Agent adapter validation failed, registering anyway");
            }
            this.adapters.set(name, adapter);
            logger.debug({ name, config: adapter.getConfig() }, "Registered agent adapter");
        }
        catch (error) {
            logger.error({ error, name }, "Failed to register agent adapter");
            throw error;
        }
    }
    /**
     * Get an adapter by name
     */
    getAdapter(name) {
        return this.adapters.get(name);
    }
    /**
     * Get all registered adapters
     */
    getAllAdapters() {
        return new Map(this.adapters);
    }
    /**
     * Check if an adapter is registered
     */
    hasAdapter(name) {
        return this.adapters.has(name);
    }
    /**
     * Get adapter names
     */
    getAdapterNames() {
        return Array.from(this.adapters.keys());
    }
    /**
     * Validate all adapters
     */
    async validateAllAdapters() {
        const results = {};
        for (const [name, adapter] of this.adapters) {
            try {
                results[name] = await adapter.validate();
            }
            catch (error) {
                logger.error({ error, name }, "Adapter validation failed");
                results[name] = false;
            }
        }
        return results;
    }
    /**
     * Create adapter instance based on configuration
     */
    async createAdapter(name, agentConfig, policyConfig) {
        const { kind } = agentConfig;
        switch (kind) {
            case "cli": {
                if (agentConfig.command === "claude") {
                    const claudeConfig = {
                        image: "anthropic/claude-cli:latest",
                        timeout: agentConfig.timeout || 300, // 5 minutes
                        memoryLimit: 1024, // 1GB
                        cpuLimit: 1.0,
                        apiKey: process.env.ANTHROPIC_API_KEY,
                    };
                    return new claude_cli_js_1.ClaudeCliAdapter(policyConfig, claudeConfig);
                }
                if (agentConfig.command === "cursor") {
                    const cursorConfig = {
                        image: "cursor/cli:latest",
                        timeout: agentConfig.timeout || 300, // 5 minutes
                        memoryLimit: 1024, // 1GB
                        cpuLimit: 1.0,
                        apiKey: process.env.CURSOR_API_KEY,
                    };
                    return new cursor_cli_js_1.CursorCliAdapter(policyConfig, cursorConfig);
                }
                logger.warn({ command: agentConfig.command }, "Unknown CLI command, using mock adapter");
                return new mock_js_1.MockAgentAdapter(policyConfig);
            }
            case "api": {
                logger.warn("API agents not yet implemented, using mock adapter");
                return new mock_js_1.MockAgentAdapter(policyConfig);
            }
            default: {
                logger.warn({ kind }, "Unknown agent kind, using mock adapter");
                return new mock_js_1.MockAgentAdapter(policyConfig);
            }
        }
    }
}
exports.AgentRegistry = AgentRegistry;
/**
 * Factory function to get agent registry instance
 */
function createAgentRegistry() {
    return AgentRegistry.getInstance();
}
/**
 * Initialize agents from configuration
 */
async function initializeAgents(config) {
    const registry = createAgentRegistry();
    await registry.initializeFromConfig(config);
    return registry;
}
//# sourceMappingURL=registry.js.map