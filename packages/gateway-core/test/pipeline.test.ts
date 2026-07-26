import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import type { PolicyConfig } from '@api-gateway/shared';
import { executePipeline } from '../src/policies/pipeline';
import {
  clearPolicyRegistry,
  registerBuiltinPolicies,
  registerPolicy,
} from '../src/policies/registry';
import { CONTINUE, halt } from '../src/policies/types';
import { createPolicyContext } from './test-helpers';

describe('policy pipeline', () => {
  beforeEach(() => clearPolicyRegistry());

  it('registers built-in policies idempotently', () => {
    assert.doesNotThrow(() => {
      registerBuiltinPolicies();
      registerBuiltinPolicies();
    });
  });

  it('runs enabled policies in order and stops after halt', async () => {
    const calls: string[] = [];
    registerPolicy('audit-log', () => async () => {
      calls.push('audit');
      return CONTINUE;
    });
    registerPolicy('transform', () => async () => {
      calls.push('transform');
      return halt(418, { error: 'halted' });
    });
    registerPolicy('cors', () => async () => {
      calls.push('cors');
      return CONTINUE;
    });

    const policies: PolicyConfig[] = [
      {
        type: 'cors',
        order: 3,
        enabled: true,
        config: { failureMode: 'closed' },
      },
      {
        type: 'transform',
        order: 2,
        enabled: true,
        config: { failureMode: 'closed' },
      },
      {
        type: 'audit-log',
        order: 1,
        enabled: true,
        config: { failureMode: 'closed' },
      },
      {
        type: 'audit-log',
        order: 0,
        enabled: false,
        config: { failureMode: 'closed' },
      },
    ];

    const result = await executePipeline(
      policies,
      createPolicyContext().context,
    );

    assert.deepEqual(calls, ['audit', 'transform']);
    assert.equal(result.action, 'halt');
    assert.equal(result.action === 'halt' && result.statusCode, 418);
  });

  it('applies each policy failureMode to unexpected execution errors', async () => {
    registerPolicy('audit-log', () => async () => {
      throw new Error('dependency failed');
    });

    const openContext = createPolicyContext();
    const openResult = await executePipeline([{
      type: 'audit-log',
      order: 1,
      enabled: true,
      config: { failureMode: 'open' },
    }], openContext.context);
    assert.deepEqual(openResult, { action: 'continue' });
    assert.equal(openContext.context.state['audit-log.degraded'], true);

    const closedContext = createPolicyContext();
    const closedResult = await executePipeline([{
      type: 'audit-log',
      order: 1,
      enabled: true,
      config: { failureMode: 'closed' },
    }], closedContext.context);
    assert.equal(closedResult.action, 'halt');
    assert.equal(
      closedResult.action === 'halt' && closedResult.statusCode,
      503,
    );
  });
});
