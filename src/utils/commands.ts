/**
 * Represents a parsed Hachiko command extracted from a comment.
 *
 * Hachiko commands are slash commands that users can invoke in GitHub comments
 * to interact with the migration system. Commands follow the format:
 * `/hachi <action> [args...]`
 *
 * @example
 * ```typescript
 * const command: HachikoCommand = {
 *   action: 'status',
 *   args: ['migration-id'],
 *   rawCommand: '/hachi status migration-id'
 * };
 * ```
 */
export interface HachikoCommand {
  /** The action to perform (e.g., "status", "run", "pause") */
  action: string;
  /** Additional arguments passed to the command */
  args: string[];
  /** The original command string as entered by the user */
  rawCommand: string;
}

/**
 * Parses a Hachiko command from a GitHub comment body.
 *
 * This function extracts and validates slash commands from comment text.
 * Commands must start with `/hachi` followed by an action and optional arguments.
 * Only the first line of the comment is considered for command parsing.
 *
 * @param commentBody - The full text content of the GitHub comment
 * @returns A parsed HachikoCommand object if valid, or null if the comment doesn't contain a valid command
 * @example
 * ```typescript
 * // Valid command with arguments
 * parseHachikoCommand('/hachi run add-jsdoc step-1');
 * // Returns: { action: 'run', args: ['add-jsdoc', 'step-1'], rawCommand: '/hachi run add-jsdoc step-1' }
 *
 * // Valid command without arguments
 * parseHachikoCommand('/hachi status');
 * // Returns: { action: 'status', args: [], rawCommand: '/hachi status' }
 *
 * // Invalid - doesn't start with /hachi
 * parseHachikoCommand('Hello world');
 * // Returns: null
 *
 * // Invalid - no action specified
 * parseHachikoCommand('/hachi');
 * // Returns: null
 * ```
 */
export function parseHachikoCommand(commentBody: string): HachikoCommand | null {
  const lines = commentBody.trim().split("\n");

  // Ensure we have at least one line
  if (lines.length === 0) {
    return null;
  }

  const commandLine = lines[0]?.trim();

  // Must start with /hachi
  if (!commandLine || !commandLine.startsWith("/hachi")) {
    return null;
  }

  // Split command into parts
  const parts = commandLine.split(/\s+/).filter(Boolean);

  if (parts.length < 2) {
    return null;
  }

  const action = parts[1]!; // We know this exists due to length check
  const args = parts.slice(2);

  return {
    action,
    args,
    rawCommand: commandLine,
  };
}

/**
 * Validates whether a user has permission to execute a Hachiko command.
 *
 * This function implements basic permission checking for command execution.
 * Status commands are always allowed for any user, while other commands
 * require the user to be authenticated (non-bot with a valid login).
 *
 * @param command - The parsed Hachiko command to validate
 * @param user - The GitHub user attempting to execute the command
 * @param user.login - The GitHub username
 * @param user.type - The account type (e.g., "User", "Bot")
 * @param _repository - The repository context (reserved for future permission checks)
 * @param _repository.owner.login - The repository owner's username
 * @returns True if the user can execute the command, false otherwise
 * @example
 * ```typescript
 * const command = { action: 'status', args: [], rawCommand: '/hachi status' };
 * const user = { login: 'developer', type: 'User' };
 * const repo = { owner: { login: 'org' } };
 *
 * canExecuteCommand(command, user, repo);
 * // Returns: true (status is always allowed)
 *
 * const runCommand = { action: 'run', args: ['migration-1'], rawCommand: '/hachi run migration-1' };
 * canExecuteCommand(runCommand, user, repo);
 * // Returns: true (authenticated user)
 *
 * const botUser = { login: 'github-actions[bot]', type: 'Bot' };
 * canExecuteCommand(runCommand, botUser, repo);
 * // Returns: false (bots cannot execute non-status commands)
 * ```
 */
export function canExecuteCommand(
  command: HachikoCommand,
  user: { login: string; type: string },
  _repository: { owner: { login: string } }
): boolean {
  // For now, allow repository owners and collaborators
  // In a real implementation, you'd check GitHub permissions

  // Always allow status commands
  if (command.action === "status") {
    return true;
  }

  // For other commands, user should be authenticated
  return user.type !== "Bot" && user.login.length > 0;
}

/**
 * Formats a command response with consistent styling for GitHub comments.
 *
 * This function generates a formatted markdown response for Hachiko commands,
 * including an appropriate emoji indicator, the command name, a message,
 * and optional additional details.
 *
 * @param command - The command name to display in the response header
 * @param status - The status of the command execution: "success", "error", or "info"
 * @param message - The main message to display to the user
 * @param details - Optional additional details to append to the response
 * @returns A formatted markdown string suitable for posting as a GitHub comment
 * @example
 * ```typescript
 * // Success response
 * formatCommandResponse('status', 'success', 'Migration is running');
 * // Returns:
 * // "✅ **Command**: `status`
 * //
 * // Migration is running"
 *
 * // Error response with details
 * formatCommandResponse('run', 'error', 'Failed to start migration', 'Step 2 has a syntax error');
 * // Returns:
 * // "❌ **Command**: `run`
 * //
 * // Failed to start migration
 * //
 * // **Details:**
 * // Step 2 has a syntax error"
 *
 * // Info response
 * formatCommandResponse('help', 'info', 'Available commands: status, run, pause');
 * // Returns:
 * // "ℹ️ **Command**: `help`
 * //
 * // Available commands: status, run, pause"
 * ```
 */
export function formatCommandResponse(
  command: string,
  status: "success" | "error" | "info",
  message: string,
  details?: string
): string {
  const emoji = status === "success" ? "✅" : status === "error" ? "❌" : "ℹ️";
  const title = `${emoji} **Command**: \`${command}\``;

  let response = `${title}\n\n${message}`;

  if (details) {
    response += `\n\n**Details:**\n${details}`;
  }

  return response;
}
