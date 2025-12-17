import type { AgentInput, AgentResult, PolicyConfig } from "../types.js";
import { BaseAgentAdapter } from "./base.js";
export interface CursorCliConfig {
  /** Docker image for Cursor CLI */
  image: string;
  /** Command timeout in seconds */
  timeout: number;
  /** Memory limit in MB */
  memoryLimit?: number;
  /** CPU limit */
  cpuLimit?: number;
  /** API key for Cursor */
  apiKey?: string | undefined;
}
/**
 * Cursor CLI agent adapter with container sandboxing
 */
export declare class CursorCliAdapter extends BaseAgentAdapter {
  readonly name = "cursor-cli";
  private readonly containerExecutor;
  private readonly cursorConfig;
  constructor(policyConfig: PolicyConfig, cursorConfig: CursorCliConfig);
  validate(): Promise<boolean>;
  execute(input: AgentInput): Promise<AgentResult>;
  getConfig(): Record<string, unknown>;
  /**
   * Write instruction file for Cursor CLI
   */
  private writeInstructionFile;
}
//# sourceMappingURL=cursor-cli.d.ts.map
