import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_AGENT_PORT, type AgentProfile } from './types.js';

export function gatewayCtlDirectory(): string {
  return path.resolve(
    process.env.GATEWAYCTL_HOME ?? path.join(os.homedir(), '.gatewayctl'),
  );
}

export function loadAgentProfile(): AgentProfile {
  const localGatewayCa = path.resolve(
    '.local-secrets/pki/authorities/local-development/ca.crt',
  );
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
    gatewayCaCertificateFile: process.env.GATEWAYCTL_GATEWAY_CA_CERT_FILE
      ?? (existsSync(localGatewayCa) ? localGatewayCa : undefined),
    port: integerSetting('GATEWAYCTL_PORT', DEFAULT_AGENT_PORT, 1, 65_535),
    trustedClientDays: integerSetting('GATEWAYCTL_TRUSTED_CLIENT_DAYS', 30, 1, 365),
  };
}

function commaSeparated(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

function integerSetting(name: string, fallback: number, minimum: number, maximum: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}
