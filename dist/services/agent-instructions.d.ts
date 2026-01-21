/**
 * Service for generating agent-specific instructions using the new state inference system
 * Replaces hardcoded instructions with template-based generation
 */
import type { ContextWithRepository } from "../types/context.js";
import type { Logger } from "../utils/logger.js";
export interface MigrationContext {
    id: string;
    title: string;
    agent: string;
    filePath: string;
    created: string;
}
export interface RepositoryContext {
    owner: string;
    name: string;
    url: string;
}
/**
 * Generate agent instructions for a specific migration
 */
export declare function generateAgentInstructions(migrationContext: MigrationContext, repositoryContext: RepositoryContext, logger?: Logger): Promise<string>;
/**
 * Generate agent instructions from migration document in GitHub
 */
export declare function generateAgentInstructionsFromRepo(context: ContextWithRepository, migrationId: string, logger?: Logger): Promise<string>;
/**
 * Generate agent-specific instructions based on agent type
 */
export declare function generateAgentSpecificInstructions(agentType: string, migrationContext: MigrationContext, repositoryContext: RepositoryContext, logger?: Logger): Promise<string>;
//# sourceMappingURL=agent-instructions.d.ts.map