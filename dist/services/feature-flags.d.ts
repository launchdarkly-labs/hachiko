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
     * Check if the test-flag is enabled
     * This is a simple feature flag check that wraps a noop operation
     */
    isTestFlagEnabled(userId?: string): Promise<boolean>;
    /**
     * Execute a noop operation wrapped by the test-flag
     * This demonstrates feature flag usage with a simple operation
     */
    executeTestFlagOperation(userId?: string): Promise<void>;
    /**
     * Close the feature flag service
     */
    close(): Promise<void>;
}
/**
 * Factory function to get feature flag service instance
 */
export declare function createFeatureFlagService(): FeatureFlagService;
/**
 * Initialize feature flags service
 */
export declare function initializeFeatureFlags(): Promise<FeatureFlagService>;
//# sourceMappingURL=feature-flags.d.ts.map