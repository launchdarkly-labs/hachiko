import type { HachikoConfig } from "../config/schema.js";
import type { AgentAdapter } from "./types.js";
/**
 * Registry for managing agent adapters
 */
export declare class AgentRegistry {
  private static instance;
  private adapters;
  private constructor();
  static getInstance(): AgentRegistry;
  /**
   * Initialize agents from configuration
   */
  initializeFromConfig(config: HachikoConfig): Promise<void>;
  /**
   * Register an adapter
   */
  registerAdapter(name: string, adapter: AgentAdapter): Promise<void>;
  /**
   * Get an adapter by name
   */
  getAdapter(name: string): AgentAdapter | undefined;
  /**
   * Get all registered adapters
   */
  getAllAdapters(): Map<string, AgentAdapter>;
  /**
   * Check if an adapter is registered
   */
  hasAdapter(name: string): boolean;
  /**
   * Get adapter names
   */
  getAdapterNames(): string[];
  /**
   * Validate all adapters
   */
  validateAllAdapters(): Promise<Record<string, boolean>>;
  /**
   * Create adapter instance based on configuration
   */
  private createAdapter;
}
/**
 * Factory function to get agent registry instance
 */
export declare function createAgentRegistry(): AgentRegistry;
/**
 * Initialize agents from configuration
 */
export declare function initializeAgents(config: HachikoConfig): Promise<AgentRegistry>;
//# sourceMappingURL=registry.d.ts.map
