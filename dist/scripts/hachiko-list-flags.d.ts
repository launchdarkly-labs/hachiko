#!/usr/bin/env tsx
/**
 * Hachiko Feature Flag List Script
 *
 * This script lists all LaunchDarkly feature flags for the hachiko project.
 * It uses the LaunchDarkly Management API to fetch flags.
 *
 * Note: This is a CLI script, so console.log usage is intentional for user output.
 */
import type { HachikoConfig } from "../config/schema.js";
interface FlagInfo {
    key: string;
    name: string;
    description: string;
    kind: string;
    on: boolean;
    variations: unknown[];
}
export declare function loadConfig(): Promise<HachikoConfig>;
export declare function fetchFlags(apiToken: string, projectKey: string, environment: string): Promise<FlagInfo[]>;
export declare function filterHachikoFlags(flags: FlagInfo[], prefix: string): FlagInfo[];
export declare function displayFlags(flags: FlagInfo[]): void;
export {};
//# sourceMappingURL=hachiko-list-flags.d.ts.map