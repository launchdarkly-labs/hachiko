import LaunchDarklyClient from "@launchdarkly/node-server-sdk";
/**
 * Feature flag service for managing LaunchDarkly feature flags
 */
export declare class FeatureFlagService {
    private static instance;
    private ldClient;
    private initialized;
    private constructor();
    static getInstance(): FeatureFlagService;
    /**
     * Initialize the feature flag service
     */
    initialize(): Promise<void>;
    /**
     * Get a boolean feature flag value
     */
    getBooleanFlag(flagKey: string, context: LaunchDarklyClient.LDContext, defaultValue?: boolean): Promise<boolean>;
    /**
     * Execute a function only if the test flag is enabled
     */
    executeIfTestFlagEnabled(context: LaunchDarklyClient.LDContext, fn: () => void | Promise<void>): Promise<void>;
    /**
     * Close the feature flag service
     */
    close(): Promise<void>;
}
/**
 * Factory function to get feature flag service instance
 */
export declare function getFeatureFlagService(): FeatureFlagService;
/**
 * Initialize feature flags
 */
export declare function initializeFeatureFlags(): Promise<FeatureFlagService>;
//# sourceMappingURL=feature-flags.d.ts.map