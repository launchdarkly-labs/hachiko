/**
 * Base error class for all Hachiko-specific errors.
 *
 * Provides a structured error format with an error code and optional details
 * object for additional context. All other Hachiko error classes extend this.
 *
 * @param message - Human-readable error description
 * @param code - Machine-readable error code for programmatic handling
 * @param details - Optional key-value pairs providing additional error context
 *
 * @example
 * ```typescript
 * throw new HachikoError('Something went wrong', 'GENERIC_ERROR', { step: 3 });
 * ```
 */
export declare class HachikoError extends Error {
    readonly code: string;
    readonly details: Record<string, unknown> | undefined;
    constructor(message: string, code: string, details?: Record<string, unknown>);
}
/**
 * Error thrown when Hachiko encounters invalid or missing configuration.
 *
 * @param message - Description of the configuration issue
 * @param details - Optional additional context about the configuration error
 *
 * @example
 * ```typescript
 * throw new ConfigurationError('Missing API key', { envVar: 'CURSOR_API_KEY' });
 * ```
 */
export declare class ConfigurationError extends HachikoError {
    constructor(message: string, details?: Record<string, unknown>);
}
/**
 * Error thrown when an agent attempts to violate a file access policy.
 *
 * @param message - Description of the policy violation
 * @param violations - List of specific policy rules that were violated
 * @param details - Optional additional context about the violation
 *
 * @example
 * ```typescript
 * throw new PolicyViolationError(
 *   'Agent attempted to modify protected files',
 *   ['.env', 'credentials.json'],
 *   { agent: 'cursor' }
 * );
 * ```
 */
export declare class PolicyViolationError extends HachikoError {
    constructor(message: string, violations: string[], details?: Record<string, unknown>);
}
/**
 * Error thrown when an AI agent fails during migration step execution.
 *
 * @param message - Description of the execution failure
 * @param agentName - The name of the agent that failed (e.g., "cursor", "devin")
 * @param details - Optional additional context about the failure
 *
 * @example
 * ```typescript
 * throw new AgentExecutionError(
 *   'Agent timed out after 30 minutes',
 *   'cursor',
 *   { timeout: 1800000 }
 * );
 * ```
 */
export declare class AgentExecutionError extends HachikoError {
    constructor(message: string, agentName: string, details?: Record<string, unknown>);
}
/**
 * Error thrown when a migration is in an invalid or unexpected state.
 *
 * @param message - Description of the state error
 * @param planId - The migration plan identifier
 * @param currentState - The current state of the migration when the error occurred
 * @param details - Optional additional context about the state error
 *
 * @example
 * ```typescript
 * throw new MigrationStateError(
 *   'Cannot execute step 3 while step 2 is still in progress',
 *   'add-jsdoc-comments',
 *   'active',
 *   { currentStep: 2, requestedStep: 3 }
 * );
 * ```
 */
export declare class MigrationStateError extends HachikoError {
    constructor(message: string, planId: string, currentState: string, details?: Record<string, unknown>);
}
/**
 * Error thrown when a GitHub API request fails.
 *
 * @param message - Description of the API failure
 * @param status - The HTTP status code returned by the GitHub API
 * @param details - Optional additional context about the API error
 *
 * @example
 * ```typescript
 * throw new GitHubApiError('Rate limit exceeded', 429, { retryAfter: 60 });
 * ```
 */
export declare class GitHubApiError extends HachikoError {
    constructor(message: string, status: number, details?: Record<string, unknown>);
}
/**
 * Type guard that checks if an error is a HachikoError instance.
 *
 * @param error - The error value to check
 * @returns True if the error is a HachikoError or any of its subclasses
 *
 * @example
 * ```typescript
 * try {
 *   await executeMigration();
 * } catch (error) {
 *   if (isHachikoError(error)) {
 *     console.log(error.code); // Access HachikoError-specific properties
 *   }
 * }
 * ```
 */
export declare function isHachikoError(error: unknown): error is HachikoError;
/**
 * Formats an error into a markdown string suitable for posting in a GitHub issue.
 *
 * For HachikoError instances, produces a structured format with error name, message,
 * details, and code. For generic errors, includes the message and stack trace.
 *
 * @param error - The error to format
 * @returns A markdown-formatted string representing the error
 *
 * @example
 * ```typescript
 * const error = new ConfigurationError('Missing key', { envVar: 'API_KEY' });
 * const formatted = formatErrorForIssue(error);
 * // Returns:
 * // "**ConfigurationError**: Missing key\n\n**Details:**\n- envVar: \"API_KEY\"\n\n**Code**: `CONFIGURATION_ERROR`"
 * ```
 */
export declare function formatErrorForIssue(error: Error): string;
/**
 * Retries an async operation with exponential backoff for transient errors.
 *
 * Policy violations and configuration errors are never retried since they
 * are not transient. All other errors trigger retries up to the maximum
 * number of attempts.
 *
 * @param operation - The async function to execute and potentially retry
 * @param maxAttempts - Maximum number of attempts before giving up (default: 3)
 * @param backoffMs - Base backoff duration in milliseconds, doubled each retry (default: 1000)
 * @returns The result of the successful operation
 * @throws The last error encountered if all attempts fail, or immediately for non-transient errors
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => fetch('https://api.github.com/repos'),
 *   3,
 *   1000
 * );
 * ```
 */
export declare function withRetry<T>(operation: () => Promise<T>, maxAttempts?: number, backoffMs?: number): Promise<T>;
//# sourceMappingURL=errors.d.ts.map