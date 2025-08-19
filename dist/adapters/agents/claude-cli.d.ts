import type { AgentInput, AgentResult, PolicyConfig } from "../types.js";
import { BaseAgentAdapter } from "./base.js";
export interface ClaudeCliConfig {
    /** Docker image for Claude CLI */
    image: string;
    /** Command timeout in seconds */
    timeout: number;
    /** Memory limit in MB */
    memoryLimit?: number;
    /** CPU limit */
    cpuLimit?: number;
    /** API key for Claude */
    apiKey?: string | undefined;
}
/**
 * Claude CLI agent adapter with container sandboxing
 */
export declare class ClaudeCliAdapter extends BaseAgentAdapter {
    readonly name = "claude-cli";
    private readonly containerExecutor;
    private readonly claudeConfig;
    constructor(policyConfig: PolicyConfig, claudeConfig: ClaudeCliConfig);
    validate(): Promise<boolean>;
    execute(input: AgentInput): Promise<AgentResult>;
    getConfig(): Record<string, unknown>;
    /**
     * Write prompt file for Claude CLI
     */
    private writePromptFile;
}
//# sourceMappingURL=claude-cli.d.ts.map