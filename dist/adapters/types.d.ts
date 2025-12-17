/**
 * Base types for agent adapters
 */
export interface AgentInput {
    /** Migration plan ID */
    planId: string;
    /** Current step ID */
    stepId: string;
    /** Chunk identifier (optional) */
    chunk?: string | undefined;
    /** Repository root path */
    repoPath: string;
    /** Files to operate on */
    files: string[];
    /** Agent prompt/instructions */
    prompt: string;
    /** Execution timeout in seconds */
    timeout?: number;
    /** Additional metadata */
    metadata?: Record<string, unknown>;
}
export interface AgentResult {
    /** Whether the agent execution was successful */
    success: boolean;
    /** Files that were modified */
    modifiedFiles: string[];
    /** Files that were created */
    createdFiles: string[];
    /** Files that were deleted */
    deletedFiles: string[];
    /** Agent output/logs */
    output: string;
    /** Error message if execution failed */
    error?: string | undefined;
    /** Exit code from agent execution */
    exitCode: number;
    /** Execution time in milliseconds */
    executionTime: number;
}
export interface PolicyConfig {
    /** Allowed file patterns (glob patterns) */
    allowedPaths: string[];
    /** Blocked file patterns (glob patterns) */
    blockedPaths: string[];
    /** Maximum file size in bytes */
    maxFileSize: number;
    /** Dangerous command patterns */
    dangerousPatterns: string[];
    /** Network isolation level */
    networkIsolation: "none" | "restricted" | "full";
}
/**
 * Base agent adapter interface
 */
export interface AgentAdapter {
    /** Adapter name/identifier */
    readonly name: string;
    /** Execute the agent with given input */
    execute(input: AgentInput): Promise<AgentResult>;
    /** Validate that the agent is available and configured correctly */
    validate(): Promise<boolean>;
    /** Get adapter-specific configuration */
    getConfig(): Record<string, unknown>;
}
/**
 * Policy enforcement result
 */
export interface PolicyViolation {
    /** Type of violation */
    type: "file_access" | "command_execution" | "network_access" | "file_size";
    /** Violation message */
    message: string;
    /** Violating pattern/path */
    pattern: string;
    /** Severity level */
    severity: "warning" | "error";
}
export interface PolicyEnforcementResult {
    /** Whether the operation is allowed */
    allowed: boolean;
    /** List of violations found */
    violations: PolicyViolation[];
}
//# sourceMappingURL=types.d.ts.map