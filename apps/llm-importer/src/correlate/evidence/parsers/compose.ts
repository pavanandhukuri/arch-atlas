import yaml from 'js-yaml';
import type { ComposeInfo, ComposeService } from '../types.js';

/**
 * docker-compose parsing. Ported from understand-everything's linker core
 * (yaml package swapped for js-yaml).
 */

interface RawService {
  build?: string | { context?: string };
  image?: string;
  environment?: Record<string, unknown> | string[];
  depends_on?: string[] | Record<string, unknown>;
}

export function parseComposeFile(relPath: string, content: string): ComposeInfo | null {
  // Service values may be null in malformed-but-parseable YAML — typed
  // honestly so the guards below stay both lint-clean and runtime-safe.
  let doc: { services?: Record<string, RawService | null> } | null | undefined;
  try {
    doc = yaml.load(content) as { services?: Record<string, RawService | null> } | null | undefined;
  } catch {
    return null;
  }
  if (!doc || typeof doc !== 'object' || !doc.services) return null;

  const services: ComposeService[] = [];
  for (const [name, raw] of Object.entries(doc.services)) {
    if (!raw || typeof raw !== 'object') continue;
    const buildContext =
      typeof raw.build === 'string'
        ? raw.build
        : typeof raw.build?.context === 'string'
          ? raw.build.context
          : undefined;

    const environment: Record<string, string> = {};
    if (Array.isArray(raw.environment)) {
      for (const entry of raw.environment) {
        if (typeof entry !== 'string') continue;
        const eq = entry.indexOf('=');
        if (eq > 0) environment[entry.slice(0, eq)] = entry.slice(eq + 1);
      }
    } else if (raw.environment && typeof raw.environment === 'object') {
      for (const [k, v] of Object.entries(raw.environment)) {
        if (v !== null && v !== undefined) environment[k] = String(v);
      }
    }

    const dependsOn = Array.isArray(raw.depends_on)
      ? raw.depends_on.filter((d): d is string => typeof d === 'string')
      : raw.depends_on && typeof raw.depends_on === 'object'
        ? Object.keys(raw.depends_on)
        : [];

    services.push({
      name,
      ...(buildContext ? { buildContext } : {}),
      ...(typeof raw.image === 'string' ? { image: raw.image } : {}),
      environment,
      dependsOn,
    });
  }
  return { relPath, services };
}

export function isComposeFile(relPath: string): boolean {
  const base = (relPath.split('/').pop() ?? '').toLowerCase();
  return /^(docker-)?compose[^/]*\.ya?ml$/.test(base);
}
