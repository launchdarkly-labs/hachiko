import type { HachikoConfig } from "../config/schema.js";
import { createLogger } from "../utils/logger.js";

// Cloud-based agents (recommended)
import { DevinCloudAdapter, type DevinCloudConfig } from "./agents/devin-cloud.js";
import { CursorCloudAdapter, type CursorCloudConfig } from "./agents/cursor-cloud.js";
import { CodexCloudAdapter, type CodexCloudConfig } from "./agents/codex-cloud.js";

// CLI-based agents (deprecated - removed from imports)

// Development and testing
import { MockAgentAdapter } from "./agents/mock.js";

import type { AgentAdapter, PolicyConfig } from "./types.js";

const logger = createLogger("agent-registry");

/**
 * Registry for managing agent adapters
 */
export class AgentRegistry {
  private static instance: AgentRegistry | null = null;
  private adapters = new Map<string, AgentAdapter>();

  private constructor() {}

  static getInstance(): AgentRegistry {
    if (!AgentRegistry.instance) {
      AgentRegistry.instance = new AgentRegistry();
    }
    return AgentRegistry.instance;
  }

  /**
   * Initialize agents from configuration
   */
  async initializeFromConfig(config: HachikoConfig): Promise<void> {
    logger.info("Initializing agent adapters from configuration");

    // Convert global policy config to adapter format
    const policyConfig: PolicyConfig = {
      allowedPaths: config.policy.allowlistGlobs,
      blockedPaths: config.policy.riskyGlobs,
      maxFileSize: 10 * 1024 * 1024, // 10MB default
      dangerousPatterns: ["rm -rf", "sudo", "curl", "wget", "exec", "eval"],
      networkIsolation:
        config.policy.network === "none"
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
      } catch (error) {
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

    logger.info(
      {
        adapters: Array.from(this.adapters.keys()),
      },
      "Agent adapters initialized"
    );
  }

  /**
   * Register an adapter
   */
  async registerAdapter(name: string, adapter: AgentAdapter): Promise<void> {
    try {
      const isValid = await adapter.validate();
      if (!isValid) {
        logger.warn({ name }, "Agent adapter validation failed, registering anyway");
      }

      this.adapters.set(name, adapter);
      logger.debug({ name, config: adapter.getConfig() }, "Registered agent adapter");
    } catch (error) {
      logger.error({ error, name }, "Failed to register agent adapter");
      throw error;
    }
  }

  /**
   * Get an adapter by name
   */
  getAdapter(name: string): AgentAdapter | undefined {
    return this.adapters.get(name);
  }

  /**
   * Get all registered adapters
   */
  getAllAdapters(): Map<string, AgentAdapter> {
    return new Map(this.adapters);
  }

  /**
   * Check if an adapter is registered
   */
  hasAdapter(name: string): boolean {
    return this.adapters.has(name);
  }

  /**
   * Get adapter names
   */
  getAdapterNames(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Validate all adapters
   */
  async validateAllAdapters(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    for (const [name, adapter] of this.adapters) {
      try {
        results[name] = await adapter.validate();
      } catch (error) {
        logger.error({ error, name }, "Adapter validation failed");
        results[name] = false;
      }
    }

    return results;
  }

  /**
   * Create adapter instance based on configuration
   */
  private async createAdapter(
    _name: string,
    agentConfig: any,
    policyConfig: PolicyConfig
  ): Promise<AgentAdapter | null> {
    const { kind } = agentConfig;

    switch (kind) {
      case "cli": {
        logger.warn("CLI agents deprecated, please migrate to 'cloud' agents. Using mock adapter");
        return new MockAgentAdapter(policyConfig);
      }

      case "cloud": {
        // Modern cloud-based agents
        if (agentConfig.provider === "devin") {
          const devinConfig: DevinCloudConfig = {
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
          const cursorConfig: CursorCloudConfig = {
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
          const codexConfig: CodexCloudConfig = {
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

        logger.warn(
          { provider: agentConfig.provider },
          "Unknown cloud provider, using mock adapter"
        );
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
export function createAgentRegistry(): AgentRegistry {
  return AgentRegistry.getInstance();
}

/**
 * Initialize agents from configuration
 */
export async function initializeAgents(config: HachikoConfig): Promise<AgentRegistry> {
  const registry = createAgentRegistry();
  await registry.initializeFromConfig(config);
  return registry;
}
