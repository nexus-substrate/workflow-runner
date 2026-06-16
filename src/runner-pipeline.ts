/**
 * Workflow runner pipeline.
 *
 * Chains: list_workflows → run_graph_workflow → query_trace
 * to exercise all workflow templates and validate outputs.
 */

import type {
  ListWorkflowsResponse,
  RunGraphResponse,
  GraphWorkflowInfo,
  QueryTraceResponse,
  WorkflowRunResult,
  RunnerReport,
  RunnerConfig,
} from './types.js';
import {
  ListWorkflowsResponseSchema,
  GraphWorkflowListSchema,
  RunGraphResponseSchema,
  QueryTraceResponseSchema,
} from './types.js';

// ============================================================================
// Tool caller abstraction
// ============================================================================

export interface ToolCaller {
  call(toolName: string, args: Record<string, unknown>): Promise<unknown>;
}

// ============================================================================
// Timeout enforcement
// ============================================================================

/** Error thrown when an MCP call exceeds the configured per-call timeout. */
export class ToolCallTimeoutError extends Error {
  constructor(
    readonly toolName: string,
    readonly timeoutMs: number
  ) {
    super(`Tool call '${toolName}' timed out after ${timeoutMs}ms`);
    this.name = 'ToolCallTimeoutError';
  }
}

/**
 * Invoke a tool call, racing it against a timeout. If `timeoutMs` is undefined
 * or <= 0 the call is awaited without a deadline. On timeout the caller is
 * signalled via an AbortController (best-effort — callers that ignore the
 * signal still lose the race) and a ToolCallTimeoutError is thrown.
 */
