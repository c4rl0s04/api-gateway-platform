import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..');
const gatewayctlHome = await mkdtemp(path.join(os.tmpdir(), 'gatewayctl-browser-e2e-'));
const credentials = parseEnv(await readFile(
  path.join(root, '.local-secrets/keycloak/users.env'),
  'utf8',
));
let agent;
let browser;

try {
  agent = await startAgent();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext();
  await context.grantPermissions(['local-network-access'], {
    origin: 'http://localhost:8080',
  });
  const page = await context.newPage();
  await page.goto('http://localhost:8080/playground');
  await authenticate(page);

  const connection = page.locator('.local-agent-status');
  await connection.waitFor({ state: 'visible' });
  await waitFor(
    async () => await connection.getAttribute('data-status') === 'approvalRequired',
    15_000,
    async () => `Agent UI state: ${await connection.getAttribute('data-status')}`,
  );
  await connection.click();
  const code = await agent.waitForCode();
  await page.getByPlaceholder('AB12CD34').fill(code);
  await page.getByRole('button', { name: 'Approve browser' }).click();
  await expectText(connection, 'Local agent connected');

  await page.reload();
  await expectText(page.locator('.local-agent-status'), 'Local agent connected');

  const secondPage = await context.newPage();
  await secondPage.goto('http://localhost:8080/playground');
  await expectText(secondPage.locator('.local-agent-status'), 'Local agent connected');

  await agent.stop();
  await expectText(page.locator('.local-agent-status'), 'Connect local agent', 25_000);

  agent = await startAgent();
  await expectText(page.locator('.local-agent-status'), 'Local agent connected', 25_000);
  console.log('gatewayctl browser pairing, reload, second-tab and restart checks passed');
} finally {
  await agent?.stop();
  await browser?.close();
  await rm(gatewayctlHome, { recursive: true, force: true });
}

async function authenticate(page) {
  const signIn = page.getByRole('link', { name: 'Continue with OIDC' });
  const shell = page.locator('.local-agent-status');
  await signIn.or(shell).first().waitFor({ state: 'visible', timeout: 15_000 });
  if (await signIn.isVisible().catch(() => false)) await signIn.click();
  if (page.url().includes('localhost:8081')) {
    await page.locator('#username').waitFor({ state: 'visible' });
    await page.locator('#username').fill('platform-admin');
    await page.locator('#password').fill(credentials.PLATFORM_ADMIN_PASSWORD);
    await page.locator('#kc-login').click();
    await page.waitForURL(/^http:\/\/localhost:8080\//u, { timeout: 20_000 });
    await page.goto('http://localhost:8080/playground');
  }
  await shell.waitFor({ state: 'visible', timeout: 20_000 });
}

async function startAgent() {
  const child = spawn(process.execPath, ['packages/gateway-cli/dist/cli.js', 'agent', 'start'], {
    cwd: root,
    env: { ...process.env, GATEWAYCTL_HOME: gatewayctlHome },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  await waitFor(() => output.includes('Local agent listening'), 10_000, () => output);
  let stopped = false;
  return {
    async waitForCode() {
      await waitFor(() => /Code: ([A-Z0-9]{8})/u.test(output), 10_000, () => output);
      return output.match(/Code: ([A-Z0-9]{8})/u)[1];
    },
    async stop() {
      if (stopped || child.exitCode !== null) return;
      stopped = true;
      child.kill('SIGTERM');
      await Promise.race([
        new Promise(resolve => child.once('exit', resolve)),
        new Promise((_, reject) => setTimeout(() => reject(new Error('gatewayctl did not stop')), 5_000)),
      ]);
    },
  };
}

async function expectText(locator, expected, timeout = 15_000) {
  await waitFor(
    async () => (await locator.textContent().catch(() => ''))?.includes(expected),
    timeout,
    () => `Expected ${expected}`,
  );
}

async function waitFor(predicate, timeout, detail) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${await detail()}`);
}

function parseEnv(value) {
  return Object.fromEntries(value.split(/\r?\n/u).filter(Boolean).map(line => {
    const separator = line.indexOf('=');
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
}
