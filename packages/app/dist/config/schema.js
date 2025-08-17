"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MigrationFrontmatterSchema = exports.MigrationStatusSchema = exports.MigrationRollbackSchema = exports.MigrationChecksSchema = exports.MigrationStepSchema = exports.HachikoConfigSchema = exports.DependenciesConfigSchema = exports.PlansConfigSchema = exports.StrategyConfigSchema = exports.AiConfigsSchema = exports.RebaseConfigSchema = exports.PolicyConfigSchema = exports.AgentConfigSchema = exports.AgentApiConfigSchema = exports.AgentCliConfigSchema = void 0;
exports.validateHachikoConfig = validateHachikoConfig;
exports.validateMigrationFrontmatter = validateMigrationFrontmatter;
exports.mergeConfigs = mergeConfigs;
const zod_1 = require("zod");
// Agent configuration schemas
exports.AgentCliConfigSchema = zod_1.z.object({
    kind: zod_1.z.literal("cli"),
    command: zod_1.z.string(),
    args: zod_1.z.array(zod_1.z.string()).default([]),
    timeout: zod_1.z.number().optional(),
});
exports.AgentApiConfigSchema = zod_1.z.object({
    kind: zod_1.z.literal("api"),
    endpoint: zod_1.z.string(),
    auth: zod_1.z
        .object({
        type: zod_1.z.enum(["bearer", "basic", "apikey"]),
        token: zod_1.z.string(),
    })
        .optional(),
    timeout: zod_1.z.number().optional(),
});
exports.AgentConfigSchema = zod_1.z.union([exports.AgentCliConfigSchema, exports.AgentApiConfigSchema]);
// Policy configuration schema
exports.PolicyConfigSchema = zod_1.z.object({
    allowWorkflowEdits: zod_1.z.boolean().default(false),
    network: zod_1.z.enum(["none", "restricted", "unrestricted"]).default("none"),
    maxAttemptsPerStep: zod_1.z.number().min(1).max(5).default(2),
    stepTimeoutMinutes: zod_1.z.number().min(1).max(180).default(15),
    perRepoMaxConcurrentMigrations: zod_1.z.number().min(1).max(10).default(3),
    riskyGlobs: zod_1.z.array(zod_1.z.string()).default([".github/workflows/**", ".git/**", "**/*.sh"]),
    allowlistGlobs: zod_1.z
        .array(zod_1.z.string())
        .default(["src/**", "services/**", "packages/**", "modules/**"]),
});
// Rebase strategy configuration
exports.RebaseConfigSchema = zod_1.z.object({
    when: zod_1.z.enum(["always", "behind-base-branch", "never"]).default("behind-base-branch"),
    allowManual: zod_1.z.boolean().default(true),
});
// AI Configs configuration schema
exports.AiConfigsSchema = zod_1.z.object({
    provider: zod_1.z.enum(["launchdarkly", "local"]).default("launchdarkly"),
    flagKeyPrefix: zod_1.z.string().default("hachiko_prompts_"),
    localPromptsDir: zod_1.z.string().optional(),
});
// Migration strategy configuration
exports.StrategyConfigSchema = zod_1.z.object({
    chunkBy: zod_1.z.enum(["module", "package", "fileset", "custom"]).default("module"),
    maxOpenPRs: zod_1.z.number().min(1).max(10).default(1),
});
// Plans configuration schema
exports.PlansConfigSchema = zod_1.z.object({
    directory: zod_1.z.string().default("migrations/"),
    filenamePattern: zod_1.z.string().default("*.md"),
});
// Dependencies configuration
exports.DependenciesConfigSchema = zod_1.z.object({
    conflictResolution: zod_1.z.enum(["fail", "merge", "override"]).default("fail"),
    updateStrategy: zod_1.z.enum(["manual", "auto"]).default("manual"),
});
// Main Hachiko configuration schema
exports.HachikoConfigSchema = zod_1.z.object({
    plans: exports.PlansConfigSchema.default({}),
    defaults: zod_1.z
        .object({
        agent: zod_1.z.string().default("claude-cli"),
        prParallelism: zod_1.z.number().min(1).max(5).default(1),
        rebase: exports.RebaseConfigSchema.default({}),
        labels: zod_1.z.array(zod_1.z.string()).default(["hachiko", "migration"]),
        requirePlanReview: zod_1.z.boolean().default(true),
    })
        .default({}),
    aiConfigs: exports.AiConfigsSchema.default({}),
    policy: exports.PolicyConfigSchema.default({}),
    dependencies: exports.DependenciesConfigSchema.default({}),
    agents: zod_1.z.record(zod_1.z.string(), exports.AgentConfigSchema).default({
        "claude-cli": {
            kind: "cli",
            command: "claude",
            args: ["code", "--apply"],
        },
        "cursor-cli": {
            kind: "cli",
            command: "cursor",
            args: ["--headless", "apply"],
        },
    }),
});
// Migration plan frontmatter schema
exports.MigrationStepSchema = zod_1.z.object({
    id: zod_1.z.string(),
    description: zod_1.z.string(),
    expectedPR: zod_1.z.boolean().default(true),
    agent: zod_1.z.string().optional(),
    timeout: zod_1.z.number().optional(),
});
exports.MigrationChecksSchema = zod_1.z.array(zod_1.z.string()).default([]);
exports.MigrationRollbackSchema = zod_1.z
    .array(zod_1.z.object({
    description: zod_1.z.string(),
    command: zod_1.z.string().optional(),
}))
    .default([]);
exports.MigrationStatusSchema = zod_1.z
    .enum([
    "draft",
    "plan-approved",
    "queued",
    "running",
    "awaiting-review",
    "paused",
    "failed",
    "done",
    "cancelled",
    "skipped",
])
    .default("draft");
exports.MigrationFrontmatterSchema = zod_1.z.object({
    id: zod_1.z.string(),
    title: zod_1.z.string(),
    owner: zod_1.z.string(),
    status: exports.MigrationStatusSchema,
    agent: zod_1.z.string().optional(),
    strategy: exports.StrategyConfigSchema.default({}),
    checks: exports.MigrationChecksSchema,
    rollback: exports.MigrationRollbackSchema,
    successCriteria: zod_1.z.array(zod_1.z.string()).default([]),
    steps: zod_1.z.array(exports.MigrationStepSchema).default([]),
    dependsOn: zod_1.z.array(zod_1.z.string()).default([]),
    touches: zod_1.z.array(zod_1.z.string()).default([]),
    attempts: zod_1.z.number().default(0),
    lastError: zod_1.z.string().optional(),
    currentStep: zod_1.z.string().optional(),
});
// Validation utilities
function validateHachikoConfig(config) {
    return exports.HachikoConfigSchema.parse(config);
}
function validateMigrationFrontmatter(frontmatter) {
    return exports.MigrationFrontmatterSchema.parse(frontmatter);
}
// Configuration merge utility
function mergeConfigs(base, override) {
    return exports.HachikoConfigSchema.parse({
        ...base,
        ...override,
        defaults: { ...base.defaults, ...override.defaults },
        policy: { ...base.policy, ...override.policy },
        aiConfigs: { ...base.aiConfigs, ...override.aiConfigs },
        dependencies: { ...base.dependencies, ...override.dependencies },
        plans: { ...base.plans, ...override.plans },
        agents: { ...base.agents, ...override.agents },
    });
}
//# sourceMappingURL=schema.js.map