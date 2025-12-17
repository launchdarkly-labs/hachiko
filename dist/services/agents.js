import { createAgentRegistry, initializeAgents } from "../adapters/registry.js";
import { AgentExecutionError } from "../utils/errors.js";
import { createLogger } from "../utils/logger.js";
const logger = createLogger("agent-service");
/**
 * Service for executing agents
 */
export class AgentService {
  static instance = null;
  initialized = false;
  constructor() {}
  static getInstance() {
    if (!AgentService.instance) {
      AgentService.instance = new AgentService();
    }
    return AgentService.instance;
  }
  /**
   * Initialize the agent service with configuration
   */
  async initialize(config) {
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
  async executeAgent(agentName, input) {
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
  getAvailableAgents() {
    if (!this.initialized) {
      return [];
    }
    const registry = createAgentRegistry();
    return registry.getAdapterNames();
  }
  /**
   * Validate all agents
   */
  async validateAgents() {
    if (!this.initialized) {
      return {};
    }
    const registry = createAgentRegistry();
    return registry.validateAllAdapters();
  }
  /**
   * Check if an agent is available
   */
  isAgentAvailable(agentName) {
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
export function createAgentService() {
  return AgentService.getInstance();
}
/**
 * Execute a migration step using the configured agent
 */
export async function executeMigrationStep(context, planId, stepId, config, files, prompt, chunk) {
  const agentService = createAgentService();
  // Ensure agent service is initialized
  await agentService.initialize(config);
  // Determine which agent to use
  const agentName = config.defaults.agent || "mock";
  // Prepare agent input
  const agentInput = {
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
//# sourceMappingURL=agents.js.map
