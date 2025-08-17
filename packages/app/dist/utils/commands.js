"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseHachikoCommand = parseHachikoCommand;
exports.canExecuteCommand = canExecuteCommand;
exports.formatCommandResponse = formatCommandResponse;
/**
 * Parse a Hachiko command from a comment body
 */
function parseHachikoCommand(commentBody) {
    const lines = commentBody.trim().split("\n");
    const commandLine = lines[0].trim();
    // Must start with /hachi
    if (!commandLine.startsWith("/hachi")) {
        return null;
    }
    // Split command into parts
    const parts = commandLine.split(/\s+/).filter(Boolean);
    if (parts.length < 2) {
        return null;
    }
    const action = parts[1];
    const args = parts.slice(2);
    return {
        action,
        args,
        rawCommand: commandLine,
    };
}
/**
 * Validate command permissions (basic implementation)
 */
function canExecuteCommand(command, user, _repository) {
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
 * Format command response with consistent styling
 */
function formatCommandResponse(command, status, message, details) {
    const emoji = status === "success" ? "✅" : status === "error" ? "❌" : "ℹ️";
    const title = `${emoji} **Command**: \`${command}\``;
    let response = `${title}\n\n${message}`;
    if (details) {
        response += `\n\n**Details:**\n${details}`;
    }
    return response;
}
//# sourceMappingURL=commands.js.map