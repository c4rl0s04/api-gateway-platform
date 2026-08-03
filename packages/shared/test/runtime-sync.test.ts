import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  gatewayConfigChangeMessageSchema,
  gatewayRuntimeStatusSchema,
} from '../src/index.js';

describe('gateway runtime synchronization contracts', () => {
  it('accepts versioned changes and rejects malformed messages', () => {
    assert.deepEqual(
      gatewayConfigChangeMessageSchema.parse({ version: 12 }),
      { version: 12 },
    );
    assert.equal(
      gatewayConfigChangeMessageSchema.safeParse({ version: 0 }).success,
      false,
    );
  });

  it('validates observable gateway status records', () => {
    assert.equal(gatewayRuntimeStatusSchema.safeParse({
      instanceId: 'gateway-local',
      state: 'applied',
      appliedVersion: 12,
      lastAppliedAt: new Date().toISOString(),
      lastError: null,
    }).success, true);
  });
});
