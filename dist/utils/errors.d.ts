export declare class HachikoError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;
  constructor(message: string, code: string, details?: Record<string, unknown>);
}
export declare class ConfigurationError extends HachikoError {
  constructor(message: string, details?: Record<string, unknown>);
}
export declare class PolicyViolationError extends HachikoError {
  constructor(message: string, violations: string[], details?: Record<string, unknown>);
}
export declare class AgentExecutionError extends HachikoError {
  constructor(message: string, agentName: string, details?: Record<string, unknown>);
}
export declare class MigrationStateError extends HachikoError {
  constructor(
    message: string,
    planId: string,
    currentState: string,
    details?: Record<string, unknown>
  );
}
export declare class GitHubApiError extends HachikoError {
  constructor(message: string, status: number, details?: Record<string, unknown>);
}
export declare function isHachikoError(error: unknown): error is HachikoError;
export declare function formatErrorForIssue(error: Error): string;
export declare function withRetry<T>(
  operation: () => Promise<T>,
  maxAttempts?: number,
  backoffMs?: number
): Promise<T>;
//# sourceMappingURL=errors.d.ts.map