async function callWithTimeout(
  caller: ToolCaller,
  toolName: string,
  args: Record<string, unknown>,
  timeoutMs: number | undefined
): Promise<unknown> {
  if (timeoutMs === undefined || timeoutMs <= 0) {
    return caller.call(toolName, args);
  }

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // Reject with the timeout error first so it wins the race, then signal
      // the caller to abort its in-flight work (best-effort cleanup).
      reject(new ToolCallTimeoutError(toolName, timeoutMs));
      controller.abort();
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      caller.call(toolName, { ...args, signal: controller.signal }),
      timeout,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

// ============================================================================
// Default graph workflow inputs
// ============================================================================

const DEFAULT_GRAPH_INPUTS: Readonly<Record<string, Record<string, unknown>>> = {
  echo: { input: 'workflow-runner test' },
  pipeline: { input: 'validation test data' },
  'code-review': { code: 'function add(a: number, b: number): number { return a + b; }' },
  'security-scan': { code: 'import fs from "fs"; fs.readFileSync("/etc/passwd");' },
  'security-audit': { code: 'const password = process.env.DB_PASSWORD;' },
  'test-generation': { code: 'export function sum(a: number, b: number): number { return a + b; }' },
  documentation: { topic: 'API design', code: 'app.get("/users", getUsers);' },
};

// ============================================================================
// Individual steps
// ============================================================================

/** Step 1: List all workflow templates. */
export async function listTemplates(
  caller: ToolCaller,
  timeoutMs?: number
): Promise<ListWorkflowsResponse> {
  const raw = await callWithTimeout(
    caller,
    'list_workflows',
    { format: 'names' },
    timeoutMs
  );
  return ListWorkflowsResponseSchema.parse(raw);
}

/** Step 2: List all graph workflows. */
export async function listGraphWorkflows(
  caller: ToolCaller,
  timeoutMs?: number
): Promise<readonly GraphWorkflowInfo[]> {
  const raw = await callWithTimeout(
    caller,
    'run_graph_workflow',
    { workflow: 'list' },
    timeoutMs
  );
  return GraphWorkflowListSchema.parse(raw);
}

/** Step 3: Execute a single graph workflow. */
export async function executeGraph(
  caller: ToolCaller,
  name: string,
  inputs: Record<string, unknown>,
  timeoutMs?: number
): Promise<RunGraphResponse> {
  const raw = await callWithTimeout(
    caller,
    'run_graph_workflow',
    {
      workflow: name,
      inputs,
      enableCheckpointing: true,
    },
    timeoutMs
  );
  return RunGraphResponseSchema.parse(raw);
}

/** Step 4: Query traces for a run. */
export async function queryTrace(
  caller: ToolCaller,
  runId: string,
  timeoutMs?: number
): Promise<QueryTraceResponse> {
  const raw = await callWithTimeout(
    caller,
    'query_trace',
    { runId },
    timeoutMs
  );
  return QueryTraceResponseSchema.parse(raw);
}

// ============================================================================
// Analysis helpers
// ============================================================================

/** Convert a graph execution to a WorkflowRunResult. */
export function toRunResult(
  info: GraphWorkflowInfo,
  response: RunGraphResponse
): WorkflowRunResult {
  return {
    name: response.workflow,
    status: response.status,
    stepsExecuted: response.stepsExecuted,
    nodesExecuted: response.nodesExecuted,
    durationMs: response.durationMs,
    checkpoints: response.checkpointCount,
    eventCount: response.events.length,
    hasConditionalEdges: info.hasConditionalEdges,
    ...(response.error !== undefined ? { error: response.error } : {}),
  };
}

/** Create an error result for a failed execution. */
export function toErrorResult(
  name: string,
  error: string
): WorkflowRunResult {
  return {
    name,
    status: 'error',
    stepsExecuted: 0,
    nodesExecuted: 0,
    durationMs: 0,
    checkpoints: 0,
    eventCount: 0,
    hasConditionalEdges: false,
    error,
  };
}

/** Count passed/failed results. */
export function countResults(
  results: readonly WorkflowRunResult[]
): { passed: number; failed: number } {
  const passed = results.filter((r) => r.status === 'completed').length;
  return { passed, failed: results.length - passed };
}

// ============================================================================
// Full pipeline
// ============================================================================

/** Run the complete workflow runner pipeline. */
export async function runWorkflowPipeline(
  caller: ToolCaller,
  config: RunnerConfig = {}
): Promise<RunnerReport> {
  const { timeoutMs } = config;

  // Step 1: Discover templates
  const templates = await listTemplates(caller, timeoutMs);

  // Step 2: Discover and execute graph workflows
  const graphInfos = await listGraphWorkflows(caller, timeoutMs);
  const graphResults: WorkflowRunResult[] = [];

  if (config.runGraphWorkflows !== false) {
    const userInputs = config.graphInputs ?? {};
    for (const info of graphInfos) {
      const inputs =
        userInputs[info.name] ?? DEFAULT_GRAPH_INPUTS[info.name] ?? {};
      try {
        const response = await executeGraph(caller, info.name, inputs, timeoutMs);
        graphResults.push(toRunResult(info, response));
      } catch (e) {
        // Preserve the real failure (transport error, Zod schema mismatch,
        // timeout) — collapsing every cause to "Execution failed" discards the
        // single most useful diagnostic signal this exerciser produces.
        graphResults.push(toErrorResult(info.name, errorMessage(e)));
      }
    }
  }

  // Step 3: Query traces (if configured)
  let traceResult: QueryTraceResponse | null = null;
  let traceError: string | undefined;
  if (config.traceRunId !== undefined) {
    try {
      traceResult = await queryTrace(caller, config.traceRunId, timeoutMs);
    } catch (e) {
      // A failed trace query is distinct from "trace never requested"; carry
      // the error so the report can tell them apart, and surface it on stderr.
      traceError = errorMessage(e);
      traceResult = null;
      console.error(
        `query_trace failed for runId '${config.traceRunId}': ${traceError}`
      );
    }
  }

  const { passed, failed } = countResults(graphResults);

  return {
    templateCount: templates.count,
    graphWorkflowCount: graphInfos.length,
    graphResults,
    passed,
    failed,
    traceResult,
    ...(traceError !== undefined ? { traceError } : {}),
  };
}

/** Normalize an unknown thrown value to a message string. */
function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
