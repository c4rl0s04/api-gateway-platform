import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  readAgentState,
  removeAgentState,
  writeAgentState,
} from '../src/runtime-state.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory =>
    rm(directory, { recursive: true, force: true })));
});

describe('gatewayctl runtime state', () => {
  it('writes protocol-v2 state atomically and removes only the expected instance', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'gatewayctl-state-'));
    directories.push(directory);
    const state = {
      pid: 123,
      port: 43_127,
      instanceId: 'instance-one',
      protocolVersion: 2,
      startedAt: '2030-01-01T00:00:00.000Z',
    };
    await writeAgentState(directory, state);
    assert.deepEqual(await readAgentState(directory), state);
    assert.equal((await readFile(path.join(directory, 'agent.json'))).length > 0, true);

    await removeAgentState(directory, 'another-instance');
    assert.deepEqual(await readAgentState(directory), state);
    await removeAgentState(directory, state.instanceId);
    assert.equal(await readAgentState(directory), null);
  });
});
