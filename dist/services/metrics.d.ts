import type { AgentResult } from "../adapters/types.js";
import type { HachikoConfig } from "../config/schema.js";
import type { MigrationProgress } from "./state.js";
/**
 * Metric types
 */
export declare const MetricType: {
  readonly COUNTER: "counter";
  readonly GAUGE: "gauge";
  readonly HISTOGRAM: "histogram";
  readonly TIMER: "timer";
};
export type MetricTypeType = (typeof MetricType)[keyof typeof MetricType];
/**
 * Metric data structure
 */
export interface Metric {
  name: string;
  type: MetricTypeType;
  value: number;
  timestamp: number;
  tags: Record<string, string>;
  metadata?: Record<string, unknown> | undefined;
}
/**
 * Migration metrics
 */
export interface MigrationMetrics {
  planId: string;
  totalExecutionTime: number;
  totalSteps: number;
  successfulSteps: number;
  failedSteps: number;
  skippedSteps: number;
  avgStepExecutionTime: number;
  agentSuccessRate: number;
  policyViolations: number;
  retryCount: number;
  filesModified: number;
  filesCreated: number;
  linesChanged: number;
}
/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  timestamp: number;
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  cpuUsage: {
    user: number;
    system: number;
  };
  eventLoopDelay: number;
  gcMetrics?: {
    minor: number;
    major: number;
    incremental: number;
  };
}
/**
 * Metrics collector and reporter
 */
export declare class MetricsCollector {
  private static instance;
  private metrics;
  private migrationMetrics;
  private config;
  private initialized;
  private reportingInterval;
  private constructor();
  static getInstance(): MetricsCollector;
  /**
   * Initialize metrics collector
   */
  initialize(config: HachikoConfig): Promise<void>;
  /**
   * Record a custom metric
   */
  recordMetric(
    name: string,
    type: MetricTypeType,
    value: number,
    tags?: Record<string, string>,
    metadata?: Record<string, unknown>
  ): void;
  /**
   * Record migration start
   */
  recordMigrationStart(planId: string, totalSteps: number): void;
  /**
   * Record step execution
   */
  recordStepExecution(
    planId: string,
    stepId: string,
    agentResult: AgentResult,
    policyViolations?: number
  ): void;
  /**
   * Record migration completion
   */
  recordMigrationCompletion(planId: string, progress: MigrationProgress): void;
  /**
   * Get metrics for a time range
   */
  getMetrics(startTime?: number, endTime?: number, namePattern?: string): Metric[];
  /**
   * Get migration metrics
   */
  getMigrationMetrics(planId?: string): MigrationMetrics[];
  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics;
  /**
   * Generate metrics summary
   */
  generateSummary(timeRangeHours?: number): {
    totalMigrations: number;
    successfulMigrations: number;
    failedMigrations: number;
    avgExecutionTime: number;
    totalStepsExecuted: number;
    avgSuccessRate: number;
    topErrors: Array<{
      error: string;
      count: number;
    }>;
  };
  /**
   * Export metrics in Prometheus format
   */
  exportPrometheusMetrics(): string;
  /**
   * Clear all metrics
   */
  clearMetrics(): void;
  /**
   * Shutdown metrics collector
   */
  shutdown(): Promise<void>;
  /**
   * Start collecting performance metrics
   */
  private startPerformanceCollection;
}
/**
 * Factory function to get metrics collector instance
 */
export declare function createMetricsCollector(): MetricsCollector;
/**
 * Initialize metrics collector from configuration
 */
export declare function initializeMetrics(config: HachikoConfig): Promise<MetricsCollector>;
//# sourceMappingURL=metrics.d.ts.map
