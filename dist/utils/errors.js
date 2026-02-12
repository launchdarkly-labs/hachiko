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
export class HachikoError extends Error {
    code;
    details;
    constructor(message, code, details) {
        super(message);
        this.name = "HachikoError";
        this.code = code;
        this.details = details;
    }
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
export class ConfigurationError extends HachikoError {
    constructor(message, details) {
        super(message, "CONFIGURATION_ERROR", details);
        this.name = "ConfigurationError";
    }
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
export class PolicyViolationError extends HachikoError {
    constructor(message, violations, details) {
        super(message, "POLICY_VIOLATION", { violations, ...details });
        this.name = "PolicyViolationError";
    }
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
export class AgentExecutionError extends HachikoError {
    constructor(message, agentName, details) {
        super(message, "AGENT_EXECUTION_ERROR", { agentName, ...details });
        this.name = "AgentExecutionError";
    }
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
export class MigrationStateError extends HachikoError {
    constructor(message, planId, currentState, details) {
        super(message, "MIGRATION_STATE_ERROR", { planId, currentState, ...details });
        this.name = "MigrationStateError";
    }
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
export class GitHubApiError extends HachikoError {
    constructor(message, status, details) {
        super(message, "GITHUB_API_ERROR", { status, ...details });
        this.name = "GitHubApiError";
    }
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
export function isHachikoError(error) {
    return error instanceof HachikoError;
}
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
export function formatErrorForIssue(error) {
    if (isHachikoError(error)) {
        let formatted = `**${error.name}**: ${error.message}\n\n`;
        if (error.details) {
            formatted += "**Details:**\n";
            for (const [key, value] of Object.entries(error.details)) {
                formatted += `- ${key}: ${JSON.stringify(value)}\n`;
            }
        }
        formatted += `\n**Code**: \`${error.code}\``;
        return formatted;
    }
    return `**Error**: ${error.message}\n\n\`\`\`\n${error.stack}\n\`\`\``;
}
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
export async function withRetry(operation, maxAttempts = 3, backoffMs = 1000) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await operation();
        }
        catch (error) {
            lastError = error;
            // Don't retry policy violations or configuration errors
            if (isHachikoError(error) &&
                (error.code === "POLICY_VIOLATION" || error.code === "CONFIGURATION_ERROR")) {
                throw error;
            }
            if (attempt === maxAttempts) {
                throw error;
            }
            // Exponential backoff
            await new Promise((resolve) => setTimeout(resolve, backoffMs * 2 ** (attempt - 1)));
        }
    }
    // This should never happen since we throw on maxAttempts, but TypeScript needs assurance
    throw lastError ?? new Error("Unexpected error in withRetry");
}
//# sourceMappingURL=errors.js.map