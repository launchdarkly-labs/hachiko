import type { AgentResult } from "../adapters/types.js"
import type { HachikoConfig } from "../config/schema.js"
import { createLogger } from "../utils/logger.js"
import type { MigrationProgress } from "./state.js"

const logger = createLogger("metrics")

/**
 * Metric types
 */
export const MetricType = {
  COUNTER: "counter",
  GAUGE: "gauge",
  HISTOGRAM: "histogram",
  TIMER: "timer",
} as const

export type MetricTypeType = (typeof MetricType)[keyof typeof MetricType]

/**
 * Metric data structure
 */
export interface Metric {
  name: string
  type: MetricTypeType
  value: number
  timestamp: number
  tags: Record<string, string>
  metadata?: Record<string, unknown> | undefined
}

/**
 * Migration metrics
 */
export interface MigrationMetrics {
  planId: string
  totalExecutionTime: number
  totalSteps: number
  successfulSteps: number
  failedSteps: number
  skippedSteps: number
  avgStepExecutionTime: number
  agentSuccessRate: number
  policyViolations: number
  retryCount: number
  filesModified: number
  filesCreated: number
  linesChanged: number
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  timestamp: number
  memoryUsage: {
    heapUsed: number
    heapTotal: number
    external: number
    rss: number
  }
  cpuUsage: {
    user: number
    system: number
  }
  eventLoopDelay: number
  gcMetrics?: {
    minor: number
    major: number
    incremental: number
  }
}

/**
 * Metrics collector and reporter
 */
export class MetricsCollector {
  private static instance: MetricsCollector | null = null
  private metrics: Metric[] = []
  private migrationMetrics = new Map<string, MigrationMetrics>()
  private config: HachikoConfig | null = null
  private initialized = false
  private reportingInterval: NodeJS.Timeout | null = null

