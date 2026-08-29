import { describe, it, expect } from 'vitest';
import { parseReviewYaml } from '../../../src/lib/import/parse-review';

const VALID_YAML = `
version: '1.0'
generated_at: '2026-08-01T00:00:00.000Z'
source_repos:
  - user-service
  - notification-service
candidates:
  - id: cand_1
    source: user-service
    target: notification-service
    type: http
    reasoning: 'user-service calls notification-service'
    confidence: high
    status: pending
    override_name: null
    override_type: null
`;

describe('parseReviewYaml', () => {
  it('parses a well-formed review file into typed file + candidates', () => {
    const { file, candidates } = parseReviewYaml(VALID_YAML);

    expect(file.version).toBe('1.0');
    expect(file.generated_at).toBe('2026-08-01T00:00:00.000Z');
    expect(file.source_repos).toEqual(['user-service', 'notification-service']);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toEqual({
      id: 'cand_1',
      source: 'user-service',
      target: 'notification-service',
      type: 'http',
      reasoning: 'user-service calls notification-service',
      confidence: 'high',
      status: 'pending',
      override_name: null,
      override_type: null,
    });
  });

  it('defaults a missing candidate status to "pending"', () => {
    const yaml = `
version: '1.0'
generated_at: '2026-08-01T00:00:00.000Z'
source_repos: [a, b]
candidates:
  - id: cand_1
    source: a
    target: b
    type: database
    reasoning: 'a reads from b'
    confidence: low
`;
    const { candidates } = parseReviewYaml(yaml);
    expect(candidates[0]?.status).toBe('pending');
  });

  it('defaults a candidate status that is not one of the known values to "pending"', () => {
    const yaml = `
version: '1.0'
generated_at: '2026-08-01T00:00:00.000Z'
source_repos: [a, b]
candidates:
  - id: cand_1
    source: a
    target: b
    type: database
    reasoning: 'a reads from b'
    confidence: low
    status: bogus
`;
    const { candidates } = parseReviewYaml(yaml);
    expect(candidates[0]?.status).toBe('pending');
  });

  it('accepts an empty candidates array', () => {
    const yaml = `
version: '1.0'
generated_at: '2026-08-01T00:00:00.000Z'
source_repos: []
candidates: []
`;
    const { file, candidates } = parseReviewYaml(yaml);
    expect(file.source_repos).toEqual([]);
    expect(candidates).toEqual([]);
  });

  it('preserves override_name and override_type when present', () => {
    const yaml = `
version: '1.0'
generated_at: '2026-08-01T00:00:00.000Z'
source_repos: [a, b]
candidates:
  - id: cand_1
    source: a
    target: b
    type: grpc
    reasoning: 'a calls b'
    confidence: medium
    override_name: 'Billing Service'
    override_type: 'gRPC'
`;
    const { candidates } = parseReviewYaml(yaml);
    expect(candidates[0]?.override_name).toBe('Billing Service');
    expect(candidates[0]?.override_type).toBe('gRPC');
  });

  it('throws on invalid YAML syntax', () => {
    expect(() => parseReviewYaml('version: [unterminated')).toThrow(/Invalid YAML/);
  });

  it('throws when the document is a scalar rather than an object', () => {
    expect(() => parseReviewYaml('just-a-string')).toThrow('Review file must be a YAML object');
  });

  it('throws when the document parses to null', () => {
    expect(() => parseReviewYaml('null\n')).toThrow('Review file must be a YAML object');
  });

  it('throws on a genuinely empty document', () => {
    expect(() => parseReviewYaml('')).toThrow('Invalid YAML');
  });

  it('throws when "version" is missing', () => {
    const yaml = `
generated_at: '2026-08-01T00:00:00.000Z'
source_repos: []
candidates: []
`;
    expect(() => parseReviewYaml(yaml)).toThrow('Missing or invalid "version" field');
  });

  it('throws when "generated_at" is missing', () => {
    const yaml = `
version: '1.0'
source_repos: []
candidates: []
`;
    expect(() => parseReviewYaml(yaml)).toThrow('Missing or invalid "generated_at" field');
  });

  it('throws when "source_repos" is not an array', () => {
    const yaml = `
version: '1.0'
generated_at: '2026-08-01T00:00:00.000Z'
source_repos: 'not-an-array'
candidates: []
`;
    expect(() => parseReviewYaml(yaml)).toThrow(
      'Missing or invalid "source_repos" field (must be an array)'
    );
  });

  it('throws when a source_repos entry is not a string', () => {
    const yaml = `
version: '1.0'
generated_at: '2026-08-01T00:00:00.000Z'
source_repos: [1, 2]
candidates: []
`;
    expect(() => parseReviewYaml(yaml)).toThrow('source_repos[0] must be a string');
  });

  it('throws when "candidates" is not an array', () => {
    const yaml = `
version: '1.0'
generated_at: '2026-08-01T00:00:00.000Z'
source_repos: []
candidates: 'nope'
`;
    expect(() => parseReviewYaml(yaml)).toThrow(
      'Missing or invalid "candidates" field (must be an array)'
    );
  });

  it('throws when a candidate entry is not an object', () => {
    const yaml = `
version: '1.0'
generated_at: '2026-08-01T00:00:00.000Z'
source_repos: []
candidates: ['nope']
`;
    expect(() => parseReviewYaml(yaml)).toThrow('candidates[0] must be an object');
  });

  it('throws when a candidate is missing required string fields', () => {
    const missingId = `
version: '1.0'
generated_at: '2026-08-01T00:00:00.000Z'
source_repos: [a, b]
candidates:
  - source: a
    target: b
    type: http
    reasoning: 'x'
    confidence: low
`;
    expect(() => parseReviewYaml(missingId)).toThrow('candidates[0].id must be a string');
  });

  it('throws when a candidate type is not one of the known values', () => {
    const yaml = `
version: '1.0'
generated_at: '2026-08-01T00:00:00.000Z'
source_repos: [a, b]
candidates:
  - id: cand_1
    source: a
    target: b
    type: websocket
    reasoning: 'x'
    confidence: low
`;
    expect(() => parseReviewYaml(yaml)).toThrow(
      'candidates[0].type must be one of: database, http, kafka, queue, grpc'
    );
  });

  it('throws when a candidate confidence is not one of the known values', () => {
    const yaml = `
version: '1.0'
generated_at: '2026-08-01T00:00:00.000Z'
source_repos: [a, b]
candidates:
  - id: cand_1
    source: a
    target: b
    type: http
    reasoning: 'x'
    confidence: extreme
`;
    expect(() => parseReviewYaml(yaml)).toThrow(
      'candidates[0].confidence must be one of: high, medium, low'
    );
  });

  it('normalizes non-string override_name/override_type to null', () => {
    const yaml = `
version: '1.0'
generated_at: '2026-08-01T00:00:00.000Z'
source_repos: [a, b]
candidates:
  - id: cand_1
    source: a
    target: b
    type: http
    reasoning: 'x'
    confidence: low
    override_name: 42
    override_type: true
`;
    const { candidates } = parseReviewYaml(yaml);
    expect(candidates[0]?.override_name).toBeNull();
    expect(candidates[0]?.override_type).toBeNull();
  });
});
