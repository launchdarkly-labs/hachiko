import type { AgentInput, AgentResult, PolicyConfig } from "../types.js";
import { BaseAgentAdapter } from "./base.js";
export interface CodexCloudConfig {
    /** OpenAI API key */
    apiKey: string;
    /** API base URL (default: https://api.openai.com) */
    baseUrl?: string;
    /** Model to use (default: gpt-4-turbo) */
    model?: string;
    /** Request timeout in seconds */
    timeout?: number;
    /** Max tokens for response */
    maxTokens?: number;
    /** Temperature for creativity (0-2) */
    temperature?: number;
    /** GitHub repository URL for context */
    repositoryUrl?: string;
}
/**
 * OpenAI Codex Cloud API adapter
 */
export declare class CodexCloudAdapter extends BaseAgentAdapter {
    readonly name = "codex-cloud";
    private readonly codexConfig;
    private readonly baseUrl;
    constructor(policyConfig: PolicyConfig, codexConfig: CodexCloudConfig);
    validate(): Promise<boolean>;
    execute(input: AgentInput): Promise<AgentResult>;
    getConfig(): Record<string, unknown>;
    /**
     * Get authentication headers for OpenAI API
     */
    private getAuthHeaders;
    /**
     * Build system prompt for Codex
     */
    private buildSystemPrompt;
    /**
     * Build user prompt with context
     */
    private buildUserPrompt;
    /**
     * Build function tools for file operations
     */
    private buildTools;
    /**
     * Read contents of specified files
     */
    private readFileContents;
    /**
     * Extract file operations from Codex response
     */
    private extractFileOperations;
    /**
     * Apply file operations to the repository
     */
    private applyFileOperations;
    /**
     * Format output from Codex response
     */
    private formatOutput;
}
//# sourceMappingURL=codex-cloud.d.ts.map