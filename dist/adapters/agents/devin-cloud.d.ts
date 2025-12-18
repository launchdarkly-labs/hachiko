import type { AgentInput, AgentResult, PolicyConfig } from "../types.js";
import { BaseAgentAdapter } from "./base.js";
export interface DevinCloudConfig {
    /** API base URL (default: https://api.devin.ai) */
    baseUrl?: string;
    /** API key for authentication */
    apiKey: string;
    /** API version (v1, v2, v3beta1) */
    apiVersion?: string;
    /** Organization ID for v3 API */
    organizationId?: string;
    /** Request timeout in seconds */
    timeout?: number;
    /** Webhook URL for completion notifications */
    webhookUrl?: string;
}
/**
 * Devin Cloud API agent adapter
 */
export declare class DevinCloudAdapter extends BaseAgentAdapter {
    readonly name = "devin-cloud";
    private readonly devinConfig;
    private readonly baseUrl;
    private readonly apiVersion;
    constructor(policyConfig: PolicyConfig, devinConfig: DevinCloudConfig);
    validate(): Promise<boolean>;
    execute(input: AgentInput): Promise<AgentResult>;
    getConfig(): Record<string, unknown>;
    /**
     * Get authentication headers for Devin API
     */
    private getAuthHeaders;
    /**
     * Build comprehensive prompt for Devin
     */
    private buildPrompt;
}
//# sourceMappingURL=devin-cloud.d.ts.map