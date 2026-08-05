import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AccessScreen } from '../components/access-screen.js';
import { checkSession } from '../lib/session.js';

describe('admin session access states', () => {
  it('treats an unauthorized response as an unauthenticated session', async () => {
    const result = await checkSession(async () => new Response(null, { status: 401 }));

    assert.deepEqual(result, { status: 'unauthenticated' });
  });

  it('exposes service and network failures as an error state', async () => {
    const serviceFailure = await checkSession(async () => new Response(null, { status: 503 }));
    const networkFailure = await checkSession(async () => {
      throw new Error('network unavailable');
    });

    assert.deepEqual(serviceFailure, { status: 'error' });
    assert.deepEqual(networkFailure, { status: 'error' });
  });

  it('renders a stable error message and retry action', () => {
    const markup = renderToStaticMarkup(createElement(AccessScreen, {
      state: 'error',
      onRetry: () => undefined,
    }));

    assert.match(markup, /We could not check your session/);
    assert.match(markup, /Try again/);
    assert.match(markup, /role="alert"/);
  });
});
