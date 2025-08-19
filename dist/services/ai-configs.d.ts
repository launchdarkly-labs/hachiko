import type { HachikoConfig } from "../config/schema.js";
/**
 * AI configuration data structure
 */
export interface AIPromptConfig {
    /** Prompt template */
    template: string;
    /** Prompt version */
    version: string;
    /** Temperature setting */
    temperature?: number;
    /** Model configuration */
    model?: string;
    /** Max tokens */
    maxTokens?: number;
    /** Additional parameters */
    parameters?: Record<string, unknown>;
}
/**
 * Context for prompt evaluation
 */
export interface PromptContext {
    /** Migration plan ID */
    planId: string;
    /** Step ID */
    stepId: string;
    /** Repository information */
    repository: {
        owner: string;
        name: string;
        defaultBranch: string;
    };
    /** User information */
    user?: {
        login: string;
        type: string;
    };
    /** Environment */
    environment: string;
    /** Additional context data */
    metadata?: Record<string, unknown>;
}
/**
 * AI configuration manager using LaunchDarkly for dynamic prompt management
 */
export declare class AIConfigManager {
    private static instance;
    private ldClient;
    private config;
    private initialized;
    private constructor();
    static getInstance(): AIConfigManager;
    /**
     * Initialize the AI config manager
     */
    initialize(config: HachikoConfig): Promise<void>;
    /**
     * Get prompt configuration for a migration step
     */
    getPromptConfig(planId: string, stepId: string, context: PromptContext): Promise<AIPromptConfig>;
    /**
     * Get available prompt configurations
     */
    getAvailablePrompts(): Promise<Record<string, AIPromptConfig>>;
    /**
     * Test a prompt configuration
     */
    testPromptConfig(config: AIPromptConfig, context: PromptContext): Promise<{
        isValid: boolean;
        errors: string[];
    }>;
    /**
     * Interpolate prompt template with context
     */
    interpolateTemplate(template: string, context: PromptContext): string;
    /**
     * Close the AI config manager
     */
    close(): Promise<void>;
    /**
     * Initialize LaunchDarkly client
     */
    private initializeLaunchDarkly;
    /**
     * Get prompt configuration from LaunchDarkly
     */
    private getPromptFromLaunchDarkly;
    /**
     * Get prompt configuration from local files
     */
    private getPromptFromLocal;
    /**
     * Get local prompts from files
     */
    private getLocalPrompts;
    /**
     * Build LaunchDarkly flag key
     */
    private buildFlagKey;
    /**
     * Get default prompt configuration
     */
    private getDefaultPromptConfig;
}
/**
 * Factory function to get AI config manager instance
 */
export declare function createAIConfigManager(): AIConfigManager;
/**
 * Initialize AI configs from configuration
 */
export declare function initializeAIConfigs(config: HachikoConfig): Promise<AIConfigManager>;
//# sourceMappingURL=ai-configs.d.ts.map