export interface HachikoCommand {
    action: string;
    args: string[];
    rawCommand: string;
}
/**
 * Parse a Hachiko command from a comment body
 */
export declare function parseHachikoCommand(commentBody: string): HachikoCommand | null;
/**
 * Validate command permissions (basic implementation)
 */
export declare function canExecuteCommand(command: HachikoCommand, user: {
    login: string;
    type: string;
}, _repository: {
    owner: {
        login: string;
    };
}): boolean;
/**
 * Format command response with consistent styling
 */
export declare function formatCommandResponse(command: string, status: "success" | "error" | "info", message: string, details?: string): string;
//# sourceMappingURL=commands.d.ts.map