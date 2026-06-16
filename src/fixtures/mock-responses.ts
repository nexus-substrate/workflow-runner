/**
 * Mock MCP tool responses for deterministic testing.
 */

import type {
  ListWorkflowsResponse,
  RunGraphResponse,
  GraphWorkflowInfo,
  QueryTraceResponse,
} from '../types.js';

// ============================================================================
// list_workflows
// ============================================================================

export const MOCK_LIST_WORKFLOWS: ListWorkflowsResponse = {
  workflows: [
    { name: 'bug-fix', version: '1.0.0' },
    { name: 'code-review', version: '1.0.0' },
    { name: 'documentation-update', version: '1.0.0' },
    { name: 'feature-implementation', version: '1.0.0' },
    { name: 'refactoring', version: '1.0.0' },
    { name: 'research-review', version: '1.0.0' },
    { name: 'security-audit', version: '1.0.0' },
    { name: 'standards-review', version: '1.0.0' },
    { name: 'test-generation', version: '1.0.0' },
  ],
  count: 9,
};

export const EXPECTED_TEMPLATE_NAMES = [
  'bug-fix',
  'code-review',
  'documentation-update',
  'feature-implementation',
  'refactoring',
  'research-review',
  'security-audit',
  'standards-review',
  'test-generation',
] as const;

// ============================================================================
// Graph workflow list
// ============================================================================

export const MOCK_GRAPH_LIST: readonly GraphWorkflowInfo[] = [
  {
    name: 'echo',
    description: 'Simple input echo (demo)',
    inputFields: ['input'],
    nodeCount: 1,
    hasConditionalEdges: false,
  },
  {
    name: 'pipeline',
    description: 'Two-step validate-process pipeline (demo)',
    inputFields: ['input'],
    nodeCount: 2,
    hasConditionalEdges: false,
  },
  {
    name: 'code-review',
    description: 'Complexity-based code review',
    inputFields: ['code'],
    nodeCount: 4,
    hasConditionalEdges: true,
  },
  {
    name: 'security-scan',
    description: 'Multi-step security analysis',
    inputFields: ['code'],
    nodeCount: 4,
    hasConditionalEdges: true,
  },
  {
    name: 'security-audit',
    description: 'Multi-CLI security audit',
    inputFields: ['code'],
    nodeCount: 4,
    hasConditionalEdges: false,
  },
  {
    name: 'test-generation',
    description: 'Multi-CLI test generation',
    inputFields: ['code'],
    nodeCount: 4,
    hasConditionalEdges: false,
  },
  {
    name: 'documentation',
    description: 'Multi-CLI documentation',
    inputFields: ['topic', 'code'],
    nodeCount: 4,
    hasConditionalEdges: false,
  },
];

// ============================================================================
// run_graph_workflow
// ============================================================================

export const MOCK_ECHO_RESULT: RunGraphResponse = {
  workflow: 'echo',
  status: 'completed',
  finalState: { input: 'hello', output: 'echo: hello' },
  stepsExecuted: 1,
  nodesExecuted: 1,
  durationMs: 1,
  events: [
    { type: 'node_started', nodeId: 'echo', detail: 'Starting echo' },
    { type: 'node_completed', nodeId: 'echo', detail: 'echo in 0ms' },
    { type: 'state_updated', detail: 'output' },
    { type: 'step_completed', detail: '1 nodes' },
    { type: 'execution_complete', detail: '1 steps, 1ms' },
  ],
  checkpointCount: 1,
};

export const MOCK_PIPELINE_RESULT: RunGraphResponse = {
  workflow: 'pipeline',
  status: 'completed',
  finalState: {
    input: 'test data',
    steps: ['validated: test data', 'processed 1 inputs'],
    output: 'done: test data',
  },
  stepsExecuted: 2,
  nodesExecuted: 2,
  durationMs: 1,
  events: [
    { type: 'node_started', nodeId: 'validate' },
    { type: 'node_completed', nodeId: 'validate' },
    { type: 'step_completed', detail: '1 nodes' },
    { type: 'node_started', nodeId: 'process' },
    { type: 'node_completed', nodeId: 'process' },
    { type: 'step_completed', detail: '1 nodes' },
    { type: 'execution_complete', detail: '2 steps, 1ms' },
  ],
  checkpointCount: 2,
};

export const MOCK_CODE_REVIEW_RESULT: RunGraphResponse = {
  workflow: 'code-review',
  status: 'completed',
  finalState: {
    code: 'function add(a, b) { return a + b; }',
    complexity: 1,
    review: 'Quick review: simple function',
    output: 'Review complete: low complexity',
  },
  stepsExecuted: 3,
  nodesExecuted: 3,
  durationMs: 2,
  events: [
    { type: 'node_started', nodeId: 'analyze' },
    { type: 'node_completed', nodeId: 'analyze' },
    { type: 'node_started', nodeId: 'quick-review' },
    { type: 'node_completed', nodeId: 'quick-review' },
    { type: 'node_started', nodeId: 'report' },
    { type: 'node_completed', nodeId: 'report' },
    { type: 'execution_complete', detail: '3 steps' },
  ],
  checkpointCount: 3,
};

export const MOCK_FAILED_RESULT: RunGraphResponse = {
  workflow: 'security-scan',
  status: 'failed',
  finalState: { code: '', error: 'No code provided' },
  stepsExecuted: 1,
  nodesExecuted: 1,
  durationMs: 0,
  events: [
    { type: 'node_started', nodeId: 'scan-imports' },
    { type: 'node_completed', nodeId: 'scan-imports' },
    { type: 'execution_complete', detail: 'failed' },
  ],
  checkpointCount: 1,
  error: 'Empty code input',
};

// ============================================================================
// query_trace
// ============================================================================

export const MOCK_TRACE_RESPONSE: QueryTraceResponse = {
  runId: 'wf-run-001',
  events: [
    { eventType: 'workflow.started', workflow: 'echo', timestamp: '2026-02-14T12:00:00Z' },
    { eventType: 'node.executed', nodeId: 'echo', durationMs: 1 },
    { eventType: 'workflow.completed', status: 'completed' },
  ],
  totalEvents: 3,
  truncated: false,
  source: 'disk',
};

export const MOCK_TRACE_NOT_FOUND: QueryTraceResponse = {
  runId: 'nonexistent',
  events: [],
  totalEvents: 0,
  truncated: false,
  source: 'not_found',
};
