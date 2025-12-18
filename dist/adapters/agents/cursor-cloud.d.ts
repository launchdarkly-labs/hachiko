import type { AgentInput, AgentResult, PolicyConfig } from "../types.js";
import { BaseAgentAdapter } from "./base.js";
export interface CursorCloudConfig {
    /** API base URL (default: https://api.cursor.com) */
    baseUrl?: string;
    /** API key for authentication */
    apiKey: string;
    /** Request timeout in seconds */
    timeout?: number;
    /** Webhook URL for completion notifications */
    webhookUrl?: string;
    /** GitHub repository URL */
    repositoryUrl?: string;
    /** Branch to work on (default: main) */
    branch?: string;
}
/**
 * Cursor Cloud Agent API adapter
 */
export declare class CursorCloudAdapter extends BaseAgentAdapter {
    readonly name = "cursor-cloud";
    private readonly cursorConfig;
    private readonly baseUrl;
    constructor(policyConfig: PolicyConfig, cursorConfig: CursorCloudConfig);
    validate(): Promise<boolean>;
    execute(input: AgentInput): Promise<AgentResult>;
    /**
     * Add follow-up instruction to a running agent
     */
    addInstruction(agentId: string, instruction: string): Promise<void>;
    getConfig(): Record<string, unknown>;
    /**
     * Get authentication headers for Cursor API
     */
    private getAuthHeaders;
    /**
     * Build comprehensive task description for Cursor
     */
    private buildTask;
    /**
     * Infer repository URL from local path
     */
    private inferRepositoryUrl;
    /**
     * Format output from completed agent
     */
    private formatOutput;
}
//# sourceMappingURL=cursor-cloud.d.ts.map