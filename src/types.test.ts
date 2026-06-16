/**
 * Zod schema validation tests for workflow-runner.
 */

import { describe, it, expect } from 'vitest';
import {
  ListWorkflowsInputSchema,
  ListWorkflowsResponseSchema,
  RunGraphInputSchema,
  RunGraphResponseSchema,
  GraphWorkflowListSchema,
  QueryTraceInputSchema,
  QueryTraceResponseSchema,
} from './types.js';
import {
  MOCK_LIST_WORKFLOWS,
  MOCK_GRAPH_LIST,
  MOCK_ECHO_RESULT,
  MOCK_PIPELINE_RESULT,
  MOCK_CODE_REVIEW_RESULT,
  MOCK_FAILED_RESULT,
  MOCK_TRACE_RESPONSE,
  MOCK_TRACE_NOT_FOUND,
} from './fixtures/mock-responses.js';

describe('ListWorkflowsInputSchema', () => {
  it('accepts empty input', () => {
    expect(ListWorkflowsInputSchema.safeParse({}).success).toBe(true);
  });

  it('accepts format option', () => {
    for (const format of ['full', 'names']) {
      expect(
        ListWorkflowsInputSchema.safeParse({ format }).success
      ).toBe(true);
    }
  });

  it('rejects invalid format', () => {
    expect(
      ListWorkflowsInputSchema.safeParse({ format: 'xml' }).success
    ).toBe(false);
  });
});

describe('ListWorkflowsResponseSchema', () => {
  it('validates workflow list', () => {
    const result = ListWorkflowsResponseSchema.safeParse(MOCK_LIST_WORKFLOWS);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.count).toBe(9);
    }
  });
});

describe('RunGraphInputSchema', () => {
  it('accepts valid input', () => {
    const result = RunGraphInputSchema.safeParse({
      workflow: 'echo',
      inputs: { input: 'test' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty workflow name', () => {
    expect(
      RunGraphInputSchema.safeParse({ workflow: '' }).success
    ).toBe(false);
  });

  it('accepts workflow name up to 100 chars', () => {
    expect(
      RunGraphInputSchema.safeParse({ workflow: 'a'.repeat(100) }).success
    ).toBe(true);
  });

  it('rejects workflow name over 100 chars', () => {
    expect(
      RunGraphInputSchema.safeParse({ workflow: 'a'.repeat(101) }).success
    ).toBe(false);
  });
});

describe('RunGraphResponseSchema', () => {
  it('validates echo result', () => {
    expect(RunGraphResponseSchema.safeParse(MOCK_ECHO_RESULT).success).toBe(true);
  });

  it('validates pipeline result', () => {
    expect(RunGraphResponseSchema.safeParse(MOCK_PIPELINE_RESULT).success).toBe(true);
  });

  it('validates code-review result', () => {
    expect(RunGraphResponseSchema.safeParse(MOCK_CODE_REVIEW_RESULT).success).toBe(true);
  });

  it('validates failed result with error', () => {
    const result = RunGraphResponseSchema.safeParse(MOCK_FAILED_RESULT);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('failed');
      expect(result.data.error).toBeDefined();
    }
  });

  it('rejects invalid status', () => {
    expect(
      RunGraphResponseSchema.safeParse({
        ...MOCK_ECHO_RESULT,
        status: 'pending',
      }).success
    ).toBe(false);
  });
});

describe('GraphWorkflowListSchema', () => {
  it('validates graph workflow list', () => {
    const result = GraphWorkflowListSchema.safeParse(MOCK_GRAPH_LIST);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBe(7);
    }
  });

  it('validates conditional edge flags', () => {
    const result = GraphWorkflowListSchema.safeParse(MOCK_GRAPH_LIST);
    expect(result.success).toBe(true);
    if (result.success) {
      const conditional = result.data.filter((w) => w.hasConditionalEdges);
      expect(conditional.length).toBe(2);
    }
  });
});

describe('QueryTraceInputSchema', () => {
  it('accepts valid input', () => {
    expect(
      QueryTraceInputSchema.safeParse({ runId: 'run-123' }).success
    ).toBe(true);
  });

  it('rejects empty runId', () => {
    expect(
      QueryTraceInputSchema.safeParse({ runId: '' }).success
    ).toBe(false);
  });

  it('accepts limit within range', () => {
    expect(
      QueryTraceInputSchema.safeParse({ runId: 'x', limit: 50 }).success
    ).toBe(true);
  });

  it('rejects limit over 500', () => {
    expect(
      QueryTraceInputSchema.safeParse({ runId: 'x', limit: 501 }).success
    ).toBe(false);
  });
});

describe('QueryTraceResponseSchema', () => {
  it('validates trace response', () => {
    expect(
      QueryTraceResponseSchema.safeParse(MOCK_TRACE_RESPONSE).success
    ).toBe(true);
  });

  it('validates not-found response', () => {
    expect(
      QueryTraceResponseSchema.safeParse(MOCK_TRACE_NOT_FOUND).success
    ).toBe(true);
  });

  it('rejects invalid source', () => {
    expect(
      QueryTraceResponseSchema.safeParse({
        ...MOCK_TRACE_RESPONSE,
        source: 'memory',
      }).success
    ).toBe(false);
  });
});
