import { describe, expect, it } from 'vitest';
import { sanitizeFrameworks, sanitizeServed } from '../../src/sanitize.js';

describe('sanitizeFrameworks', () => {
  it('drops test runners / linters / bundlers / type stubs, keeps real frameworks, dedupes', () => {
    expect(
      sanitizeFrameworks([
        'Express',
        'vitest',
        'TypeScript',
        '@types/node',
        'eslint',
        'express',
        'Gin',
      ])
    ).toEqual(['Express', 'Gin']);
  });

  it('strips a version suffix before matching the denylist', () => {
    expect(sanitizeFrameworks(['kafkajs@2', 'vitest@1.6'])).toEqual(['kafkajs@2']);
  });
});

describe('sanitizeServed', () => {
  it('removes operational endpoints from httpRoutes', () => {
    const served = {
      httpRoutes: [
        { path: '/v1/orders' },
        { path: '/health' },
        { path: '/actuator/metrics' },
        { path: '/metrics' },
        { path: '/.well-known/jwks.json' },
      ],
      grpcServices: [],
      topics: [],
      datastores: [],
    };
    expect(sanitizeServed(served).httpRoutes).toEqual([{ path: '/v1/orders' }]);
  });
});
