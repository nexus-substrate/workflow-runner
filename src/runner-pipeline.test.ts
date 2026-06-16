/**
 * Runner pipeline tests — template discovery, graph execution, trace query.
 */

import { describe, it, expect, vi } from 'vitest';
import type { ToolCaller } from './runner-pipeline.js';
import {
  listTemplates,
  listGraphWorkflows,
  executeGraph,
  queryTrace,
  toRunResult,
  toErrorResult,
  countResults,
  runWorkflowPipeline,
  ToolCallTimeoutError,
} from './runner-pipeline.js';
import type { RunnerConfig, WorkflowRunResult } from './types.js';
import {
  MOCK_LIST_WORKFLOWS,
  MOCK_GRAPH_LIST,
  MOCK_ECHO_RESULT,
  MOCK_PIPELINE_RESULT,
  MOCK_CODE_REVIEW_RESULT,
  MOCK_FAILED_RESULT,
  MOCK_TRACE_RESPONSE,
  MOCK_TRACE_NOT_FOUND,
  EXPECTED_TEMPLATE_NAMES,
} from './fixtures/mock-responses.js';

function createMockCaller(
  responses: Record<string, unknown>
): ToolCaller & { calls: Array<{ tool: string; args: Record<string, unknown> }> } {
  const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    call: vi.fn(async (toolName: string, args: Record<string, unknown>) => {
      calls.push({ tool: toolName, args });
      const response = responses[toolName];
      if (response === undefined) throw new Error(`No mock: ${toolName}`);
      return response;
    }),
  };
}

// ============================================================================
// listTemplates
// ============================================================================

describe('listTemplates', () => {
  it('returns all 9 workflow templates', async () => {
    const caller = createMockCaller({ list_workflows: MOCK_LIST_WORKFLOWS });

    const result = await listTemplates(caller);

    expect(result.count).toBe(9);
    expect(result.workflows.length).toBe(9);
  });

  it('contains expected template names', async () => {
    const caller = createMockCaller({ list_workflows: MOCK_LIST_WORKFLOWS });

    const result = await listTemplates(caller);
    const names = result.workflows.map((w) => w.name);

    for (const expected of EXPECTED_TEMPLATE_NAMES) {
      expect(names).toContain(expected);
    }
  });

  it('passes format arg', async () => {
    const caller = createMockCaller({ list_workflows: MOCK_LIST_WORKFLOWS });

    await listTemplates(caller);

    expect(caller.calls[0]?.args['format']).toBe('names');
  });
});

// ============================================================================
// listGraphWorkflows
// ============================================================================

describe('listGraphWorkflows', () => {
  it('returns graph workflow list', async () => {
    const caller = createMockCaller({
      run_graph_workflow: MOCK_GRAPH_LIST,
    });

    const result = await listGraphWorkflows(caller);

    expect(result.length).toBe(7);
    expect(result[0]!.name).toBe('echo');
  });

  it('passes workflow="list"', async () => {
    const caller = createMockCaller({
      run_graph_workflow: MOCK_GRAPH_LIST,
    });

    await listGraphWorkflows(caller);

    expect(caller.calls[0]?.args['workflow']).toBe('list');
  });

  it('identifies conditional edge workflows', async () => {
    const caller = createMockCaller({
      run_graph_workflow: MOCK_GRAPH_LIST,
    });

    const result = await listGraphWorkflows(caller);
    const conditional = result.filter((w) => w.hasConditionalEdges);

    expect(conditional.length).toBe(2);
    expect(conditional.map((c) => c.name)).toContain('code-review');
    expect(conditional.map((c) => c.name)).toContain('security-scan');
  });
});

// ============================================================================
// executeGraph
// ============================================================================

