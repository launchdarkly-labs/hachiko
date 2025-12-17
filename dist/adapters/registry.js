import { createLogger } from "../utils/logger.js";
// Cloud-based agents (recommended)
import { DevinCloudAdapter } from "./agents/devin-cloud.js";
import { CursorCloudAdapter } from "./agents/cursor-cloud.js";
import { CodexCloudAdapter } from "./agents/codex-cloud.js";
// CLI-based agents (deprecated - removed from imports)
// Development and testing
import { MockAgentAdapter } from "./agents/mock.js";
const logger = createLogger("agent-registry");
/**
 * Registry for managing agent adapters
 */
export class AgentRegistry {
    static instance = null;
    adapters = new Map();
    constructor() { }
    static getInstance() {
        if (!AgentRegistry.instance) {
            AgentRegistry.instance = new AgentRegistry();
        }
        return AgentRegistry.instance;
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
            networkIsolation: config.policy.network === "none"
                ? "full"
                : config.policy.network === "restricted"
                    ? "restricted"
                    : "none",
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
        const mockAdapter = new MockAgentAdapter(policyConfig, {
            successRate: 0.95,
            executionTime: 1000,
            modifyFiles: false,
        });
        await this.registerAdapter("mock", mockAdapter);
        logger.info({
            adapters: Array.from(this.adapters.keys()),
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
    async createAdapter(_name, agentConfig, policyConfig) {
        const { kind } = agentConfig;
        switch (kind) {
            case "cli": {
                logger.warn("CLI agents deprecated, please migrate to 'cloud' agents. Using mock adapter");
                return new MockAgentAdapter(policyConfig);
            }
            case "cloud": {
                // Modern cloud-based agents
                if (agentConfig.provider === "devin") {
                    const devinConfig = {
                        apiKey: process.env.DEVIN_API_KEY || agentConfig.apiKey,
                        baseUrl: agentConfig.baseUrl || "https://api.devin.ai",
                        apiVersion: agentConfig.apiVersion || "v1",
                        organizationId: agentConfig.organizationId,
                        timeout: agentConfig.timeout || 600, // 10 minutes
                        webhookUrl: agentConfig.webhookUrl,
                    };
                    return new DevinCloudAdapter(policyConfig, devinConfig);
                }
                if (agentConfig.provider === "cursor") {
                    const cursorConfig = {
                        apiKey: process.env.CURSOR_API_KEY || agentConfig.apiKey,
                        baseUrl: agentConfig.baseUrl || "https://api.cursor.com",
                        timeout: agentConfig.timeout || 1200, // 20 minutes
                        webhookUrl: agentConfig.webhookUrl,
                        repositoryUrl: agentConfig.repositoryUrl,
                        branch: agentConfig.branch || "main",
                    };
                    return new CursorCloudAdapter(policyConfig, cursorConfig);
                }
                if (agentConfig.provider === "codex") {
                    const codexConfig = {
                        apiKey: process.env.OPENAI_API_KEY || agentConfig.apiKey,
                        baseUrl: agentConfig.baseUrl || "https://api.openai.com",
                        model: agentConfig.model || "gpt-4-turbo",
                        timeout: agentConfig.timeout || 120, // 2 minutes
                        maxTokens: agentConfig.maxTokens || 4000,
                        temperature: agentConfig.temperature || 0.1,
                        repositoryUrl: agentConfig.repositoryUrl,
                    };
                    return new CodexCloudAdapter(policyConfig, codexConfig);
                }
                logger.warn({ provider: agentConfig.provider }, "Unknown cloud provider, using mock adapter");
                return new MockAgentAdapter(policyConfig);
            }
            case "api": {
                logger.warn("Legacy API agent type deprecated, use 'cloud' instead. Using mock adapter");
                return new MockAgentAdapter(policyConfig);
            }
            default: {
                logger.warn({ kind }, "Unknown agent kind, using mock adapter");
                return new MockAgentAdapter(policyConfig);
            }
        }
    }
}
/**
 * Factory function to get agent registry instance
 */
export function createAgentRegistry() {
    return AgentRegistry.getInstance();
}
/**
 * Initialize agents from configuration
 */
export async function initializeAgents(config) {
    const registry = createAgentRegistry();
    await registry.initializeFromConfig(config);
    return registry;
}
//# sourceMappingURL=registry.js.map