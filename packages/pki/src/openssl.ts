import { spawn } from 'node:child_process';

export interface OpenSslResult {
  stdout: string;
  stderr: string;
}

export function runOpenSsl(
  args: string[],
  options: { cwd?: string } = {},
): Promise<OpenSslResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('openssl', args, {
      cwd: options.cwd,
      env: { ...process.env, LC_ALL: 'C' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', chunk => stdout.push(Buffer.from(chunk)));
    child.stderr.on('data', chunk => stderr.push(Buffer.from(chunk)));
    child.once('error', reject);
    child.once('close', (code) => {
      const result = {
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      };
      if (code !== 0) {
        const message = result.stderr.trim() || result.stdout.trim();
        reject(new Error(`OpenSSL failed (${code}): ${message}`));
        return;
      }
      resolve(result);
    });
  });
}
