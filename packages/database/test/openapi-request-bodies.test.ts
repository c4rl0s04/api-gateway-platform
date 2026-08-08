import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { requestBodiesForOperation } from '../src/openapi-request-bodies.js';

describe('OpenAPI request body examples', () => {
  it('prefers named examples and resolves internal schema references', () => {
    const document = {
      openapi: '3.1.0',
      paths: {
        '/accounts': {
          post: {
            operationId: 'createAccount',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  examples: {
                    savings: { value: { owner: 'Carlos', currency: 'EUR' } },
                  },
                  schema: { $ref: '#/components/schemas/AccountInput' },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          AccountInput: {
            type: 'object',
            properties: {
              owner: { type: 'string' },
              currency: { type: 'string', enum: ['EUR', 'USD'] },
            },
          },
        },
      },
    };
    assert.deepEqual(requestBodiesForOperation(document, 'post', '/accounts'), [{
      required: true,
      mediaType: 'application/json',
      examples: [{
        name: 'savings',
        body: '{\n  "owner": "Carlos",\n  "currency": "EUR"\n}',
        source: 'explicit',
      }],
    }]);
  });

  it('generates deterministic JSON and form examples from schemas', () => {
    const document = {
      paths: {
        '/token': {
          post: {
            requestBody: {
              content: {
                'application/x-www-form-urlencoded': {
                  schema: {
                    type: 'object',
                    properties: {
                      grant_type: { type: 'string', default: 'client_credentials' },
                      scope: { type: 'string', example: 'banking:read' },
                    },
                  },
                },
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      enabled: { type: 'boolean' },
                      count: { type: 'integer', minimum: 1 },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    const result = requestBodiesForOperation(document, 'POST', '/token');
    assert.equal(result[0].mediaType, 'application/json');
    assert.equal(result[0].examples[0].body, '{\n  "enabled": true,\n  "count": 1\n}');
    assert.equal(result[1].examples[0].body, 'grant_type=client_credentials&scope=banking%3Aread');
  });

  it('returns no metadata when an operation has no request body', () => {
    assert.deepEqual(requestBodiesForOperation({ paths: { '/ping': { get: {} } } }, 'get', '/ping'), []);
  });
});
