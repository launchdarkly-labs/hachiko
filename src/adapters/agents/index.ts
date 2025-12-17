/**
 * Agent adapter exports
 */

export { BaseAgentAdapter, type HttpClient, DefaultHttpClient } from "./base.js";

// Cloud-based agents (recommended)
export { DevinCloudAdapter, type DevinCloudConfig } from "./devin-cloud.js";
export { CursorCloudAdapter, type CursorCloudConfig } from "./cursor-cloud.js";
export { CodexCloudAdapter, type CodexCloudConfig } from "./codex-cloud.js";

// CLI-based agents (deprecated - files moved to .deprecated)

// Development and testing
export { MockAgentAdapter, type MockAgentConfig } from "./mock.js";

// Re-export types (container types removed)
export type {
  AgentAdapter,
  AgentInput,
  AgentResult,
  PolicyConfig,
  PolicyViolation,
  PolicyEnforcementResult,
} from "../types.js";