describe('executeGraph', () => {
  it('executes echo workflow', async () => {
    const caller = createMockCaller({
      run_graph_workflow: MOCK_ECHO_RESULT,
    });

    const result = await executeGraph(caller, 'echo', { input: 'test' });

    expect(result.workflow).toBe('echo');
    expect(result.status).toBe('completed');
    expect(result.stepsExecuted).toBe(1);
  });

  it('executes pipeline workflow', async () => {
    const caller = createMockCaller({
      run_graph_workflow: MOCK_PIPELINE_RESULT,
    });

    const result = await executeGraph(caller, 'pipeline', { input: 'data' });

    expect(result.stepsExecuted).toBe(2);
    expect(result.nodesExecuted).toBe(2);
    expect(result.checkpointCount).toBe(2);
  });

  it('handles conditional routing', async () => {
    const caller = createMockCaller({
      run_graph_workflow: MOCK_CODE_REVIEW_RESULT,
    });

    const result = await executeGraph(caller, 'code-review', { code: 'x' });

    expect(result.stepsExecuted).toBe(3);
    expect(result.events.length).toBeGreaterThan(0);
  });

  it('handles failed workflow', async () => {
    const caller = createMockCaller({
      run_graph_workflow: MOCK_FAILED_RESULT,
    });

    const result = await executeGraph(caller, 'security-scan', { code: '' });

    expect(result.status).toBe('failed');
    expect(result.error).toBeDefined();
  });

  it('passes enableCheckpointing', async () => {
    const caller = createMockCaller({
      run_graph_workflow: MOCK_ECHO_RESULT,
    });

    await executeGraph(caller, 'echo', { input: 'x' });

    expect(caller.calls[0]?.args['enableCheckpointing']).toBe(true);
  });
});

// ============================================================================
// queryTrace
// ============================================================================

describe('queryTrace', () => {
  it('returns trace events', async () => {
    const caller = createMockCaller({ query_trace: MOCK_TRACE_RESPONSE });

    const result = await queryTrace(caller, 'wf-run-001');

    expect(result.events.length).toBe(3);
    expect(result.source).toBe('disk');
  });

  it('handles not-found trace', async () => {
    const caller = createMockCaller({ query_trace: MOCK_TRACE_NOT_FOUND });

    const result = await queryTrace(caller, 'nonexistent');

    expect(result.events.length).toBe(0);
    expect(result.source).toBe('not_found');
  });
});

// ============================================================================
// toRunResult / toErrorResult / countResults
// ============================================================================

describe('toRunResult', () => {
  it('converts graph response to run result', () => {
    const info = MOCK_GRAPH_LIST[0]!;
    const result = toRunResult(info, MOCK_ECHO_RESULT);

    expect(result.name).toBe('echo');
    expect(result.status).toBe('completed');
    expect(result.eventCount).toBe(5);
    expect(result.hasConditionalEdges).toBe(false);
  });

  it('preserves error from failed workflow', () => {
    const info = MOCK_GRAPH_LIST[3]!;
    const result = toRunResult(info, MOCK_FAILED_RESULT);

    expect(result.status).toBe('failed');
    expect(result.error).toBe('Empty code input');
  });
});

describe('toErrorResult', () => {
  it('creates error result', () => {
    const result = toErrorResult('test', 'something broke');
    expect(result.status).toBe('error');
    expect(result.error).toBe('something broke');
    expect(result.stepsExecuted).toBe(0);
  });
});

describe('countResults', () => {
  it('counts passed and failed', () => {
    const results: WorkflowRunResult[] = [
      { name: 'a', status: 'completed', stepsExecuted: 1, nodesExecuted: 1, durationMs: 1, checkpoints: 1, eventCount: 1, hasConditionalEdges: false },
      { name: 'b', status: 'failed', stepsExecuted: 0, nodesExecuted: 0, durationMs: 0, checkpoints: 0, eventCount: 0, hasConditionalEdges: false },
      { name: 'c', status: 'completed', stepsExecuted: 2, nodesExecuted: 2, durationMs: 2, checkpoints: 2, eventCount: 2, hasConditionalEdges: true },
    ];
    const { passed, failed } = countResults(results);
    expect(passed).toBe(2);
    expect(failed).toBe(1);
  });

  it('handles empty results', () => {
    const { passed, failed } = countResults([]);
    expect(passed).toBe(0);
    expect(failed).toBe(0);
  });
});

// ============================================================================
// runWorkflowPipeline
// ============================================================================

