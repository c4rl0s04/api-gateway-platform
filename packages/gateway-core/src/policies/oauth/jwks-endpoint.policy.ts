import type { PolicyFactory } from '../types.js';
import { respond } from '../types.js';
import { getOAuthRuntime } from '../../oauth/runtime.js';

export const createJwksEndpointPolicy: PolicyFactory = () => async ctx => {
  if (ctx.endpoint.mode !== 'local') {
    return respond(500, { error: 'JWKS endpoint must be local' });
  }
  return respond(200, { keys: [getOAuthRuntime().publicJwk] }, {
    'cache-control': 'public, max-age=300',
    'content-type': 'application/json; charset=utf-8',
  });
};