  private constructor() {}

  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector()
    }
    return MetricsCollector.instance
  }

  /**
   * Initialize metrics collector
   */
  async initialize(config: HachikoConfig): Promise<void> {
    if (this.initialized) {
      return
    }

    this.config = config
    this.initialized = true

    // Start periodic performance metric collection
    this.startPerformanceCollection()

    logger.info("Metrics collector initialized")
  }

  /**
   * Record a custom metric
   */
  recordMetric(
    name: string,
    type: MetricTypeType,
    value: number,
    tags: Record<string, string> = {},
    metadata?: Record<string, unknown>
  ): void {
    const metric: Metric = {
      name,
      type,
      value,
      timestamp: Date.now(),
      tags,
      metadata: metadata || undefined,
    }

    this.metrics.push(metric)

    // Keep only last 10000 metrics to prevent memory issues
    if (this.metrics.length > 10000) {
      this.metrics = this.metrics.slice(-5000)
    }

    logger.debug({ metric }, "Metric recorded")
  }

  /**
   * Record migration start
   */
  recordMigrationStart(planId: string, totalSteps: number): void {
    this.migrationMetrics.set(planId, {
      planId,
      totalExecutionTime: 0,
      totalSteps,
      successfulSteps: 0,
      failedSteps: 0,
      skippedSteps: 0,
      avgStepExecutionTime: 0,
      agentSuccessRate: 0,
      policyViolations: 0,
      retryCount: 0,
      filesModified: 0,
      filesCreated: 0,
      linesChanged: 0,
    })

    this.recordMetric("migration_started", MetricType.COUNTER, 1, { planId })
  }

  /**
   * Record step execution
   */
  recordStepExecution(
    planId: string,
    stepId: string,
    agentResult: AgentResult,
    policyViolations = 0
  ): void {
    const migrationMetrics = this.migrationMetrics.get(planId)
    if (!migrationMetrics) {
      logger.warn({ planId }, "Migration metrics not found for step execution")
      return
    }

    // Update migration metrics
    if (agentResult.success) {
      migrationMetrics.successfulSteps++
    } else {
      migrationMetrics.failedSteps++
    }

    migrationMetrics.filesModified += agentResult.modifiedFiles.length
    migrationMetrics.filesCreated += agentResult.createdFiles.length
    migrationMetrics.policyViolations += policyViolations

    // Recalculate averages
    const completedSteps =
      migrationMetrics.successfulSteps +
      migrationMetrics.failedSteps +
      migrationMetrics.skippedSteps
    if (completedSteps > 0) {
      migrationMetrics.agentSuccessRate = migrationMetrics.successfulSteps / completedSteps
    }

    // Record individual metrics
    this.recordMetric("step_execution_time", MetricType.HISTOGRAM, agentResult.executionTime, {
      planId,
      stepId,
      success: agentResult.success.toString(),
    })

    this.recordMetric("step_files_modified", MetricType.GAUGE, agentResult.modifiedFiles.length, {
      planId,
      stepId,
    })

    this.recordMetric("step_files_created", MetricType.GAUGE, agentResult.createdFiles.length, {
      planId,
      stepId,
    })

    if (policyViolations > 0) {
      this.recordMetric("policy_violations", MetricType.COUNTER, policyViolations, {
        planId,
        stepId,
      })
    }

    logger.debug(
      {
        planId,
        stepId,
        success: agentResult.success,
        executionTime: agentResult.executionTime,
        filesModified: agentResult.modifiedFiles.length,
      },
      "Step execution metrics recorded"
    )
  }

  /**
   * Record migration completion
   */
  recordMigrationCompletion(planId: string, progress: MigrationProgress): void {
    const migrationMetrics = this.migrationMetrics.get(planId)
    if (!migrationMetrics) {
      logger.warn({ planId }, "Migration metrics not found for completion")
      return
    }

    // Calculate total execution time
    if (progress.startedAt && progress.completedAt) {
      const startTime = new Date(progress.startedAt).getTime()
      const endTime = new Date(progress.completedAt).getTime()
      migrationMetrics.totalExecutionTime = endTime - startTime
    }

    // Record completion metrics
    this.recordMetric("migration_completed", MetricType.COUNTER, 1, {
      planId,
      state: progress.state,
    })

    this.recordMetric(
      "migration_total_time",
      MetricType.HISTOGRAM,
      migrationMetrics.totalExecutionTime,
      {
        planId,
      }
    )

    this.recordMetric(
      "migration_success_rate",
      MetricType.GAUGE,
      migrationMetrics.agentSuccessRate,
      {
        planId,
      }
    )

    this.recordMetric(
      "migration_files_modified",
      MetricType.GAUGE,
      migrationMetrics.filesModified,
      {
        planId,
      }
    )

    logger.info(
      {
        planId,
        state: progress.state,
        totalTime: migrationMetrics.totalExecutionTime,
        successRate: migrationMetrics.agentSuccessRate,
        filesModified: migrationMetrics.filesModified,
      },
      "Migration completion metrics recorded"
    )
  }

  /**
   * Get metrics for a time range
   */
  getMetrics(startTime?: number, endTime?: number, namePattern?: string): Metric[] {
    let filtered = this.metrics

    if (startTime) {
      filtered = filtered.filter((m) => m.timestamp >= startTime)
    }

    if (endTime) {
      filtered = filtered.filter((m) => m.timestamp <= endTime)
    }

    if (namePattern) {
      const regex = new RegExp(namePattern)
      filtered = filtered.filter((m) => regex.test(m.name))
    }

    return filtered
  }

  /**
   * Get migration metrics
   */
  getMigrationMetrics(planId?: string): MigrationMetrics[] {
    if (planId) {
      const metrics = this.migrationMetrics.get(planId)
      return metrics ? [metrics] : []
    }

    return Array.from(this.migrationMetrics.values())
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    const memUsage = process.memoryUsage()
    const cpuUsage = process.cpuUsage()

    return {
      timestamp: Date.now(),
      memoryUsage: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss,
      },
      cpuUsage: {
        user: cpuUsage.user,
        system: cpuUsage.system,
      },
      eventLoopDelay: 0, // Would need perf_hooks.monitorEventLoopDelay for real implementation
    }
  }

  /**
   * Generate metrics summary
   */
  generateSummary(timeRangeHours = 24): {
    totalMigrations: number
    successfulMigrations: number
    failedMigrations: number
    avgExecutionTime: number
    totalStepsExecuted: number
    avgSuccessRate: number
    topErrors: Array<{ error: string; count: number }>
  } {
    const cutoffTime = Date.now() - timeRangeHours * 60 * 60 * 1000
    const recentMetrics = this.getMetrics(cutoffTime)

    const migrationStarts = recentMetrics.filter((m) => m.name === "migration_started").length
    const migrationCompletions = recentMetrics.filter((m) => m.name === "migration_completed")
    const successfulMigrations = migrationCompletions.filter(
      (m) => m.tags.state === "completed"
    ).length
    const failedMigrations = migrationCompletions.filter((m) => m.tags.state === "failed").length

    const executionTimes = recentMetrics
      .filter((m) => m.name === "migration_total_time")
      .map((m) => m.value)
    const avgExecutionTime =
      executionTimes.length > 0
        ? executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length
        : 0

    const stepExecutions = recentMetrics.filter((m) => m.name === "step_execution_time").length

    const successRates = recentMetrics
      .filter((m) => m.name === "migration_success_rate")
      .map((m) => m.value)
    const avgSuccessRate =
      successRates.length > 0 ? successRates.reduce((a, b) => a + b, 0) / successRates.length : 0

    return {
      totalMigrations: migrationStarts,
      successfulMigrations,
      failedMigrations,
      avgExecutionTime,
      totalStepsExecuted: stepExecutions,
      avgSuccessRate,
      topErrors: [], // Would implement error tracking for this
    }
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheusMetrics(): string {
    const lines: string[] = []
    const metricGroups = new Map<string, Metric[]>()

    // Group metrics by name
    for (const metric of this.metrics) {
      if (!metricGroups.has(metric.name)) {
        metricGroups.set(metric.name, [])
      }
      metricGroups.get(metric.name)?.push(metric)
    }

    // Generate Prometheus format
    for (const [name, metrics] of metricGroups) {
      const latestMetric = metrics[metrics.length - 1]!

      // Add help and type comments
      lines.push(`# HELP ${name} Hachiko metric`)
      lines.push(`# TYPE ${name} ${latestMetric.type}`)

      // Add metric values
      for (const metric of metrics.slice(-10)) {
        // Last 10 values
        const tags = Object.entries(metric.tags)
          .map(([key, value]) => `${key}="${value}"`)
          .join(",")

        const tagString = tags ? `{${tags}}` : ""
        lines.push(`${name}${tagString} ${metric.value} ${metric.timestamp}`)
      }

      lines.push("")
    }

    return lines.join("\n")
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metrics = []
    this.migrationMetrics.clear()
    logger.info("All metrics cleared")
  }

  /**
   * Shutdown metrics collector
   */
  async shutdown(): Promise<void> {
    if (this.reportingInterval) {
      clearInterval(this.reportingInterval)
      this.reportingInterval = null
    }

    this.initialized = false
    logger.info("Metrics collector shutdown")
  }

  /**
   * Start collecting performance metrics
   */
  private startPerformanceCollection(): void {
    this.reportingInterval = setInterval(() => {
      const perfMetrics = this.getPerformanceMetrics()

      this.recordMetric("memory_heap_used", MetricType.GAUGE, perfMetrics.memoryUsage.heapUsed)
      this.recordMetric("memory_heap_total", MetricType.GAUGE, perfMetrics.memoryUsage.heapTotal)
      this.recordMetric("memory_rss", MetricType.GAUGE, perfMetrics.memoryUsage.rss)
      this.recordMetric("cpu_user", MetricType.GAUGE, perfMetrics.cpuUsage.user)
      this.recordMetric("cpu_system", MetricType.GAUGE, perfMetrics.cpuUsage.system)
    }, 30000) // Every 30 seconds
  }
}

/**
 * Factory function to get metrics collector instance
 */
export function createMetricsCollector(): MetricsCollector {
  return MetricsCollector.getInstance()
}

/**
 * Initialize metrics collector from configuration
 */
export async function initializeMetrics(config: HachikoConfig): Promise<MetricsCollector> {
  const collector = createMetricsCollector()
  await collector.initialize(config)
  return collector
}