describe('runWorkflowPipeline', () => {
  it('runs full pipeline discovering and executing workflows', async () => {
    let graphCallCount = 0;
    const graphResponses = [MOCK_GRAPH_LIST, MOCK_ECHO_RESULT, MOCK_PIPELINE_RESULT];
    const caller: ToolCaller = {
      call: vi.fn(async (toolName: string) => {
        if (toolName === 'list_workflows') return MOCK_LIST_WORKFLOWS;
        if (toolName === 'run_graph_workflow') {
          return graphResponses[graphCallCount++];
        }
        throw new Error(`Unexpected: ${toolName}`);
      }),
    };

    // Only run echo + pipeline (first 2 graph workflows)
    const twoGraphs = MOCK_GRAPH_LIST.slice(0, 2);
    const listThenExec = [twoGraphs, MOCK_ECHO_RESULT, MOCK_PIPELINE_RESULT];
    let idx = 0;
    const simpleCaller: ToolCaller = {
      call: vi.fn(async (toolName: string) => {
        if (toolName === 'list_workflows') return MOCK_LIST_WORKFLOWS;
        if (toolName === 'run_graph_workflow') return listThenExec[idx++];
        throw new Error(`Unexpected: ${toolName}`);
      }),
    };

    const result = await runWorkflowPipeline(simpleCaller);

    expect(result.templateCount).toBe(9);
    expect(result.graphWorkflowCount).toBe(2);
    expect(result.graphResults.length).toBe(2);
    expect(result.passed).toBe(2);
    expect(result.failed).toBe(0);
  });

  it('includes trace when configured', async () => {
    let graphIdx = 0;
    const graphResponses = [MOCK_GRAPH_LIST.slice(0, 1), MOCK_ECHO_RESULT];
    const caller: ToolCaller = {
      call: vi.fn(async (toolName: string) => {
        if (toolName === 'list_workflows') return MOCK_LIST_WORKFLOWS;
        if (toolName === 'run_graph_workflow') return graphResponses[graphIdx++];
        if (toolName === 'query_trace') return MOCK_TRACE_RESPONSE;
        throw new Error(`Unexpected: ${toolName}`);
      }),
    };

    const config: RunnerConfig = { traceRunId: 'wf-run-001' };
    const result = await runWorkflowPipeline(caller, config);

    expect(result.traceResult).not.toBeNull();
    expect(result.traceResult!.events.length).toBe(3);
  });

  it('skips graph execution when disabled', async () => {
    const caller: ToolCaller = {
      call: vi.fn(async (toolName: string) => {
        if (toolName === 'list_workflows') return MOCK_LIST_WORKFLOWS;
        if (toolName === 'run_graph_workflow') return MOCK_GRAPH_LIST;
        throw new Error(`Unexpected: ${toolName}`);
      }),
    };

    const config: RunnerConfig = { runGraphWorkflows: false };
    const result = await runWorkflowPipeline(caller, config);

    expect(result.templateCount).toBe(9);
    expect(result.graphResults.length).toBe(0);
  });

  it('handles execution errors gracefully', async () => {
    let graphIdx = 0;
    const caller: ToolCaller = {
      call: vi.fn(async (toolName: string) => {
        if (toolName === 'list_workflows') return MOCK_LIST_WORKFLOWS;
        if (toolName === 'run_graph_workflow') {
          if (graphIdx++ === 0) return MOCK_GRAPH_LIST.slice(0, 1);
          throw new Error('Execution timeout');
        }
        throw new Error(`Unexpected: ${toolName}`);
      }),
    };

    const result = await runWorkflowPipeline(caller);

    expect(result.graphResults.length).toBe(1);
    expect(result.graphResults[0]!.status).toBe('error');
    expect(result.failed).toBe(1);
  });

  // --- #15: preserve the real failure cause instead of "Execution failed" ---

  it('preserves the real error message on a failed graph execution', async () => {
    let graphIdx = 0;
    const caller: ToolCaller = {
      call: vi.fn(async (toolName: string) => {
        if (toolName === 'list_workflows') return MOCK_LIST_WORKFLOWS;
        if (toolName === 'run_graph_workflow') {
          if (graphIdx++ === 0) return MOCK_GRAPH_LIST.slice(0, 1);
          throw new Error('ECONNREFUSED 127.0.0.1:9000');
        }
        throw new Error(`Unexpected: ${toolName}`);
      }),
    };

    const result = await runWorkflowPipeline(caller);

    expect(result.graphResults[0]!.error).toBe('ECONNREFUSED 127.0.0.1:9000');
    expect(result.graphResults[0]!.error).not.toBe('Execution failed');
  });

  it('preserves a Zod schema-mismatch error from a bad server response', async () => {
    let graphIdx = 0;
    const caller: ToolCaller = {
      call: vi.fn(async (toolName: string) => {
        if (toolName === 'list_workflows') return MOCK_LIST_WORKFLOWS;
        if (toolName === 'run_graph_workflow') {
          if (graphIdx++ === 0) return MOCK_GRAPH_LIST.slice(0, 1);
          // Unexpected shape — executeGraph's Zod parse should reject this.
          return { workflow: 'echo', status: 'unknown-status' };
        }
        throw new Error(`Unexpected: ${toolName}`);
      }),
    };

    const result = await runWorkflowPipeline(caller);

    expect(result.graphResults[0]!.status).toBe('error');
    // The Zod failure carries actionable detail, not a generic string.
    expect(result.graphResults[0]!.error).not.toBe('Execution failed');
    expect(result.graphResults[0]!.error!.length).toBeGreaterThan(0);
  });

  it('distinguishes a failed trace query from "trace not requested"', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      let graphIdx = 0;
      const caller: ToolCaller = {
        call: vi.fn(async (toolName: string) => {
          if (toolName === 'list_workflows') return MOCK_LIST_WORKFLOWS;
          if (toolName === 'run_graph_workflow') {
            return graphIdx++ === 0 ? MOCK_GRAPH_LIST.slice(0, 1) : MOCK_ECHO_RESULT;
          }
          if (toolName === 'query_trace') throw new Error('trace store offline');
          throw new Error(`Unexpected: ${toolName}`);
        }),
      };

      const result = await runWorkflowPipeline(caller, { traceRunId: 'wf-run-001' });

      expect(result.traceResult).toBeNull();
      expect(result.traceError).toBe('trace store offline');
    } finally {
      errSpy.mockRestore();
    }
  });

  it('leaves traceError undefined when no trace is requested', async () => {
    let graphIdx = 0;
    const caller: ToolCaller = {
      call: vi.fn(async (toolName: string) => {
        if (toolName === 'list_workflows') return MOCK_LIST_WORKFLOWS;
        if (toolName === 'run_graph_workflow') {
          return graphIdx++ === 0 ? MOCK_GRAPH_LIST.slice(0, 1) : MOCK_ECHO_RESULT;
        }
        throw new Error(`Unexpected: ${toolName}`);
      }),
    };

    const result = await runWorkflowPipeline(caller);

    expect(result.traceResult).toBeNull();
    expect(result.traceError).toBeUndefined();
  });
});

