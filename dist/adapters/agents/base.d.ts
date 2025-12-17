import type { AgentAdapter, AgentInput, AgentResult, PolicyConfig, PolicyEnforcementResult } from "../types.js";
/**
 * HTTP client for making requests to cloud agent APIs
 */
export interface HttpClient {
    get(url: string, options?: RequestInit): Promise<Response>;
    post(url: string, body?: unknown, options?: RequestInit): Promise<Response>;
    put(url: string, body?: unknown, options?: RequestInit): Promise<Response>;
    delete(url: string, options?: RequestInit): Promise<Response>;
}
/**
 * Default HTTP client implementation using fetch
 */
export declare class DefaultHttpClient implements HttpClient {
    get(url: string, options?: RequestInit): Promise<Response>;
    post(url: string, body?: unknown, options?: RequestInit): Promise<Response>;
    put(url: string, body?: unknown, options?: RequestInit): Promise<Response>;
    delete(url: string, options?: RequestInit): Promise<Response>;
}
/**
 * Base agent adapter with common functionality for cloud-based agents
 */
export declare abstract class BaseAgentAdapter implements AgentAdapter {
    protected readonly policyConfig: PolicyConfig;
    abstract readonly name: string;
    protected readonly httpClient: HttpClient;
    constructor(policyConfig: PolicyConfig, httpClient?: HttpClient);
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
    /**
     * Make authenticated HTTP request with error handling
     */
    protected makeAuthenticatedRequest<T>(method: "GET" | "POST" | "PUT" | "DELETE", url: string, options?: {
        body?: unknown;
        headers?: Record<string, string>;
        timeout?: number;
    }): Promise<T>;
    /**
     * Poll for completion status with exponential backoff
     */
    protected pollForCompletion<T>(statusUrl: string, options?: {
        headers?: Record<string, string>;
        maxAttempts?: number;
        initialDelay?: number;
        maxDelay?: number;
        isComplete?: (response: T) => boolean;
        timeout?: number;
    }): Promise<T>;
}
//# sourceMappingURL=base.d.ts.map