/**
 * Base error class for all Hachiko-specific errors.
 *
 * Provides a structured error format with an error code and optional details
 * object for additional context. All domain-specific errors in the Hachiko
 * system extend this class.
 *
 * @example
 * ```typescript
 * throw new HachikoError('Something went wrong', 'UNKNOWN_ERROR', { context: 'migration' });
 * ```
 */
export class HachikoError extends Error {
  public readonly code: string;
  public readonly details: Record<string, unknown> | undefined;

  /**
   * @param message - Human-readable error message
   * @param code - Machine-readable error code for programmatic handling
   * @param details - Optional additional context about the error
   */
  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "HachikoError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Error thrown when Hachiko encounters invalid or missing configuration.
 *
 * @example
 * ```typescript
 * throw new ConfigurationError('Missing API key', { configKey: 'CURSOR_API_KEY' });
 * ```
 */
export class ConfigurationError extends HachikoError {
  /**
   * @param message - Description of the configuration issue
   * @param details - Optional additional context about the configuration error
   */
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "CONFIGURATION_ERROR", details);
    this.name = "ConfigurationError";
  }
}

/**
 * Error thrown when an agent operation violates a file or security policy.
 *
 * @example
 * ```typescript
 * throw new PolicyViolationError(
 *   'Files outside allowed paths',
 *   ['/etc/passwd', '/root/.ssh/id_rsa'],
 *   { agent: 'cursor' }
 * );
 * ```
 */
export class PolicyViolationError extends HachikoError {
  /**
   * @param message - Description of the policy violation
   * @param violations - List of specific violations that occurred
   * @param details - Optional additional context about the violation
   */
  constructor(message: string, violations: string[], details?: Record<string, unknown>) {
    super(message, "POLICY_VIOLATION", { violations, ...details });
    this.name = "PolicyViolationError";
  }
}

/**
 * Error thrown when an AI agent fails during migration step execution.
 *
 * @example
 * ```typescript
 * throw new AgentExecutionError('Agent timed out', 'cursor', { timeout: 300000 });
 * ```
 */
export class AgentExecutionError extends HachikoError {
  /**
   * @param message - Description of the execution failure
   * @param agentName - Name of the agent that failed (e.g., "cursor", "devin")
   * @param details - Optional additional context about the failure
   */
  constructor(message: string, agentName: string, details?: Record<string, unknown>) {
    super(message, "AGENT_EXECUTION_ERROR", { agentName, ...details });
    this.name = "AgentExecutionError";
  }
}

/**
 * Error thrown when a migration is in an invalid or unexpected state.
 *
 * @example
 * ```typescript
 * throw new MigrationStateError(
 *   'Cannot execute step 3: migration is paused',
 *   'add-jsdoc-comments',
 *   'paused',
 *   { requestedStep: 3 }
 * );
 * ```
 */
export class MigrationStateError extends HachikoError {
  /**
   * @param message - Description of the state error
   * @param planId - The migration plan ID that is in an invalid state
   * @param currentState - The current state of the migration
   * @param details - Optional additional context about the state error
   */
  constructor(
    message: string,
    planId: string,
    currentState: string,
    details?: Record<string, unknown>
  ) {
    super(message, "MIGRATION_STATE_ERROR", { planId, currentState, ...details });
    this.name = "MigrationStateError";
  }
}

/**
 * Error thrown when a GitHub API request fails.
 *
 * @example
 * ```typescript
 * throw new GitHubApiError('Rate limit exceeded', 429, { retryAfter: 60 });
 * ```
 */
export class GitHubApiError extends HachikoError {
  /**
   * @param message - Description of the API error
   * @param status - HTTP status code returned by the GitHub API
   * @param details - Optional additional context about the API error
   */
  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message, "GITHUB_API_ERROR", { status, ...details });
    this.name = "GitHubApiError";
  }
}

/**
 * Type guard that checks if an error is a HachikoError instance.
 *
 * @param error - The error to check
 * @returns True if the error is a HachikoError, false otherwise
 * @example
 * ```typescript
 * try {
 *   await runMigration();
 * } catch (error) {
 *   if (isHachikoError(error)) {
 *     console.log(error.code); // Access HachikoError-specific properties
 *   }
 * }
 * ```
 */
export function isHachikoError(error: unknown): error is HachikoError {
  return error instanceof HachikoError;
}

/**
 * Formats an error into a markdown string suitable for posting in a GitHub issue.
 *
 * For HachikoError instances, the output includes the error name, message,
 * details, and error code. For generic errors, it includes the message and
 * stack trace in a code block.
 *
 * @param error - The error to format
 * @returns A markdown-formatted string describing the error
 * @example
 * ```typescript
 * const error = new ConfigurationError('Missing key', { configKey: 'API_KEY' });
 * const formatted = formatErrorForIssue(error);
 * // Returns:
 * // "**ConfigurationError**: Missing key\n\n**Details:**\n- configKey: \"API_KEY\"\n\n**Code**: `CONFIGURATION_ERROR`"
 * ```
 */
export function formatErrorForIssue(error: Error): string {
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
 * Retries an async operation with exponential backoff on transient failures.
 *
 * Policy violations and configuration errors are never retried as they are
 * considered permanent failures. All other errors trigger retries up to the
 * specified maximum number of attempts.
 *
 * @param operation - The async function to execute and potentially retry
 * @param maxAttempts - Maximum number of attempts before giving up (default: 3)
 * @param backoffMs - Base delay in milliseconds between retries, doubled each attempt (default: 1000)
 * @returns The result of the operation if it succeeds
 * @throws The last error encountered if all attempts fail, or immediately for policy/configuration errors
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => fetch('https://api.github.com/repos'),
 *   3,
 *   1000
 * );
 * ```
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = 3,
  backoffMs = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      // Don't retry policy violations or configuration errors
      if (
        isHachikoError(error) &&
        (error.code === "POLICY_VIOLATION" || error.code === "CONFIGURATION_ERROR")
      ) {
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
