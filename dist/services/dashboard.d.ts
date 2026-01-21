/**
 * Service for generating migration dashboards using state inference
 * Replaces frontmatter-based state tracking with PR activity analysis
 */
import type { ContextWithRepository } from "../types/context.js";
import type { Logger } from "../utils/logger.js";
import { type MigrationStateInfo } from "./state-inference.js";
export interface MigrationDashboardEntry {
    id: string;
    title: string;
    state: string;
    stateInfo: MigrationStateInfo;
    summary: string;
    filePath: string;
}
export interface MigrationDashboard {
    lastUpdated: string;
    totalMigrations: number;
    pending: MigrationDashboardEntry[];
    active: MigrationDashboardEntry[];
    paused: MigrationDashboardEntry[];
    completed: MigrationDashboardEntry[];
}
/**
 * Generate complete migration dashboard with inferred states
 */
export declare function generateMigrationDashboard(context: ContextWithRepository, logger?: Logger): Promise<MigrationDashboard>;
/**
 * Generate markdown representation of the dashboard
 */
export declare function generateDashboardMarkdown(dashboard: MigrationDashboard): string;
/**
 * Update dashboard and commit to repository
 * This would be called by webhooks or scheduled jobs
 */
export declare function updateDashboardInRepo(context: ContextWithRepository, dashboardPath?: string, logger?: Logger): Promise<void>;
//# sourceMappingURL=dashboard.d.ts.map