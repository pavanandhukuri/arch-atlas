import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import yaml from 'js-yaml';
import { ZodError } from 'zod';
import { CONFIG_VERSION, ImportConfigSchema, type ImportConfig } from './config.schema.js';

export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

function parseRaw(contents: string, filePath: string): unknown {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.yaml' || ext === '.yml') {
    return yaml.load(contents);
  }
  if (ext === '.json') {
    return JSON.parse(contents);
  }
  throw new ConfigValidationError(
    `Unsupported config file extension "${ext}" — expected .json, .yaml, or .yml (${filePath})`
  );
}

/**
 * contracts/config-schema-contract.md "Migration from v1.0": a v1.0 config
 * (identifiable by a top-level `provider` block) must be rejected with a
 * specific, actionable error — not silently coerced or generically rejected.
 */
function checkNotV1Shape(raw: unknown, filePath: string): void {
  if (typeof raw !== 'object' || raw === null) return;
  const obj = raw as Record<string, unknown>;
  if ('provider' in obj) {
    throw new ConfigValidationError(
      `${filePath}: found a v1.0-style "provider" field. The importer core is model-free ` +
        'and does not read a provider/model configuration at all — drop the "provider" ' +
        `block entirely and set "version" to "${CONFIG_VERSION}". See ` +
        'contracts/config-schema-contract.md.'
    );
  }
}

export async function loadConfig(filePath: string): Promise<ImportConfig> {
  const contents = await readFile(filePath, 'utf8');
  const raw = parseRaw(contents, filePath);
  checkNotV1Shape(raw, filePath);

  const result = ImportConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new ConfigValidationError(formatZodError(result.error, filePath));
  }
  return result.data;
}

function formatZodError(error: ZodError, filePath: string): string {
  const issues = error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  return `${filePath}: config validation failed\n${issues}`;
}