// ============================================================================
// #16: per-call timeout / abort
// ============================================================================

describe('timeout enforcement', () => {
  it('aborts a hung graph execution and reports it without hanging', async () => {
    let graphIdx = 0;
    const caller: ToolCaller = {
      call: vi.fn((toolName: string, args: Record<string, unknown>) => {
        if (toolName === 'list_workflows') return Promise.resolve(MOCK_LIST_WORKFLOWS);
        if (toolName === 'run_graph_workflow') {
          if (graphIdx++ === 0) return Promise.resolve(MOCK_GRAPH_LIST.slice(0, 1));
          // Simulate a hung server: never resolves on its own, but honors abort.
          return new Promise((_, reject) => {
            const signal = args['signal'] as AbortSignal | undefined;
            signal?.addEventListener('abort', () =>
              reject(new Error('aborted by signal'))
            );
          });
        }
        return Promise.reject(new Error(`Unexpected: ${toolName}`));
      }),
    };

    const result = await runWorkflowPipeline(caller, { timeoutMs: 20 });

    expect(result.graphResults.length).toBe(1);
    expect(result.graphResults[0]!.status).toBe('error');
    expect(result.graphResults[0]!.error).toMatch(/timed out after 20ms/);
    expect(result.failed).toBe(1);
  });

  it('passes an AbortSignal through to the caller', async () => {
    const caller: ToolCaller = {
      call: vi.fn(async () => MOCK_LIST_WORKFLOWS),
    };

    await listTemplates(caller, 1000);

    const callMock = caller.call as ReturnType<typeof vi.fn>;
    const passedArgs = callMock.mock.calls[0]![1] as Record<string, unknown>;
    expect(passedArgs['signal']).toBeInstanceOf(AbortSignal);
  });

  it('does not attach a signal or deadline when timeoutMs is omitted', async () => {
    const caller: ToolCaller = {
      call: vi.fn(async () => MOCK_LIST_WORKFLOWS),
    };

    await listTemplates(caller);

    const callMock = caller.call as ReturnType<typeof vi.fn>;
    const passedArgs = callMock.mock.calls[0]![1] as Record<string, unknown>;
    expect(passedArgs['signal']).toBeUndefined();
  });

  it('throws ToolCallTimeoutError from a step when the call exceeds the budget', async () => {
    const caller: ToolCaller = {
      call: vi.fn(
        () => new Promise(() => {}) // never resolves
      ),
    };

    await expect(listTemplates(caller, 15)).rejects.toBeInstanceOf(
      ToolCallTimeoutError
    );
  });
});
