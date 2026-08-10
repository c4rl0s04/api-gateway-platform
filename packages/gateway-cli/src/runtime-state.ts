import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AGENT_PROTOCOL_VERSION, type AgentStatus } from './types.js';

export interface AgentRuntimeState {
  pid: number;
  port: number;
  instanceId: string;
  protocolVersion: number;
  startedAt: string;
}

export async function readAgentState(stateDirectory: string): Promise<AgentRuntimeState | null> {
  try {
    const parsed = JSON.parse(
      await readFile(path.join(stateDirectory, 'agent.json'), 'utf8'),
    ) as Partial<AgentRuntimeState>;
    if (!Number.isInteger(parsed.pid)
      || !Number.isInteger(parsed.port)
      || typeof parsed.instanceId !== 'string'
      || typeof parsed.startedAt !== 'string'
      || parsed.protocolVersion !== AGENT_PROTOCOL_VERSION) return null;
    return parsed as AgentRuntimeState;
  } catch {
    return null;
  }
}

export async function writeAgentState(
  stateDirectory: string,
  state: AgentRuntimeState,
): Promise<void> {
  const target = path.join(stateDirectory, 'agent.json');
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
  await rename(temporary, target);
}

export async function removeAgentState(
  stateDirectory: string,
  instanceId?: string,
): Promise<void> {
  if (instanceId) {
    const current = await readAgentState(stateDirectory);
    if (current?.instanceId !== instanceId) return;
  }
  await rm(path.join(stateDirectory, 'agent.json'), { force: true });
}

export async function probeAgent(
  port: number,
  origin: string,
  timeoutMs = 1_000,
): Promise<AgentStatus | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/v1/status`, {
      headers: { origin },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const status = await response.json() as Partial<AgentStatus>;
    return status.name === 'gatewayctl'
      && status.protocolVersion === AGENT_PROTOCOL_VERSION
      && typeof status.instanceId === 'string'
      ? status as AgentStatus
      : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
