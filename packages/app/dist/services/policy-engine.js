"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PolicyEngine = exports.PolicySeverity = exports.PolicyRuleType = void 0;
exports.createPolicyEngine = createPolicyEngine;
exports.initializePolicyEngine = initializePolicyEngine;
const minimatch_1 = require("minimatch");
const errors_js_1 = require("../utils/errors.js");
const logger_js_1 = require("../utils/logger.js");
const logger = (0, logger_js_1.createLogger)("policy-engine");
/**
 * Policy rule types
 */
exports.PolicyRuleType = {
    FILE_ACCESS: "file_access",
    COMMAND_EXECUTION: "command_execution",
    NETWORK_ACCESS: "network_access",
    RESOURCE_USAGE: "resource_usage",
    TIME_CONSTRAINTS: "time_constraints",
    USER_PERMISSIONS: "user_permissions",
};
/**
 * Policy severity levels
 */
exports.PolicySeverity = {
    INFO: "info",
    WARNING: "warning",
    ERROR: "error",
    CRITICAL: "critical",
};
/**
 * Advanced policy engine for security and compliance
 */
class PolicyEngine {
    static instance = null;
    rules = [];
    config = null;
    initialized = false;
    constructor() { }
    static getInstance() {
        if (!PolicyEngine.instance) {
            PolicyEngine.instance = new PolicyEngine();
        }
        return PolicyEngine.instance;
    }
    /**
     * Initialize the policy engine
     */
    async initialize(config) {
        if (this.initialized) {
            return;
        }
        this.config = config;
        this.rules = await this.loadPolicyRules(config);
        this.initialized = true;
        logger.info({
            rulesCount: this.rules.length,
            enabledRules: this.rules.filter((r) => r.enabled).length,
        }, "Policy engine initialized");
    }
    /**
     * Evaluate policies for a given context
     */
    async evaluatePolicies(context) {
        if (!this.initialized) {
            throw new errors_js_1.PolicyViolationError("Policy engine not initialized", []);
        }
        const violations = [];
        const warnings = [];
        let requiresApproval = false;
        for (const rule of this.rules) {
            if (!rule.enabled)
                continue;
            try {
                const ruleResult = await this.evaluateRule(rule, context);
                if (ruleResult.violated) {
                    const violation = {
                        type: this.mapRuleTypeToViolationType(rule.type),
                        message: ruleResult.message || rule.description,
                        pattern: rule.id,
                        severity: rule.severity === exports.PolicySeverity.CRITICAL
                            ? "error"
                            : rule.severity === exports.PolicySeverity.ERROR
                                ? "error"
                                : "warning",
                    };
                    if (rule.severity === exports.PolicySeverity.ERROR || rule.severity === exports.PolicySeverity.CRITICAL) {
                        violations.push(violation);
                    }
                    else {
                        warnings.push(violation);
                    }
                    // Check if any actions require approval
                    if (rule.actions.some((action) => action.type === "require_approval")) {
                        requiresApproval = true;
                    }
                }
            }
            catch (error) {
                logger.error({ error, rule: rule.id }, "Failed to evaluate policy rule");
            }
        }
        const result = {
            allowed: violations.length === 0,
            violations,
            warnings,
            requiresApproval,
        };
        logger.debug({
            planId: context.planId,
            stepId: context.stepId,
            allowed: result.allowed,
            violationsCount: violations.length,
            warningsCount: warnings.length,
            requiresApproval,
        }, "Policy evaluation completed");
        return result;
    }
    /**
     * Add a custom policy rule
     */
    addRule(rule) {
        const existingIndex = this.rules.findIndex((r) => r.id === rule.id);
        if (existingIndex >= 0) {
            this.rules[existingIndex] = rule;
            logger.info({ ruleId: rule.id }, "Policy rule updated");
        }
        else {
            this.rules.push(rule);
            logger.info({ ruleId: rule.id }, "Policy rule added");
        }
    }
    /**
     * Remove a policy rule
     */
    removeRule(ruleId) {
        const index = this.rules.findIndex((r) => r.id === ruleId);
        if (index >= 0) {
            this.rules.splice(index, 1);
            logger.info({ ruleId }, "Policy rule removed");
            return true;
        }
        return false;
    }
    /**
     * Get all policy rules
     */
    getRules() {
        return [...this.rules];
    }
    /**
     * Get enabled policy rules
     */
    getEnabledRules() {
        return this.rules.filter((rule) => rule.enabled);
    }
    /**
     * Enable/disable a policy rule
     */
    setRuleEnabled(ruleId, enabled) {
        const rule = this.rules.find((r) => r.id === ruleId);
        if (rule) {
            rule.enabled = enabled;
            logger.info({ ruleId, enabled }, "Policy rule enabled/disabled");
            return true;
        }
        return false;
    }
    /**
     * Load built-in policy rules
     */
    async loadPolicyRules(config) {
        const rules = [];
        // File access rules
        rules.push({
            id: "block_sensitive_files",
            name: "Block Sensitive Files",
            description: "Prevent access to sensitive files",
            type: exports.PolicyRuleType.FILE_ACCESS,
            severity: exports.PolicySeverity.ERROR,
            enabled: true,
            conditions: [
                {
                    field: "files",
                    operator: "matches",
                    value: [
                        "**/.env*",
                        "**/secrets/**",
                        "**/*password*",
                        "**/*secret*",
                        "**/*key*",
                        "**/config/production/**",
                    ],
                },
            ],
            actions: [{ type: "block", message: "Access to sensitive files is not allowed" }],
        });
        // Risky glob patterns from config
        if (config.policy.riskyGlobs.length > 0) {
            rules.push({
                id: "block_risky_paths",
                name: "Block Risky Paths",
                description: "Prevent access to risky file patterns",
                type: exports.PolicyRuleType.FILE_ACCESS,
                severity: exports.PolicySeverity.ERROR,
                enabled: true,
                conditions: [
                    {
                        field: "files",
                        operator: "matches",
                        value: config.policy.riskyGlobs,
                    },
                ],
                actions: [{ type: "block", message: "Access to risky paths is not allowed" }],
            });
        }
        // Allowlist enforcement
        if (config.policy.allowlistGlobs.length > 0) {
            rules.push({
                id: "enforce_allowlist",
                name: "Enforce File Allowlist",
                description: "Only allow access to allowlisted file patterns",
                type: exports.PolicyRuleType.FILE_ACCESS,
                severity: exports.PolicySeverity.ERROR,
                enabled: true,
                conditions: [
                    {
                        field: "files",
                        operator: "not_matches",
                        value: config.policy.allowlistGlobs,
                    },
                ],
                actions: [{ type: "block", message: "File access outside allowlist is not permitted" }],
            });
        }
        // Resource usage rules
        rules.push({
            id: "limit_execution_time",
            name: "Limit Execution Time",
            description: "Prevent excessive execution time",
            type: exports.PolicyRuleType.RESOURCE_USAGE,
            severity: exports.PolicySeverity.ERROR,
            enabled: true,
            conditions: [
                {
                    field: "resourceUsage.timeout",
                    operator: "greater_than",
                    value: config.policy.stepTimeoutMinutes * 60,
                },
            ],
            actions: [{ type: "block", message: "Execution timeout exceeded" }],
        });
        // Command execution rules
        rules.push({
            id: "block_dangerous_commands",
            name: "Block Dangerous Commands",
            description: "Prevent execution of dangerous commands",
            type: exports.PolicyRuleType.COMMAND_EXECUTION,
            severity: exports.PolicySeverity.CRITICAL,
            enabled: true,
            conditions: [
                {
                    field: "commands",
                    operator: "contains",
                    value: [
                        "rm -rf",
                        "sudo",
                        "curl",
                        "wget",
                        "nc ",
                        "netcat",
                        "exec",
                        "eval",
                        "system",
                        "/bin/sh",
                        "/bin/bash",
                    ],
                },
            ],
            actions: [{ type: "block", message: "Dangerous command execution is not allowed" }],
        });
        // Network access rules
        if (config.policy.network === "none") {
            rules.push({
                id: "block_network_access",
                name: "Block Network Access",
                description: "Prevent all network access",
                type: exports.PolicyRuleType.NETWORK_ACCESS,
                severity: exports.PolicySeverity.ERROR,
                enabled: true,
                conditions: [
                    {
                        field: "networkRequests",
                        operator: "greater_than",
                        value: 0,
                    },
                ],
                actions: [{ type: "block", message: "Network access is not allowed" }],
            });
        }
        // User permission rules
        rules.push({
            id: "require_write_permissions",
            name: "Require Write Permissions",
            description: "User must have write permissions to the repository",
            type: exports.PolicyRuleType.USER_PERMISSIONS,
            severity: exports.PolicySeverity.ERROR,
            enabled: true,
            conditions: [
                {
                    field: "user.type",
                    operator: "equals",
                    value: "Bot",
                },
            ],
            actions: [{ type: "block", message: "Bot users cannot execute migrations" }],
        });
        logger.debug({ rulesCount: rules.length }, "Built-in policy rules loaded");
        return rules;
    }
    /**
     * Evaluate a single policy rule
     */
    async evaluateRule(rule, context) {
        for (const condition of rule.conditions) {
            const violated = await this.evaluateCondition(condition, context);
            if (violated) {
                const actionMessage = rule.actions.find((a) => a.message)?.message;
                return {
                    violated: true,
                    message: actionMessage || rule.description,
                };
            }
        }
        return { violated: false };
    }
    /**
     * Evaluate a single condition
     */
    async evaluateCondition(condition, context) {
        const fieldValue = this.getFieldValue(condition.field, context);
        switch (condition.operator) {
            case "equals":
                return this.compareValues(fieldValue, condition.value, "equals");
            case "not_equals":
                return !this.compareValues(fieldValue, condition.value, "equals");
            case "matches":
                return this.matchesPattern(fieldValue, condition.value);
            case "not_matches":
                return !this.matchesPattern(fieldValue, condition.value);
            case "contains":
                return this.containsValue(fieldValue, condition.value);
            case "not_contains":
                return !this.containsValue(fieldValue, condition.value);
            case "greater_than":
                return this.compareNumbers(fieldValue, condition.value, "greater");
            case "less_than":
                return this.compareNumbers(fieldValue, condition.value, "less");
            default:
                logger.warn({ operator: condition.operator }, "Unknown condition operator");
                return false;
        }
    }
    /**
     * Get field value from context using dot notation
     */
    getFieldValue(field, context) {
        const parts = field.split(".");
        let value = context;
        for (const part of parts) {
            if (value == null)
                return undefined;
            value = value[part];
        }
        return value;
    }
    /**
     * Compare values for equality
     */
    compareValues(actual, expected, _operator) {
        if (Array.isArray(actual) && Array.isArray(expected)) {
            return actual.length === expected.length && actual.every((v) => expected.includes(v));
        }
        return actual === expected;
    }
    /**
     * Check if value matches patterns (for file paths, etc.)
     */
    matchesPattern(actual, patterns) {
        if (Array.isArray(actual)) {
            return actual.some((item) => this.matchesPattern(item, patterns));
        }
        const actualStr = String(actual);
        const patternArray = Array.isArray(patterns) ? patterns : [patterns];
        return patternArray.some((pattern) => {
            const patternStr = String(pattern);
            return (0, minimatch_1.minimatch)(actualStr, patternStr);
        });
    }
    /**
     * Check if value contains any of the specified values
     */
    containsValue(actual, values) {
        if (Array.isArray(actual)) {
            return actual.some((item) => this.containsValue(item, values));
        }
        const actualStr = String(actual).toLowerCase();
        const valueArray = Array.isArray(values) ? values : [values];
        return valueArray.some((value) => actualStr.includes(String(value).toLowerCase()));
    }
    /**
     * Compare numeric values
     */
    compareNumbers(actual, expected, operator) {
        const actualNum = Number(actual);
        const expectedNum = Number(expected);
        if (Number.isNaN(actualNum) || Number.isNaN(expectedNum)) {
            return false;
        }
        return operator === "greater" ? actualNum > expectedNum : actualNum < expectedNum;
    }
    /**
     * Map rule type to violation type
     */
    mapRuleTypeToViolationType(ruleType) {
        switch (ruleType) {
            case exports.PolicyRuleType.FILE_ACCESS:
                return "file_access";
            case exports.PolicyRuleType.COMMAND_EXECUTION:
                return "command_execution";
            case exports.PolicyRuleType.NETWORK_ACCESS:
                return "network_access";
            default:
                return "file_access";
        }
    }
}
exports.PolicyEngine = PolicyEngine;
/**
 * Factory function to get policy engine instance
 */
function createPolicyEngine() {
    return PolicyEngine.getInstance();
}
/**
 * Initialize policy engine from configuration
 */
async function initializePolicyEngine(config) {
    const engine = createPolicyEngine();
    await engine.initialize(config);
    return engine;
}
//# sourceMappingURL=policy-engine.js.map