import type { AgentInput, AgentResult, PolicyConfig } from "../types.js";
import { BaseAgentAdapter } from "./base.js";
export interface MockAgentConfig {
    /** Simulate success rate (0-1) */
    successRate?: number;
    /** Simulated execution time in ms */
    executionTime?: number;
    /** Whether to actually modify files */
    modifyFiles?: boolean;
}
/**
 * Mock agent adapter for testing and development
 */
export declare class MockAgentAdapter extends BaseAgentAdapter {
    readonly name = "mock";
    private readonly mockConfig;
    constructor(policyConfig: PolicyConfig, mockConfig?: MockAgentConfig);
    validate(): Promise<boolean>;
    execute(input: AgentInput): Promise<AgentResult>;
    getConfig(): Record<string, unknown>;
}
//# sourceMappingURL=mock.d.ts.map