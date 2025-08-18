import type { PolicyViolation } from "../adapters/types.js";
import type { HachikoConfig } from "../config/schema.js";
/**
 * Policy rule types
 */
export declare const PolicyRuleType: {
    readonly FILE_ACCESS: "file_access";
    readonly COMMAND_EXECUTION: "command_execution";
    readonly NETWORK_ACCESS: "network_access";
    readonly RESOURCE_USAGE: "resource_usage";
    readonly TIME_CONSTRAINTS: "time_constraints";
    readonly USER_PERMISSIONS: "user_permissions";
};
export type PolicyRuleTypeType = (typeof PolicyRuleType)[keyof typeof PolicyRuleType];
/**
 * Policy severity levels
 */
export declare const PolicySeverity: {
    readonly INFO: "info";
    readonly WARNING: "warning";
    readonly ERROR: "error";
    readonly CRITICAL: "critical";
};
export type PolicySeverityType = (typeof PolicySeverity)[keyof typeof PolicySeverity];
/**
 * Policy rule definition
 */
export interface PolicyRule {
    id: string;
    name: string;
    description: string;
    type: PolicyRuleTypeType;
    severity: PolicySeverityType;
    enabled: boolean;
    conditions: PolicyCondition[];
    actions: PolicyAction[];
    metadata?: Record<string, unknown>;
}
/**
 * Policy condition
 */
export interface PolicyCondition {
    field: string;
    operator: "equals" | "not_equals" | "matches" | "not_matches" | "contains" | "not_contains" | "greater_than" | "less_than";
    value: string | number | boolean | string[];
    caseSensitive?: boolean;
}
/**
 * Policy action
 */
export interface PolicyAction {
    type: "block" | "warn" | "log" | "require_approval";
    message?: string;
    metadata?: Record<string, unknown>;
}
/**
 * Policy evaluation context
 */
export interface PolicyContext {
    /** Migration plan ID */
    planId: string;
    /** Step ID */
    stepId: string;
    /** Repository information */
    repository: {
        owner: string;
        name: string;
        defaultBranch: string;
        isPrivate?: boolean;
    };
    /** User information */
    user: {
        login: string;
        type: string;
        permissions?: string[];
    };
    /** Files being accessed */
    files: string[];
    /** Commands being executed */
    commands?: string[];
    /** Network requests */
    networkRequests?: string[];
    /** Resource usage */
    resourceUsage?: {
        memory?: number;
        cpu?: number;
        timeout?: number;
    };
    /** Execution environment */
    environment: string;
    /** Additional metadata */
    metadata?: Record<string, unknown>;
}
/**
 * Policy evaluation result
 */
export interface PolicyEvaluationResult {
    allowed: boolean;
    violations: PolicyViolation[];
    warnings: PolicyViolation[];
    requiresApproval: boolean;
    metadata?: Record<string, unknown>;
}
/**
 * Advanced policy engine for security and compliance
 */
export declare class PolicyEngine {
    private static instance;
    private rules;
    private config;
    private initialized;
    private constructor();
    static getInstance(): PolicyEngine;
    /**
     * Initialize the policy engine
     */
    initialize(config: HachikoConfig): Promise<void>;
    /**
     * Evaluate policies for a given context
     */
    evaluatePolicies(context: PolicyContext): Promise<PolicyEvaluationResult>;
    /**
     * Add a custom policy rule
     */
    addRule(rule: PolicyRule): void;
    /**
     * Remove a policy rule
     */
    removeRule(ruleId: string): boolean;
    /**
     * Get all policy rules
     */
    getRules(): PolicyRule[];
    /**
     * Get enabled policy rules
     */
    getEnabledRules(): PolicyRule[];
    /**
     * Enable/disable a policy rule
     */
    setRuleEnabled(ruleId: string, enabled: boolean): boolean;
    /**
     * Load built-in policy rules
     */
    private loadPolicyRules;
    /**
     * Evaluate a single policy rule
     */
    private evaluateRule;
    /**
     * Evaluate a single condition
     */
    private evaluateCondition;
    /**
     * Get field value from context using dot notation
     */
    private getFieldValue;
    /**
     * Compare values for equality
     */
    private compareValues;
    /**
     * Check if value matches patterns (for file paths, etc.)
     */
    private matchesPattern;
    /**
     * Check if value contains any of the specified values
     */
    private containsValue;
    /**
     * Compare numeric values
     */
    private compareNumbers;
    /**
     * Map rule type to violation type
     */
    private mapRuleTypeToViolationType;
}
/**
 * Factory function to get policy engine instance
 */
export declare function createPolicyEngine(): PolicyEngine;
/**
 * Initialize policy engine from configuration
 */
export declare function initializePolicyEngine(config: HachikoConfig): Promise<PolicyEngine>;
//# sourceMappingURL=policy-engine.d.ts.map