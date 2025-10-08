/**
 * Initialize the LaunchDarkly client for feature flags
 */
export declare function initializeFeatureFlags(): Promise<void>;
/**
 * Check if the test-flag is enabled
 */
export declare function isTestFlagEnabled(userKey?: string): Promise<boolean>;
/**
 * Execute a noop operation if test-flag is enabled
 * This is a demonstration of feature flag usage
 */
export declare function testFlagNoop(userKey?: string): Promise<void>;
/**
 * Close the feature flags client
 */
export declare function closeFeatureFlags(): Promise<void>;
//# sourceMappingURL=feature-flags.d.ts.map