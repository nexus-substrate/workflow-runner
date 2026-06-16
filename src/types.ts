/**
 * Zod schemas for workflow-runner MCP tool contracts.
 *
 * Covers: list_workflows, run_graph_workflow, query_trace
 */

import { z } from 'zod';

// ============================================================================
// list_workflows
// ============================================================================

export const ListWorkflowsInputSchema = z.object({
  category: z.string().optional(),
  format: z.enum(['full', 'names']).optional(),
});

export type ListWorkflowsInput = z.infer<typeof ListWorkflowsInputSchema>;

const WorkflowInfoSchema = z.object({
  name: z.string(),
  version: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
});

export type WorkflowInfo = z.infer<typeof WorkflowInfoSchema>;

export const ListWorkflowsResponseSchema = z.object({
  workflows: z.array(WorkflowInfoSchema),
  count: z.number(),
  categories: z.array(z.string()).optional(),
});

export type ListWorkflowsResponse = z.infer<typeof ListWorkflowsResponseSchema>;

// ============================================================================
// run_graph_workflow
// ============================================================================

export const RunGraphInputSchema = z.object({
  workflow: z.string().min(1).max(100),
  inputs: z.record(z.unknown()).optional(),
  enableCheckpointing: z.boolean().optional(),
  enableAuditTrail: z.boolean().optional(),
});

export type RunGraphInput = z.infer<typeof RunGraphInputSchema>;

const GraphEventSchema = z.object({
  type: z.string(),
  nodeId: z.string().optional(),
  detail: z.string().optional(),
});

export type GraphEvent = z.infer<typeof GraphEventSchema>;

export const RunGraphResponseSchema = z.object({
  workflow: z.string(),
  status: z.enum(['completed', 'failed']),
  finalState: z.record(z.unknown()),
  stepsExecuted: z.number(),
  nodesExecuted: z.number(),
  durationMs: z.number(),
  events: z.array(GraphEventSchema),
  checkpointCount: z.number(),
  error: z.string().optional(),
});

export type RunGraphResponse = z.infer<typeof RunGraphResponseSchema>;

// ============================================================================
// Graph workflow listing (via workflow="list")
// ============================================================================

const GraphWorkflowInfoSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputFields: z.array(z.string()),
  nodeCount: z.number(),
  hasConditionalEdges: z.boolean(),
});

export type GraphWorkflowInfo = z.infer<typeof GraphWorkflowInfoSchema>;

export const GraphWorkflowListSchema = z.array(GraphWorkflowInfoSchema);

// ============================================================================
// query_trace
// ============================================================================

export const QueryTraceInputSchema = z.object({
  runId: z.string().min(1),
  eventType: z.string().optional(),
  limit: z.number().min(1).max(500).optional(),
});

export type QueryTraceInput = z.infer<typeof QueryTraceInputSchema>;

export const QueryTraceResponseSchema = z.object({
  runId: z.string(),
  events: z.array(z.record(z.unknown())),
  totalEvents: z.number(),
  truncated: z.boolean(),
  source: z.enum(['disk', 'not_found']),
});

export type QueryTraceResponse = z.infer<typeof QueryTraceResponseSchema>;

// ============================================================================
// Runner types
// ============================================================================

/** Result of running a single graph workflow. */
export interface WorkflowRunResult {
  readonly name: string;
  readonly status: 'completed' | 'failed' | 'error';
  readonly stepsExecuted: number;
  readonly nodesExecuted: number;
  readonly durationMs: number;
  readonly checkpoints: number;
  readonly eventCount: number;
  readonly hasConditionalEdges: boolean;
  readonly error?: string;
}

/** Full runner report. */
export interface RunnerReport {
  readonly templateCount: number;
  readonly graphWorkflowCount: number;
  readonly graphResults: readonly WorkflowRunResult[];
  readonly passed: number;
  readonly failed: number;
  readonly traceResult: QueryTraceResponse | null;
  /**
   * Error message if a trace was requested (`config.traceRunId` set) but the
   * `query_trace` call failed. Distinguishes "trace errored" from "trace not
   * requested" (both leave `traceResult` null). Undefined when no trace was
   * requested or the trace succeeded.
   */
  readonly traceError?: string;
}

/** Runner configuration. */
export interface RunnerConfig {
  readonly runGraphWorkflows?: boolean;
  readonly traceRunId?: string;
  readonly graphInputs?: Readonly<Record<string, Record<string, unknown>>>;
  /**
   * Per-call timeout in milliseconds applied to every MCP tool call. When a
   * call exceeds this budget it is aborted and surfaced as an error result for
   * that step, so a hung server cannot hang the whole run. Omit or set <= 0 to
   * disable the timeout.
   */
  readonly timeoutMs?: number;
}
