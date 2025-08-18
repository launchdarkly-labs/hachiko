import type { AgentAdapter, AgentInput, AgentResult, PolicyConfig, PolicyEnforcementResult } from "../types.js";
/**
 * Base agent adapter with common functionality
 */
export declare abstract class BaseAgentAdapter implements AgentAdapter {
    protected readonly policyConfig: PolicyConfig;
    abstract readonly name: string;
    constructor(policyConfig: PolicyConfig);
    abstract execute(input: AgentInput): Promise<AgentResult>;
    abstract validate(): Promise<boolean>;
    abstract getConfig(): Record<string, unknown>;
    /**
     * Enforce policy restrictions on file access
     */
    protected enforceFilePolicy(files: string[], repoPath: string): Promise<PolicyEnforcementResult>;
    /**
     * Enforce policy restrictions on command execution
     */
    protected enforceCommandPolicy(command: string): PolicyEnforcementResult;
    /**
     * Get relative path from repository root
     */
    protected getRelativePath(filePath: string, repoPath: string): string;
    /**
     * Prepare safe working directory with only allowed files
     */
    protected prepareSafeWorkspace(input: AgentInput): Promise<string>;
    /**
     * Copy results back from workspace to repository
     */
    protected copyResultsBack(workspacePath: string, repoPath: string, allowedFiles: string[]): Promise<{
        modifiedFiles: string[];
        createdFiles: string[];
        deletedFiles: string[];
    }>;
    /**
     * Clean up workspace
     */
    protected cleanupWorkspace(workspacePath: string): Promise<void>;
}
//# sourceMappingURL=base.d.ts.map