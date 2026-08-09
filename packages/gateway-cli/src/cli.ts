#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { startLocalAgent } from './agent.js';
import { gatewayCtlDirectory, loadAgentProfile } from './config.js';
import { IdentityStore } from './identity-store.js';
import { SystemKeychainMasterKeyProvider } from './keychain.js';
import { AgentOperations } from './operations.js';
import { GatewayCtlError } from './types.js';

const args = process.argv.slice(2);
const rootDirectory = gatewayCtlDirectory();
const identities = new IdentityStore(
  new SystemKeychainMasterKeyProvider(),
  rootDirectory,
);

try {
  await run(args);
} catch (error) {
  const message = error instanceof Error ? error.message : 'gatewayctl failed';
  console.error(message);
  process.exitCode = 1;
}

async function run(command: string[]): Promise<void> {
  const [group, action] = command;
  if (group === 'keys' && action === 'list') {
    console.log(JSON.stringify(await identities.list(), null, 2));
    return;
  }
  if (group === 'keys' && action === 'generate') {
    const type = option(command, '--type');
    const name = requiredOption(command, '--name');
    if (type === 'jwt') {
      console.log(JSON.stringify(await identities.generateJwt({
        name,
        consumerKey: option(command, '--consumer-key'),
      }), null, 2));
      return;
    }
    if (type === 'mtls') {
      console.log(JSON.stringify(await identities.generateMtls({
        name,
        credentialId: requiredOption(command, '--credential-id'),
        algorithm: option(command, '--algorithm') === 'ec' ? 'ec' : 'rsa',
      }), null, 2));
      return;
    }
    throw new GatewayCtlError('invalid_type', '--type must be jwt or mtls');
  }
  if (group === 'keys' && action === 'add') {
    const type = option(command, '--type');
    if (type !== 'jwt' && type !== 'mtls') {
      throw new GatewayCtlError('invalid_type', '--type must be jwt or mtls');
    }
    console.log(JSON.stringify(await identities.addFileIdentity({
      name: requiredOption(command, '--name'),
      type,
      privateKeyFile: requiredOption(command, type === 'jwt' ? '--file' : '--key'),
      certificateFile: option(command, '--certificate'),
      chainFile: option(command, '--chain'),
      consumerKey: option(command, '--consumer-key'),
    }), null, 2));
    return;
  }
  if (group === 'keys' && action === 'remove') {
    await identities.remove(requiredOption(command, '--id'));
    console.log('Identity removed');
    return;
  }
  if (group === 'agent' && action === 'start') {
    await runAgent();
    return;
  }
  if (group === 'agent' && action === 'status') {
    await printAgentStatus();
    return;
  }
  if (group === 'agent' && action === 'stop') {
    await stopAgent();
    return;
  }
  printUsage();
  process.exitCode = 1;
}

async function runAgent(): Promise<void> {
  const profile = loadAgentProfile();
  const operations = new AgentOperations(identities, profile);
  const agent = await startLocalAgent({
    operations,
    profile,
    stateDirectory: rootDirectory,
  });
  const pairing = Buffer.from(JSON.stringify({
    port: agent.port,
    nonce: agent.pairingNonce,
  })).toString('base64url');
  const url = `${profile.playgroundUrl}#gatewayctl=${pairing}`;
  console.log(`Local agent listening on http://127.0.0.1:${agent.port}`);
  console.log(`Pairing expires after first use: ${url}`);
  openBrowser(url);
  const stop = async () => {
    await agent.close();
    await rm(path.join(rootDirectory, 'agent.json'), { force: true });
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  await new Promise(() => undefined);
}

async function printAgentStatus(): Promise<void> {
  try {
    const state = JSON.parse(
      await readFile(path.join(rootDirectory, 'agent.json'), 'utf8'),
    ) as { pid: number; port: number; startedAt: string };
    process.kill(state.pid, 0);
    console.log(JSON.stringify({ running: true, ...state }, null, 2));
  } catch {
    console.log(JSON.stringify({ running: false }, null, 2));
  }
}

async function stopAgent(): Promise<void> {
  try {
    const state = JSON.parse(
      await readFile(path.join(rootDirectory, 'agent.json'), 'utf8'),
    ) as { pid: number };
    process.kill(state.pid, 'SIGTERM');
    console.log('Agent stop requested');
  } catch {
    throw new GatewayCtlError('agent_not_running', 'Local agent is not running');
  }
}

function option(command: string[], name: string): string | undefined {
  const index = command.indexOf(name);
  if (index === -1) return undefined;
  const value = command[index + 1];
  if (!value || value.startsWith('--')) {
    throw new GatewayCtlError('invalid_arguments', `${name} requires a value`);
  }
  return value;
}

function requiredOption(command: string[], name: string): string {
  const value = option(command, name);
  if (!value) throw new GatewayCtlError('invalid_arguments', `${name} is required`);
  return value;
}

function openBrowser(url: string): void {
  const [program, programArgs] = process.platform === 'darwin'
    ? ['open', [url]]
    : process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : ['xdg-open', [url]];
  const child = spawn(program, programArgs, {
    detached: true,
    stdio: 'ignore',
  });
  child.on('error', () => undefined);
  child.unref();
}

function printUsage(): void {
  console.error(`Usage:
  gatewayctl keys add --name <name> --type jwt --file <private.pem> [--consumer-key <key>]
  gatewayctl keys add --name <name> --type mtls --key <client.key> [--certificate <client.crt>] [--chain <chain.crt>]
  gatewayctl keys generate --name <name> --type jwt [--consumer-key <key>]
  gatewayctl keys generate --name <name> --type mtls --credential-id <id> [--algorithm rsa|ec]
  gatewayctl keys list
  gatewayctl keys remove --id <identity-id>
  gatewayctl agent start|status|stop`);
}
