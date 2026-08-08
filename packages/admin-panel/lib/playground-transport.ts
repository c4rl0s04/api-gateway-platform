import 'server-only';

import { readFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import type {
  PlaygroundGatewayRequest,
  PlaygroundGatewayResponse,
  PlaygroundTransport,
} from '@/lib/playground-service';
import { PLAYGROUND_MAX_RESPONSE_BYTES } from '@/lib/playground';

const responseHeaderBlocklist = new Set(['set-cookie', 'www-authenticate']);

function configuredTimeout(): number {
  const value = Number(process.env.PLAYGROUND_REQUEST_TIMEOUT_MS ?? 10_000);
  return Number.isInteger(value) && value >= 1_000 && value <= 30_000
    ? value
    : 10_000;
}

async function configuredCa(): Promise<Buffer | undefined> {
  const path = process.env.PLAYGROUND_CA_CERT_FILE;
  return path ? readFile(path) : undefined;
}

function responseHeaders(
  headers: http.IncomingHttpHeaders,
): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).flatMap(([name, value]) => {
    if (value === undefined || responseHeaderBlocklist.has(name.toLowerCase())) return [];
    return [[name, Array.isArray(value) ? value.join(', ') : value]];
  }));
}

export function createPlaygroundTransport(): PlaygroundTransport {
  return {
    async send(request: PlaygroundGatewayRequest): Promise<PlaygroundGatewayResponse> {
      const connection = process.env.PLAYGROUND_ENVOY_URL
        ? new URL(process.env.PLAYGROUND_ENVOY_URL)
        : request.target;
      if (!['http:', 'https:'].includes(connection.protocol)) {
        throw new Error('PLAYGROUND_ENVOY_URL must use HTTP or HTTPS');
      }
      const startedAt = performance.now();
      const ca = connection.protocol === 'https:' ? await configuredCa() : undefined;
      const client = connection.protocol === 'https:' ? https : http;

      return new Promise((resolve, reject) => {
        const upstream = client.request({
          protocol: connection.protocol,
          hostname: connection.hostname,
          port: connection.port || (connection.protocol === 'https:' ? 443 : 80),
          method: request.method,
          path: `${request.target.pathname}${request.target.search}`,
          headers: {
            ...request.headers,
            host: request.target.host,
          },
          timeout: configuredTimeout(),
          ...(connection.protocol === 'https:'
            ? {
                ca,
                rejectUnauthorized: true,
                servername: request.target.hostname,
              }
            : {}),
        }, response => {
          const chunks: Buffer[] = [];
          let capturedBytes = 0;
          let truncated = false;
          response.on('data', (chunk: Buffer) => {
            if (capturedBytes >= PLAYGROUND_MAX_RESPONSE_BYTES) {
              truncated = true;
              return;
            }
            const remaining = PLAYGROUND_MAX_RESPONSE_BYTES - capturedBytes;
            const captured = chunk.subarray(0, remaining);
            chunks.push(captured);
            capturedBytes += captured.length;
            if (captured.length < chunk.length) truncated = true;
          });
          response.on('end', () => resolve({
            status: response.statusCode ?? 502,
            statusText: response.statusMessage ?? '',
            headers: responseHeaders(response.headers),
            body: Buffer.concat(chunks).toString('utf8'),
            durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
            truncated,
          }));
        });
        upstream.on('timeout', () => {
          upstream.destroy(new Error('Gateway request timed out'));
        });
        upstream.on('error', reject);
        if (request.body) upstream.write(request.body);
        upstream.end();
      });
    },
  };
}
