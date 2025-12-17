import type { AgentInput, AgentResult } from "../adapters/types.js";
import type { HachikoConfig } from "../config/schema.js";
import type { ContextWithRepository } from "../types/context.js";
/**
 * Service for executing agents
 */
export declare class AgentService {
  private static instance;
  private initialized;
  private constructor();
  static getInstance(): AgentService;
  /**
   * Initialize the agent service with configuration
   */
  initialize(config: HachikoConfig): Promise<void>;
  /**
   * Execute an agent for a migration step
   */
  executeAgent(agentName: string, input: AgentInput): Promise<AgentResult>;
  /**
   * Get available agents
   */
  getAvailableAgents(): string[];
  /**
   * Validate all agents
   */
  validateAgents(): Promise<Record<string, boolean>>;
  /**
   * Check if an agent is available
   */
  isAgentAvailable(agentName: string): boolean;
}
/**
 * Factory function to get agent service instance
 */
export declare function createAgentService(): AgentService;
/**
 * Execute a migration step using the configured agent
 */
export declare function executeMigrationStep(
  context: ContextWithRepository,
  planId: string,
  stepId: string,
  config: HachikoConfig,
  files: string[],
  prompt: string,
  chunk?: string
): Promise<AgentResult>;
//# sourceMappingURL=agents.d.ts.map
