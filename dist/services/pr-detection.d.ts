/**
 * Service for detecting and identifying Hachiko PRs using multiple identification methods
 * Based on the state inference plan: branch naming, labels, and title patterns
 */
import type { ContextWithRepository } from "../types/context.js";
import type { Logger } from "../utils/logger.js";
export interface HachikoPR {
    number: number;
    title: string;
    state: "open" | "closed";
    migrationId: string;
    branch: string;
    labels: string[];
    url: string;
    merged: boolean;
}
export interface PullRequest {
    number: number;
    title: string;
    body: string | null;
    state: "open" | "closed";
    head: {
        ref: string;
    };
    labels: Array<{
        name: string;
    }>;
    html_url: string;
    merged_at: string | null;
}
/**
 * Detect if a PR is a Hachiko migration PR and extract migration ID
 * Uses triple identification: branch name, labels, and title
 */
export declare function detectHachikoPR(pr: PullRequest): HachikoPR | null;
/**
 * Extract migration ID from PR using multiple identification methods
 * Method 1: Branch naming - hachiko/{migration-id} or hachiko/{migration-id}-*
 * Method 2: Tracking token in PR body or title - hachiko-track:{migration-id}:{step-id}
 * Method 3: PR title - contains [{migration-id}] somewhere
 */
export declare function extractMigrationId(pr: PullRequest): string | null;
/**
 * Get all open Hachiko PRs for a specific migration
 */
export declare function getOpenHachikoPRs(context: ContextWithRepository, migrationId: string, logger?: Logger): Promise<HachikoPR[]>;
/**
 * Get all closed Hachiko PRs for a specific migration
 */
export declare function getClosedHachikoPRs(context: ContextWithRepository, migrationId: string, logger?: Logger): Promise<HachikoPR[]>;
/**
 * Get all Hachiko PRs for a specific migration and state
 */
export declare function getHachikoPRs(context: ContextWithRepository, migrationId: string, state: "open" | "closed" | "all", logger?: Logger): Promise<HachikoPR[]>;
/**
 * Get all open Hachiko PRs across all migrations
 */
export declare function getAllOpenHachikoPRs(context: ContextWithRepository, logger?: Logger): Promise<HachikoPR[]>;
/**
 * Validate that a PR follows Hachiko conventions
 * Returns validation results with recommendations
 */
export interface PRValidationResult {
    isValid: boolean;
    migrationId: string | null;
    identificationMethods: string[];
    recommendations: string[];
}
export declare function validateHachikoPR(pr: PullRequest): PRValidationResult;
//# sourceMappingURL=pr-detection.d.ts.map