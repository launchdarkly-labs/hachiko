/**
 * Agent adapter exports
 */

export { BaseAgentAdapter } from "./base.js"
export { ClaudeCliAdapter, type ClaudeCliConfig } from "./claude-cli.js"
export { CursorCliAdapter, type CursorCliConfig } from "./cursor-cli.js"
export { MockAgentAdapter, type MockAgentConfig } from "./mock.js"

// Re-export types
export type {
  AgentAdapter,
  AgentInput,
  AgentResult,
  ContainerConfig,
  PolicyConfig,
  ContainerContext,
  PolicyViolation,
  PolicyEnforcementResult,
} from "../types.js"
