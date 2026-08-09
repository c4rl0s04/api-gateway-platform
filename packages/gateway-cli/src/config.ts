import os from 'node:os';
import path from 'node:path';
import type { AgentProfile } from './types.js';

export function gatewayCtlDirectory(): string {
  return path.resolve(
    process.env.GATEWAYCTL_HOME ?? path.join(os.homedir(), '.gatewayctl'),
  );
}

export function loadAgentProfile(): AgentProfile {
  return {
    allowedOrigins: commaSeparated(
      process.env.GATEWAYCTL_ALLOWED_ORIGINS,
      ['http://localhost:8080'],
    ),
    allowedAudienceHosts: commaSeparated(
      process.env.GATEWAYCTL_ALLOWED_AUDIENCE_HOSTS,
      ['*.gateway.localhost', '*.lab.gateway.localhost'],
    ),
    playgroundUrl: process.env.GATEWAYCTL_PLAYGROUND_URL
      ?? 'http://localhost:8080/playground',
  };
}

function commaSeparated(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  return value.split(',').map(item => item.trim()).filter(Boolean);
}
