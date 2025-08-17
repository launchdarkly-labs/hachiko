"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsCollector = exports.MetricType = void 0;
exports.createMetricsCollector = createMetricsCollector;
exports.initializeMetrics = initializeMetrics;
const logger_js_1 = require("../utils/logger.js");
const logger = (0, logger_js_1.createLogger)("metrics");
/**
 * Metric types
 */
exports.MetricType = {
    COUNTER: "counter",
    GAUGE: "gauge",
    HISTOGRAM: "histogram",
    TIMER: "timer",
};
/**
 * Metrics collector and reporter
 */
class MetricsCollector {
    static instance = null;
    metrics = [];
    migrationMetrics = new Map();
    config = null;
    initialized = false;
    reportingInterval = null;
    constructor() { }
    static getInstance() {
        if (!this.instance) {
            this.instance = new MetricsCollector();
        }
        return this.instance;
    }
    /**
     * Initialize metrics collector
     */
    async initialize(config) {
        if (this.initialized) {
            return;
        }
        this.config = config;
        this.initialized = true;
        // Start periodic performance metric collection
        this.startPerformanceCollection();
        logger.info("Metrics collector initialized");
    }
    /**
     * Record a custom metric
     */
    recordMetric(name, type, value, tags = {}, metadata) {
        const metric = {
            name,
            type,
            value,
            timestamp: Date.now(),
            tags,
            metadata: metadata || undefined,
        };
        this.metrics.push(metric);
        // Keep only last 10000 metrics to prevent memory issues
        if (this.metrics.length > 10000) {
            this.metrics = this.metrics.slice(-5000);
        }
        logger.debug({ metric }, "Metric recorded");
    }
    /**
     * Record migration start
     */
    recordMigrationStart(planId, totalSteps) {
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
        });
        this.recordMetric("migration_started", exports.MetricType.COUNTER, 1, { planId });
    }
    /**
     * Record step execution
     */
    recordStepExecution(planId, stepId, agentResult, policyViolations = 0) {
        const migrationMetrics = this.migrationMetrics.get(planId);
        if (!migrationMetrics) {
            logger.warn({ planId }, "Migration metrics not found for step execution");
            return;
        }
        // Update migration metrics
        if (agentResult.success) {
            migrationMetrics.successfulSteps++;
        }
        else {
            migrationMetrics.failedSteps++;
        }
        migrationMetrics.filesModified += agentResult.modifiedFiles.length;
        migrationMetrics.filesCreated += agentResult.createdFiles.length;
        migrationMetrics.policyViolations += policyViolations;
        // Recalculate averages
        const completedSteps = migrationMetrics.successfulSteps + migrationMetrics.failedSteps + migrationMetrics.skippedSteps;
        if (completedSteps > 0) {
            migrationMetrics.agentSuccessRate = migrationMetrics.successfulSteps / completedSteps;
        }
        // Record individual metrics
        this.recordMetric("step_execution_time", exports.MetricType.HISTOGRAM, agentResult.executionTime, {
            planId,
            stepId,
            success: agentResult.success.toString(),
        });
        this.recordMetric("step_files_modified", exports.MetricType.GAUGE, agentResult.modifiedFiles.length, {
            planId,
            stepId,
        });
        this.recordMetric("step_files_created", exports.MetricType.GAUGE, agentResult.createdFiles.length, {
            planId,
            stepId,
        });
        if (policyViolations > 0) {
            this.recordMetric("policy_violations", exports.MetricType.COUNTER, policyViolations, {
                planId,
                stepId,
            });
        }
        logger.debug({
            planId,
            stepId,
            success: agentResult.success,
            executionTime: agentResult.executionTime,
            filesModified: agentResult.modifiedFiles.length,
        }, "Step execution metrics recorded");
    }
    /**
     * Record migration completion
     */
    recordMigrationCompletion(planId, progress) {
        const migrationMetrics = this.migrationMetrics.get(planId);
        if (!migrationMetrics) {
            logger.warn({ planId }, "Migration metrics not found for completion");
            return;
        }
        // Calculate total execution time
        if (progress.startedAt && progress.completedAt) {
            const startTime = new Date(progress.startedAt).getTime();
            const endTime = new Date(progress.completedAt).getTime();
            migrationMetrics.totalExecutionTime = endTime - startTime;
        }
        // Record completion metrics
        this.recordMetric("migration_completed", exports.MetricType.COUNTER, 1, {
            planId,
            state: progress.state,
        });
        this.recordMetric("migration_total_time", exports.MetricType.HISTOGRAM, migrationMetrics.totalExecutionTime, {
            planId,
        });
        this.recordMetric("migration_success_rate", exports.MetricType.GAUGE, migrationMetrics.agentSuccessRate, {
            planId,
        });
        this.recordMetric("migration_files_modified", exports.MetricType.GAUGE, migrationMetrics.filesModified, {
            planId,
        });
        logger.info({
            planId,
            state: progress.state,
            totalTime: migrationMetrics.totalExecutionTime,
            successRate: migrationMetrics.agentSuccessRate,
            filesModified: migrationMetrics.filesModified,
        }, "Migration completion metrics recorded");
    }
    /**
     * Get metrics for a time range
     */
    getMetrics(startTime, endTime, namePattern) {
        let filtered = this.metrics;
        if (startTime) {
            filtered = filtered.filter(m => m.timestamp >= startTime);
        }
        if (endTime) {
            filtered = filtered.filter(m => m.timestamp <= endTime);
        }
        if (namePattern) {
            const regex = new RegExp(namePattern);
            filtered = filtered.filter(m => regex.test(m.name));
        }
        return filtered;
    }
    /**
     * Get migration metrics
     */
    getMigrationMetrics(planId) {
        if (planId) {
            const metrics = this.migrationMetrics.get(planId);
            return metrics ? [metrics] : [];
        }
        return Array.from(this.migrationMetrics.values());
    }
    /**
     * Get performance metrics
     */
    getPerformanceMetrics() {
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
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
        };
    }
    /**
     * Generate metrics summary
     */
    generateSummary(timeRangeHours = 24) {
        const cutoffTime = Date.now() - (timeRangeHours * 60 * 60 * 1000);
        const recentMetrics = this.getMetrics(cutoffTime);
        const migrationStarts = recentMetrics.filter(m => m.name === "migration_started").length;
        const migrationCompletions = recentMetrics.filter(m => m.name === "migration_completed");
        const successfulMigrations = migrationCompletions.filter(m => m.tags.state === "completed").length;
        const failedMigrations = migrationCompletions.filter(m => m.tags.state === "failed").length;
        const executionTimes = recentMetrics
            .filter(m => m.name === "migration_total_time")
            .map(m => m.value);
        const avgExecutionTime = executionTimes.length > 0 ?
            executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length : 0;
        const stepExecutions = recentMetrics.filter(m => m.name === "step_execution_time").length;
        const successRates = recentMetrics
            .filter(m => m.name === "migration_success_rate")
            .map(m => m.value);
        const avgSuccessRate = successRates.length > 0 ?
            successRates.reduce((a, b) => a + b, 0) / successRates.length : 0;
        return {
            totalMigrations: migrationStarts,
            successfulMigrations,
            failedMigrations,
            avgExecutionTime,
            totalStepsExecuted: stepExecutions,
            avgSuccessRate,
            topErrors: [], // Would implement error tracking for this
        };
    }
    /**
     * Export metrics in Prometheus format
     */
    exportPrometheusMetrics() {
        const lines = [];
        const metricGroups = new Map();
        // Group metrics by name
        for (const metric of this.metrics) {
            if (!metricGroups.has(metric.name)) {
                metricGroups.set(metric.name, []);
            }
            metricGroups.get(metric.name).push(metric);
        }
        // Generate Prometheus format
        for (const [name, metrics] of metricGroups) {
            const latestMetric = metrics[metrics.length - 1];
            // Add help and type comments
            lines.push(`# HELP ${name} Hachiko metric`);
            lines.push(`# TYPE ${name} ${latestMetric.type}`);
            // Add metric values
            for (const metric of metrics.slice(-10)) { // Last 10 values
                const tags = Object.entries(metric.tags)
                    .map(([key, value]) => `${key}="${value}"`)
                    .join(",");
                const tagString = tags ? `{${tags}}` : "";
                lines.push(`${name}${tagString} ${metric.value} ${metric.timestamp}`);
            }
            lines.push("");
        }
        return lines.join("\n");
    }
    /**
     * Clear all metrics
     */
    clearMetrics() {
        this.metrics = [];
        this.migrationMetrics.clear();
        logger.info("All metrics cleared");
    }
    /**
     * Shutdown metrics collector
     */
    async shutdown() {
        if (this.reportingInterval) {
            clearInterval(this.reportingInterval);
            this.reportingInterval = null;
        }
        this.initialized = false;
        logger.info("Metrics collector shutdown");
    }
    /**
     * Start collecting performance metrics
     */
    startPerformanceCollection() {
        this.reportingInterval = setInterval(() => {
            const perfMetrics = this.getPerformanceMetrics();
            this.recordMetric("memory_heap_used", exports.MetricType.GAUGE, perfMetrics.memoryUsage.heapUsed);
            this.recordMetric("memory_heap_total", exports.MetricType.GAUGE, perfMetrics.memoryUsage.heapTotal);
            this.recordMetric("memory_rss", exports.MetricType.GAUGE, perfMetrics.memoryUsage.rss);
            this.recordMetric("cpu_user", exports.MetricType.GAUGE, perfMetrics.cpuUsage.user);
            this.recordMetric("cpu_system", exports.MetricType.GAUGE, perfMetrics.cpuUsage.system);
        }, 30000); // Every 30 seconds
    }
}
exports.MetricsCollector = MetricsCollector;
/**
 * Factory function to get metrics collector instance
 */
function createMetricsCollector() {
    return MetricsCollector.getInstance();
}
/**
 * Initialize metrics collector from configuration
 */
async function initializeMetrics(config) {
    const collector = createMetricsCollector();
    await collector.initialize(config);
    return collector;
}
//# sourceMappingURL=metrics.js.map