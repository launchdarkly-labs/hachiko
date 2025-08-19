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
export class ConfigurationError extends HachikoError {
    constructor(message, details) {
        super(message, "CONFIGURATION_ERROR", details);
        this.name = "ConfigurationError";
    }
}
export class PolicyViolationError extends HachikoError {
    constructor(message, violations, details) {
        super(message, "POLICY_VIOLATION", { violations, ...details });
        this.name = "PolicyViolationError";
    }
}
export class AgentExecutionError extends HachikoError {
    constructor(message, agentName, details) {
        super(message, "AGENT_EXECUTION_ERROR", { agentName, ...details });
        this.name = "AgentExecutionError";
    }
}
export class MigrationStateError extends HachikoError {
    constructor(message, planId, currentState, details) {
        super(message, "MIGRATION_STATE_ERROR", { planId, currentState, ...details });
        this.name = "MigrationStateError";
    }
}
export class GitHubApiError extends HachikoError {
    constructor(message, status, details) {
        super(message, "GITHUB_API_ERROR", { status, ...details });
        this.name = "GitHubApiError";
    }
}
// Error handling utilities
export function isHachikoError(error) {
    return error instanceof HachikoError;
}
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
// Retry utility for transient errors
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