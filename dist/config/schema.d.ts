import { z } from "zod";
export declare const AgentCliConfigSchema: z.ZodObject<{
    kind: z.ZodLiteral<"cli">;
    command: z.ZodString;
    args: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    timeout: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    args: string[];
    kind: "cli";
    command: string;
    timeout?: number | undefined;
}, {
    kind: "cli";
    command: string;
    args?: string[] | undefined;
    timeout?: number | undefined;
}>;
export declare const AgentApiConfigSchema: z.ZodObject<{
    kind: z.ZodLiteral<"api">;
    endpoint: z.ZodString;
    auth: z.ZodOptional<z.ZodObject<{
        type: z.ZodEnum<["bearer", "basic", "apikey"]>;
        token: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "bearer" | "basic" | "apikey";
        token: string;
    }, {
        type: "bearer" | "basic" | "apikey";
        token: string;
    }>>;
    timeout: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    kind: "api";
    endpoint: string;
    timeout?: number | undefined;
    auth?: {
        type: "bearer" | "basic" | "apikey";
        token: string;
    } | undefined;
}, {
    kind: "api";
    endpoint: string;
    timeout?: number | undefined;
    auth?: {
        type: "bearer" | "basic" | "apikey";
        token: string;
    } | undefined;
}>;
export declare const AgentCloudConfigSchema: z.ZodObject<{
    kind: z.ZodLiteral<"cloud">;
    provider: z.ZodEnum<["devin", "cursor", "codex"]>;
    apiKey: z.ZodOptional<z.ZodString>;
    baseUrl: z.ZodOptional<z.ZodString>;
    timeout: z.ZodOptional<z.ZodNumber>;
    webhookUrl: z.ZodOptional<z.ZodString>;
    apiVersion: z.ZodOptional<z.ZodEnum<["v1", "v2", "v3beta1"]>>;
    organizationId: z.ZodOptional<z.ZodString>;
    repositoryUrl: z.ZodOptional<z.ZodString>;
    branch: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
    maxTokens: z.ZodOptional<z.ZodNumber>;
    temperature: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    kind: "cloud";
    provider: "devin" | "cursor" | "codex";
    timeout?: number | undefined;
    apiKey?: string | undefined;
    baseUrl?: string | undefined;
    webhookUrl?: string | undefined;
    apiVersion?: "v1" | "v2" | "v3beta1" | undefined;
    organizationId?: string | undefined;
    repositoryUrl?: string | undefined;
    branch?: string | undefined;
    model?: string | undefined;
    maxTokens?: number | undefined;
    temperature?: number | undefined;
}, {
    kind: "cloud";
    provider: "devin" | "cursor" | "codex";
    timeout?: number | undefined;
    apiKey?: string | undefined;
    baseUrl?: string | undefined;
    webhookUrl?: string | undefined;
    apiVersion?: "v1" | "v2" | "v3beta1" | undefined;
    organizationId?: string | undefined;
    repositoryUrl?: string | undefined;
    branch?: string | undefined;
    model?: string | undefined;
    maxTokens?: number | undefined;
    temperature?: number | undefined;
}>;
export declare const AgentConfigSchema: z.ZodUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"cloud">;
    provider: z.ZodEnum<["devin", "cursor", "codex"]>;
    apiKey: z.ZodOptional<z.ZodString>;
    baseUrl: z.ZodOptional<z.ZodString>;
    timeout: z.ZodOptional<z.ZodNumber>;
    webhookUrl: z.ZodOptional<z.ZodString>;
    apiVersion: z.ZodOptional<z.ZodEnum<["v1", "v2", "v3beta1"]>>;
    organizationId: z.ZodOptional<z.ZodString>;
    repositoryUrl: z.ZodOptional<z.ZodString>;
    branch: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
    maxTokens: z.ZodOptional<z.ZodNumber>;
    temperature: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    kind: "cloud";
    provider: "devin" | "cursor" | "codex";
    timeout?: number | undefined;
    apiKey?: string | undefined;
    baseUrl?: string | undefined;
    webhookUrl?: string | undefined;
    apiVersion?: "v1" | "v2" | "v3beta1" | undefined;
    organizationId?: string | undefined;
    repositoryUrl?: string | undefined;
    branch?: string | undefined;
    model?: string | undefined;
    maxTokens?: number | undefined;
    temperature?: number | undefined;
}, {
    kind: "cloud";
    provider: "devin" | "cursor" | "codex";
    timeout?: number | undefined;
    apiKey?: string | undefined;
    baseUrl?: string | undefined;
    webhookUrl?: string | undefined;
    apiVersion?: "v1" | "v2" | "v3beta1" | undefined;
    organizationId?: string | undefined;
    repositoryUrl?: string | undefined;
    branch?: string | undefined;
    model?: string | undefined;
    maxTokens?: number | undefined;
    temperature?: number | undefined;
}>, z.ZodObject<{
    kind: z.ZodLiteral<"cli">;
    command: z.ZodString;
    args: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    timeout: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    args: string[];
    kind: "cli";
    command: string;
    timeout?: number | undefined;
}, {
    kind: "cli";
    command: string;
    args?: string[] | undefined;
    timeout?: number | undefined;
}>, z.ZodObject<{
    kind: z.ZodLiteral<"api">;
    endpoint: z.ZodString;
    auth: z.ZodOptional<z.ZodObject<{
        type: z.ZodEnum<["bearer", "basic", "apikey"]>;
        token: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "bearer" | "basic" | "apikey";
        token: string;
    }, {
        type: "bearer" | "basic" | "apikey";
        token: string;
    }>>;
    timeout: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    kind: "api";
    endpoint: string;
    timeout?: number | undefined;
    auth?: {
        type: "bearer" | "basic" | "apikey";
        token: string;
    } | undefined;
}, {
    kind: "api";
    endpoint: string;
    timeout?: number | undefined;
    auth?: {
        type: "bearer" | "basic" | "apikey";
        token: string;
    } | undefined;
}>]>;
export declare const PolicyConfigSchema: z.ZodObject<{
    allowWorkflowEdits: z.ZodDefault<z.ZodBoolean>;
    network: z.ZodDefault<z.ZodEnum<["none", "restricted", "unrestricted"]>>;
    maxAttemptsPerStep: z.ZodDefault<z.ZodNumber>;
    stepTimeoutMinutes: z.ZodDefault<z.ZodNumber>;
    perRepoMaxConcurrentMigrations: z.ZodDefault<z.ZodNumber>;
    riskyGlobs: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    allowlistGlobs: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    allowWorkflowEdits: boolean;
    network: "none" | "restricted" | "unrestricted";
    maxAttemptsPerStep: number;
    stepTimeoutMinutes: number;
    perRepoMaxConcurrentMigrations: number;
    riskyGlobs: string[];
    allowlistGlobs: string[];
}, {
    allowWorkflowEdits?: boolean | undefined;
    network?: "none" | "restricted" | "unrestricted" | undefined;
    maxAttemptsPerStep?: number | undefined;
    stepTimeoutMinutes?: number | undefined;
    perRepoMaxConcurrentMigrations?: number | undefined;
    riskyGlobs?: string[] | undefined;
    allowlistGlobs?: string[] | undefined;
}>;
export declare const RebaseConfigSchema: z.ZodObject<{
    when: z.ZodDefault<z.ZodEnum<["always", "behind-base-branch", "never"]>>;
    allowManual: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    when: "never" | "always" | "behind-base-branch";
    allowManual: boolean;
}, {
    when?: "never" | "always" | "behind-base-branch" | undefined;
    allowManual?: boolean | undefined;
}>;
export declare const AiConfigsSchema: z.ZodObject<{
    provider: z.ZodDefault<z.ZodEnum<["launchdarkly", "local"]>>;
    flagKeyPrefix: z.ZodDefault<z.ZodString>;
    localPromptsDir: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    provider: "launchdarkly" | "local";
    flagKeyPrefix: string;
    localPromptsDir?: string | undefined;
}, {
    provider?: "launchdarkly" | "local" | undefined;
    flagKeyPrefix?: string | undefined;
    localPromptsDir?: string | undefined;
}>;
export declare const StrategyConfigSchema: z.ZodObject<{
    chunkBy: z.ZodDefault<z.ZodEnum<["module", "package", "fileset", "custom"]>>;
    maxOpenPRs: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    chunkBy: "package" | "custom" | "module" | "fileset";
    maxOpenPRs: number;
}, {
    chunkBy?: "package" | "custom" | "module" | "fileset" | undefined;
    maxOpenPRs?: number | undefined;
}>;
export declare const PlansConfigSchema: z.ZodObject<{
    directory: z.ZodDefault<z.ZodString>;
    filenamePattern: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    directory: string;
    filenamePattern: string;
}, {
    directory?: string | undefined;
    filenamePattern?: string | undefined;
}>;
export declare const DependenciesConfigSchema: z.ZodObject<{
    conflictResolution: z.ZodDefault<z.ZodEnum<["fail", "merge", "override"]>>;
    updateStrategy: z.ZodDefault<z.ZodEnum<["manual", "auto"]>>;
}, "strip", z.ZodTypeAny, {
    conflictResolution: "fail" | "merge" | "override";
    updateStrategy: "manual" | "auto";
}, {
    conflictResolution?: "fail" | "merge" | "override" | undefined;
    updateStrategy?: "manual" | "auto" | undefined;
}>;
export declare const HachikoConfigSchema: z.ZodObject<{
    plans: z.ZodDefault<z.ZodObject<{
        directory: z.ZodDefault<z.ZodString>;
        filenamePattern: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        directory: string;
        filenamePattern: string;
    }, {
        directory?: string | undefined;
        filenamePattern?: string | undefined;
    }>>;
    defaults: z.ZodDefault<z.ZodObject<{
        agent: z.ZodDefault<z.ZodString>;
        prParallelism: z.ZodDefault<z.ZodNumber>;
        rebase: z.ZodDefault<z.ZodObject<{
            when: z.ZodDefault<z.ZodEnum<["always", "behind-base-branch", "never"]>>;
            allowManual: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            when: "never" | "always" | "behind-base-branch";
            allowManual: boolean;
        }, {
            when?: "never" | "always" | "behind-base-branch" | undefined;
            allowManual?: boolean | undefined;
        }>>;
        labels: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        requirePlanReview: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        rebase: {
            when: "never" | "always" | "behind-base-branch";
            allowManual: boolean;
        };
        agent: string;
        prParallelism: number;
        labels: string[];
        requirePlanReview: boolean;
    }, {
        rebase?: {
            when?: "never" | "always" | "behind-base-branch" | undefined;
            allowManual?: boolean | undefined;
        } | undefined;
        agent?: string | undefined;
        prParallelism?: number | undefined;
        labels?: string[] | undefined;
        requirePlanReview?: boolean | undefined;
    }>>;
    aiConfigs: z.ZodDefault<z.ZodObject<{
        provider: z.ZodDefault<z.ZodEnum<["launchdarkly", "local"]>>;
        flagKeyPrefix: z.ZodDefault<z.ZodString>;
        localPromptsDir: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        provider: "launchdarkly" | "local";
        flagKeyPrefix: string;
        localPromptsDir?: string | undefined;
    }, {
        provider?: "launchdarkly" | "local" | undefined;
        flagKeyPrefix?: string | undefined;
        localPromptsDir?: string | undefined;
    }>>;
    policy: z.ZodDefault<z.ZodObject<{
        allowWorkflowEdits: z.ZodDefault<z.ZodBoolean>;
        network: z.ZodDefault<z.ZodEnum<["none", "restricted", "unrestricted"]>>;
        maxAttemptsPerStep: z.ZodDefault<z.ZodNumber>;
        stepTimeoutMinutes: z.ZodDefault<z.ZodNumber>;
        perRepoMaxConcurrentMigrations: z.ZodDefault<z.ZodNumber>;
        riskyGlobs: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        allowlistGlobs: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        allowWorkflowEdits: boolean;
        network: "none" | "restricted" | "unrestricted";
        maxAttemptsPerStep: number;
        stepTimeoutMinutes: number;
        perRepoMaxConcurrentMigrations: number;
        riskyGlobs: string[];
        allowlistGlobs: string[];
    }, {
        allowWorkflowEdits?: boolean | undefined;
        network?: "none" | "restricted" | "unrestricted" | undefined;
        maxAttemptsPerStep?: number | undefined;
        stepTimeoutMinutes?: number | undefined;
        perRepoMaxConcurrentMigrations?: number | undefined;
        riskyGlobs?: string[] | undefined;
        allowlistGlobs?: string[] | undefined;
    }>>;
    dependencies: z.ZodDefault<z.ZodObject<{
        conflictResolution: z.ZodDefault<z.ZodEnum<["fail", "merge", "override"]>>;
        updateStrategy: z.ZodDefault<z.ZodEnum<["manual", "auto"]>>;
    }, "strip", z.ZodTypeAny, {
        conflictResolution: "fail" | "merge" | "override";
        updateStrategy: "manual" | "auto";
    }, {
        conflictResolution?: "fail" | "merge" | "override" | undefined;
        updateStrategy?: "manual" | "auto" | undefined;
    }>>;
    agents: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"cloud">;
        provider: z.ZodEnum<["devin", "cursor", "codex"]>;
        apiKey: z.ZodOptional<z.ZodString>;
        baseUrl: z.ZodOptional<z.ZodString>;
        timeout: z.ZodOptional<z.ZodNumber>;
        webhookUrl: z.ZodOptional<z.ZodString>;
        apiVersion: z.ZodOptional<z.ZodEnum<["v1", "v2", "v3beta1"]>>;
        organizationId: z.ZodOptional<z.ZodString>;
        repositoryUrl: z.ZodOptional<z.ZodString>;
        branch: z.ZodOptional<z.ZodString>;
        model: z.ZodOptional<z.ZodString>;
        maxTokens: z.ZodOptional<z.ZodNumber>;
        temperature: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        kind: "cloud";
        provider: "devin" | "cursor" | "codex";
        timeout?: number | undefined;
        apiKey?: string | undefined;
        baseUrl?: string | undefined;
        webhookUrl?: string | undefined;
        apiVersion?: "v1" | "v2" | "v3beta1" | undefined;
        organizationId?: string | undefined;
        repositoryUrl?: string | undefined;
        branch?: string | undefined;
        model?: string | undefined;
        maxTokens?: number | undefined;
        temperature?: number | undefined;
    }, {
        kind: "cloud";
        provider: "devin" | "cursor" | "codex";
        timeout?: number | undefined;
        apiKey?: string | undefined;
        baseUrl?: string | undefined;
        webhookUrl?: string | undefined;
        apiVersion?: "v1" | "v2" | "v3beta1" | undefined;
        organizationId?: string | undefined;
        repositoryUrl?: string | undefined;
        branch?: string | undefined;
        model?: string | undefined;
        maxTokens?: number | undefined;
        temperature?: number | undefined;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"cli">;
        command: z.ZodString;
        args: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        timeout: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        args: string[];
        kind: "cli";
        command: string;
        timeout?: number | undefined;
    }, {
        kind: "cli";
        command: string;
        args?: string[] | undefined;
        timeout?: number | undefined;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"api">;
        endpoint: z.ZodString;
        auth: z.ZodOptional<z.ZodObject<{
            type: z.ZodEnum<["bearer", "basic", "apikey"]>;
            token: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: "bearer" | "basic" | "apikey";
            token: string;
        }, {
            type: "bearer" | "basic" | "apikey";
            token: string;
        }>>;
        timeout: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        kind: "api";
        endpoint: string;
        timeout?: number | undefined;
        auth?: {
            type: "bearer" | "basic" | "apikey";
            token: string;
        } | undefined;
    }, {
        kind: "api";
        endpoint: string;
        timeout?: number | undefined;
        auth?: {
            type: "bearer" | "basic" | "apikey";
            token: string;
        } | undefined;
    }>]>>>;
}, "strip", z.ZodTypeAny, {
    plans: {
        directory: string;
        filenamePattern: string;
    };
    defaults: {
        rebase: {
            when: "never" | "always" | "behind-base-branch";
            allowManual: boolean;
        };
        agent: string;
        prParallelism: number;
        labels: string[];
        requirePlanReview: boolean;
    };
    aiConfigs: {
        provider: "launchdarkly" | "local";
        flagKeyPrefix: string;
        localPromptsDir?: string | undefined;
    };
    policy: {
        allowWorkflowEdits: boolean;
        network: "none" | "restricted" | "unrestricted";
        maxAttemptsPerStep: number;
        stepTimeoutMinutes: number;
        perRepoMaxConcurrentMigrations: number;
        riskyGlobs: string[];
        allowlistGlobs: string[];
    };
    dependencies: {
        conflictResolution: "fail" | "merge" | "override";
        updateStrategy: "manual" | "auto";
    };
    agents: Record<string, {
        args: string[];
        kind: "cli";
        command: string;
        timeout?: number | undefined;
    } | {
        kind: "api";
        endpoint: string;
        timeout?: number | undefined;
        auth?: {
            type: "bearer" | "basic" | "apikey";
            token: string;
        } | undefined;
    } | {
        kind: "cloud";
        provider: "devin" | "cursor" | "codex";
        timeout?: number | undefined;
        apiKey?: string | undefined;
        baseUrl?: string | undefined;
        webhookUrl?: string | undefined;
        apiVersion?: "v1" | "v2" | "v3beta1" | undefined;
        organizationId?: string | undefined;
        repositoryUrl?: string | undefined;
        branch?: string | undefined;
        model?: string | undefined;
        maxTokens?: number | undefined;
        temperature?: number | undefined;
    }>;
}, {
    plans?: {
        directory?: string | undefined;
        filenamePattern?: string | undefined;
    } | undefined;
    defaults?: {
        rebase?: {
            when?: "never" | "always" | "behind-base-branch" | undefined;
            allowManual?: boolean | undefined;
        } | undefined;
        agent?: string | undefined;
        prParallelism?: number | undefined;
        labels?: string[] | undefined;
        requirePlanReview?: boolean | undefined;
    } | undefined;
    aiConfigs?: {
        provider?: "launchdarkly" | "local" | undefined;
        flagKeyPrefix?: string | undefined;
        localPromptsDir?: string | undefined;
    } | undefined;
    policy?: {
        allowWorkflowEdits?: boolean | undefined;
        network?: "none" | "restricted" | "unrestricted" | undefined;
        maxAttemptsPerStep?: number | undefined;
        stepTimeoutMinutes?: number | undefined;
        perRepoMaxConcurrentMigrations?: number | undefined;
        riskyGlobs?: string[] | undefined;
        allowlistGlobs?: string[] | undefined;
    } | undefined;
    dependencies?: {
        conflictResolution?: "fail" | "merge" | "override" | undefined;
        updateStrategy?: "manual" | "auto" | undefined;
    } | undefined;
    agents?: Record<string, {
        kind: "cli";
        command: string;
        args?: string[] | undefined;
        timeout?: number | undefined;
    } | {
        kind: "api";
        endpoint: string;
        timeout?: number | undefined;
        auth?: {
            type: "bearer" | "basic" | "apikey";
            token: string;
        } | undefined;
    } | {
        kind: "cloud";
        provider: "devin" | "cursor" | "codex";
        timeout?: number | undefined;
        apiKey?: string | undefined;
        baseUrl?: string | undefined;
        webhookUrl?: string | undefined;
        apiVersion?: "v1" | "v2" | "v3beta1" | undefined;
        organizationId?: string | undefined;
        repositoryUrl?: string | undefined;
        branch?: string | undefined;
        model?: string | undefined;
        maxTokens?: number | undefined;
        temperature?: number | undefined;
    }> | undefined;
}>;
export type HachikoConfig = z.infer<typeof HachikoConfigSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type AgentCloudConfig = z.infer<typeof AgentCloudConfigSchema>;
export type AgentCliConfig = z.infer<typeof AgentCliConfigSchema>;
export type AgentApiConfig = z.infer<typeof AgentApiConfigSchema>;
export type PolicyConfig = z.infer<typeof PolicyConfigSchema>;
export type StrategyConfig = z.infer<typeof StrategyConfigSchema>;
export declare const MigrationStepSchema: z.ZodObject<{
    id: z.ZodString;
    description: z.ZodString;
    expectedPR: z.ZodDefault<z.ZodBoolean>;
    agent: z.ZodOptional<z.ZodString>;
    timeout: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    id: string;
    description: string;
    expectedPR: boolean;
    timeout?: number | undefined;
    agent?: string | undefined;
}, {
    id: string;
    description: string;
    timeout?: number | undefined;
    agent?: string | undefined;
    expectedPR?: boolean | undefined;
}>;
export declare const MigrationChecksSchema: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
export declare const MigrationRollbackSchema: z.ZodDefault<z.ZodArray<z.ZodObject<{
    description: z.ZodString;
    command: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    description: string;
    command?: string | undefined;
}, {
    description: string;
    command?: string | undefined;
}>, "many">>;
export declare const MigrationStatusSchema: z.ZodDefault<z.ZodEnum<["draft", "plan-approved", "queued", "running", "awaiting-review", "paused", "failed", "done", "cancelled", "skipped"]>>;
export declare const MigrationFrontmatterSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    owner: z.ZodString;
    status: z.ZodDefault<z.ZodEnum<["draft", "plan-approved", "queued", "running", "awaiting-review", "paused", "failed", "done", "cancelled", "skipped"]>>;
    agent: z.ZodOptional<z.ZodString>;
    strategy: z.ZodDefault<z.ZodObject<{
        chunkBy: z.ZodDefault<z.ZodEnum<["module", "package", "fileset", "custom"]>>;
        maxOpenPRs: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        chunkBy: "package" | "custom" | "module" | "fileset";
        maxOpenPRs: number;
    }, {
        chunkBy?: "package" | "custom" | "module" | "fileset" | undefined;
        maxOpenPRs?: number | undefined;
    }>>;
    checks: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    rollback: z.ZodDefault<z.ZodArray<z.ZodObject<{
        description: z.ZodString;
        command: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        description: string;
        command?: string | undefined;
    }, {
        description: string;
        command?: string | undefined;
    }>, "many">>;
    successCriteria: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    steps: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        description: z.ZodString;
        expectedPR: z.ZodDefault<z.ZodBoolean>;
        agent: z.ZodOptional<z.ZodString>;
        timeout: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        description: string;
        expectedPR: boolean;
        timeout?: number | undefined;
        agent?: string | undefined;
    }, {
        id: string;
        description: string;
        timeout?: number | undefined;
        agent?: string | undefined;
        expectedPR?: boolean | undefined;
    }>, "many">>;
    dependsOn: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    touches: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    attempts: z.ZodDefault<z.ZodNumber>;
    lastError: z.ZodOptional<z.ZodString>;
    currentStep: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "draft" | "plan-approved" | "queued" | "running" | "awaiting-review" | "paused" | "failed" | "done" | "cancelled" | "skipped";
    owner: string;
    id: string;
    title: string;
    strategy: {
        chunkBy: "package" | "custom" | "module" | "fileset";
        maxOpenPRs: number;
    };
    checks: string[];
    rollback: {
        description: string;
        command?: string | undefined;
    }[];
    successCriteria: string[];
    steps: {
        id: string;
        description: string;
        expectedPR: boolean;
        timeout?: number | undefined;
        agent?: string | undefined;
    }[];
    dependsOn: string[];
    touches: string[];
    attempts: number;
    agent?: string | undefined;
    lastError?: string | undefined;
    currentStep?: string | undefined;
}, {
    owner: string;
    id: string;
    title: string;
    status?: "draft" | "plan-approved" | "queued" | "running" | "awaiting-review" | "paused" | "failed" | "done" | "cancelled" | "skipped" | undefined;
    agent?: string | undefined;
    strategy?: {
        chunkBy?: "package" | "custom" | "module" | "fileset" | undefined;
        maxOpenPRs?: number | undefined;
    } | undefined;
    checks?: string[] | undefined;
    rollback?: {
        description: string;
        command?: string | undefined;
    }[] | undefined;
    successCriteria?: string[] | undefined;
    steps?: {
        id: string;
        description: string;
        timeout?: number | undefined;
        agent?: string | undefined;
        expectedPR?: boolean | undefined;
    }[] | undefined;
    dependsOn?: string[] | undefined;
    touches?: string[] | undefined;
    attempts?: number | undefined;
    lastError?: string | undefined;
    currentStep?: string | undefined;
}>;
export type MigrationFrontmatter = z.infer<typeof MigrationFrontmatterSchema>;
export type MigrationStep = z.infer<typeof MigrationStepSchema>;
export type MigrationStatus = z.infer<typeof MigrationStatusSchema>;
export declare function validateHachikoConfig(config: unknown): HachikoConfig;
export declare function validateMigrationFrontmatter(frontmatter: unknown): MigrationFrontmatter;
export declare function mergeConfigs(base: HachikoConfig, override: Partial<HachikoConfig>): HachikoConfig;
//# sourceMappingURL=schema.d.ts.map