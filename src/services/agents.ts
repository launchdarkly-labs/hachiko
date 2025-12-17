import { createAgentRegistry, initializeAgents } from "../adapters/registry.js";
import type { AgentInput, AgentResult } from "../adapters/types.js";
import type { HachikoConfig } from "../config/schema.js";
import type { ContextWithRepository } from "../types/context.js";
import { AgentExecutionError } from "../utils/errors.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("agent-service");

/**
 * Service for executing agents
 */
export class AgentService {
  private static instance: AgentService | null = null;
  private initialized = false;

  private constructor() {}

  static getInstance(): AgentService {
    if (!AgentService.instance) {
      AgentService.instance = new AgentService();
    }
    return AgentService.instance;
  }

  /**
   * Initialize the agent service with configuration
   */
  async initialize(config: HachikoConfig): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await initializeAgents(config);
      this.initialized = true;
      logger.info("Agent service initialized");
    } catch (error) {
      logger.error({ error }, "Failed to initialize agent service");
      throw error;
    }
  }

  /**
   * Execute an agent for a migration step
   */
  async executeAgent(agentName: string, input: AgentInput): Promise<AgentResult> {
    if (!this.initialized) {
      throw new AgentExecutionError("Agent service not initialized", agentName);
    }

    const registry = createAgentRegistry();
    const adapter = registry.getAdapter(agentName);

    if (!adapter) {
      throw new AgentExecutionError(`Agent ${agentName} not found`, agentName);
    }

    logger.info(
      {
        agentName,
        planId: input.planId,
        stepId: input.stepId,
        files: input.files.length,
      },
      "Executing agent"
    );

    try {
      const result = await adapter.execute(input);

      logger.info(
        {
          agentName,
          planId: input.planId,
          stepId: input.stepId,
          success: result.success,
          executionTime: result.executionTime,
          modifiedFiles: result.modifiedFiles.length,
          createdFiles: result.createdFiles.length,
        },
        "Agent execution completed"
      );

      return result;
    } catch (error) {
      logger.error(
        {
          error,
          agentName,
          planId: input.planId,
          stepId: input.stepId,
        },
        "Agent execution failed"
      );

      throw new AgentExecutionError(
        `Agent execution failed: ${error instanceof Error ? error.message : String(error)}`,
        agentName,
        {
          planId: input.planId,
          stepId: input.stepId,
          files: input.files,
        }
      );
    }
  }

  /**
   * Get available agents
   */
  getAvailableAgents(): string[] {
    if (!this.initialized) {
      return [];
    }

    const registry = createAgentRegistry();
    return registry.getAdapterNames();
  }

  /**
   * Validate all agents
   */
  async validateAgents(): Promise<Record<string, boolean>> {
    if (!this.initialized) {
      return {};
    }

    const registry = createAgentRegistry();
    return registry.validateAllAdapters();
  }

  /**
   * Check if an agent is available
   */
  isAgentAvailable(agentName: string): boolean {
    if (!this.initialized) {
      return false;
    }

    const registry = createAgentRegistry();
    return registry.hasAdapter(agentName);
  }
}

/**
 * Factory function to get agent service instance
 */
export function createAgentService(): AgentService {
  return AgentService.getInstance();
}

/**
 * Execute a migration step using the configured agent
 */
export async function executeMigrationStep(
  context: ContextWithRepository,
  planId: string,
  stepId: string,
  config: HachikoConfig,
  files: string[],
  prompt: string,
  chunk?: string
): Promise<AgentResult> {
  const agentService = createAgentService();

  // Ensure agent service is initialized
  await agentService.initialize(config);

  // Determine which agent to use
  const agentName = config.defaults.agent || "mock";

  // Prepare agent input
  const agentInput: AgentInput = {
    planId,
    stepId,
    chunk,
    repoPath: "/tmp/repo", // This would be the actual repository path in production
    files,
    prompt,
    timeout: config.policy.stepTimeoutMinutes * 60, // Convert to seconds
    metadata: {
      repository: context.payload.repository.full_name,
      actor: context.payload.sender?.login,
    },
  };

  return agentService.executeAgent(agentName, agentInput);
}
