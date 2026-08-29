import type { ManifestDependency, ManifestInfo } from '../types.js';

/**
 * Per-ecosystem manifest extraction. Deliberately lightweight: full
 * TOML/gradle grammars are out of scope — the extraction level is documented
 * per parser and covered by tests. All parsers are pure (content in,
 * ManifestInfo out). Ported from understand-everything's linker core.
 */

export function parseNpmManifest(relPath: string, content: string): ManifestInfo | null {
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
  const dependencies: ManifestDependency[] = [];
  for (const key of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
    const section = json[key];
    if (typeof section !== 'object' || section === null) continue;
    for (const [name, version] of Object.entries(section as Record<string, unknown>)) {
      if (typeof version !== 'string') continue;
      const local = /^(?:file:|link:)(.+)$/.exec(version);
      dependencies.push({
        name,
        version,
        ...(local?.[1] ? { localPath: local[1] } : {}),
      });
    }
  }
  const name = typeof json.name === 'string' ? [json.name] : [];
  return { ecosystem: 'npm', relPath, publishedNames: name, dependencies };
}

/**
 * pyproject.toml — line-level extraction: `[project] name`, PEP 621
 * `dependencies = [...]`, and poetry's `[tool.poetry.dependencies]` keys.
 */
export function parsePyprojectManifest(relPath: string, content: string): ManifestInfo {
  const publishedNames: string[] = [];
  const dependencies: ManifestDependency[] = [];
  const lines = content.split('\n');
  let section = '';
  let inDepsArray = false;
  for (const raw of lines) {
    const line = raw.trim();
    const sectionMatch = /^\[(.+)\]$/.exec(line);
    if (sectionMatch?.[1]) {
      section = sectionMatch[1];
      inDepsArray = false;
      continue;
    }
    if (section === 'project') {
      const name = /^name\s*=\s*["']([^"']+)["']/.exec(line);
      if (name?.[1]) publishedNames.push(name[1]);
      if (/^dependencies\s*=\s*\[/.test(line)) inDepsArray = true;
    }
    if (inDepsArray) {
      for (const dep of line.matchAll(/["']([A-Za-z0-9._-]+)[^"']*["']/g)) {
        if (dep[1]) dependencies.push({ name: dep[1] });
      }
      if (line.includes(']')) inDepsArray = false;
    }
    if (section === 'tool.poetry.dependencies') {
      const dep = /^([A-Za-z0-9._-]+)\s*=/.exec(line);
      if (dep?.[1] && dep[1] !== 'python') dependencies.push({ name: dep[1] });
    }
  }
  return { ecosystem: 'python', relPath, publishedNames, dependencies };
}

/** go.mod — module path, require entries, and replace directives to local paths. */
export function parseGoModManifest(relPath: string, content: string): ManifestInfo {
  const publishedNames: string[] = [];
  const dependencies: ManifestDependency[] = [];
  const moduleMatch = /^module\s+(\S+)/m.exec(content);
  if (moduleMatch?.[1]) publishedNames.push(moduleMatch[1]);

  const requireBlock = /require\s*\(([^)]*)\)/g;
  for (const block of content.matchAll(requireBlock)) {
    for (const line of (block[1] ?? '').split('\n')) {
      const dep = /^\s*(\S+)\s+(\S+)/.exec(line);
      if (dep?.[1] && !dep[1].startsWith('//')) {
        dependencies.push({ name: dep[1], version: dep[2] });
      }
    }
  }
  for (const single of content.matchAll(/^require\s+(\S+)\s+(\S+)/gm)) {
    if (single[1] && single[1] !== '(') dependencies.push({ name: single[1], version: single[2] });
  }
  for (const rep of content.matchAll(/^replace\s+(\S+)\s*=>\s*(\S+)/gm)) {
    if (rep[1] && rep[2] && (rep[2].startsWith('./') || rep[2].startsWith('../'))) {
      dependencies.push({ name: rep[1], localPath: rep[2] });
    }
  }
  return { ecosystem: 'go', relPath, publishedNames, dependencies };
}

/** Cargo.toml — [package] name and [dependencies] keys incl. path = "..." specifiers. */
export function parseCargoManifest(relPath: string, content: string): ManifestInfo {
  const publishedNames: string[] = [];
  const dependencies: ManifestDependency[] = [];
  let section = '';
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    const sectionMatch = /^\[(.+)\]$/.exec(line);
    if (sectionMatch?.[1]) {
      section = sectionMatch[1];
      continue;
    }
    if (section === 'package') {
      const name = /^name\s*=\s*["']([^"']+)["']/.exec(line);
      if (name?.[1]) publishedNames.push(name[1]);
    }
    if (
      /^(?:dev-|build-)?dependencies(?:\..+)?$/.test(section) ||
      section.endsWith('dependencies')
    ) {
      const dep = /^([A-Za-z0-9._-]+)\s*=\s*(.+)$/.exec(line);
      if (dep?.[1] && dep[2]) {
        const local = /path\s*=\s*["']([^"']+)["']/.exec(dep[2]);
        dependencies.push({ name: dep[1], ...(local?.[1] ? { localPath: local[1] } : {}) });
      }
    }
  }
  return { ecosystem: 'rust', relPath, publishedNames, dependencies };
}

/** pom.xml — regex-level: groupId:artifactId published, <dependency> blocks consumed. */
export function parsePomManifest(relPath: string, content: string): ManifestInfo {
  const publishedNames: string[] = [];
  const dependencies: ManifestDependency[] = [];

  // Published coordinates: first groupId/artifactId outside <parent>/<dependency> blocks.
  const stripped = content
    .replace(/<parent>[\s\S]*?<\/parent>/g, '')
    .replace(/<dependencies>[\s\S]*?<\/dependencies>/g, '');
  const group = /<groupId>([^<]+)<\/groupId>/.exec(stripped);
  const artifact = /<artifactId>([^<]+)<\/artifactId>/.exec(stripped);
  if (group?.[1] && artifact?.[1]) publishedNames.push(`${group[1].trim()}:${artifact[1].trim()}`);

  for (const dep of content.matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)) {
    const g = /<groupId>([^<]+)<\/groupId>/.exec(dep[1] ?? '');
    const a = /<artifactId>([^<]+)<\/artifactId>/.exec(dep[1] ?? '');
    if (g?.[1] && a?.[1]) dependencies.push({ name: `${g[1].trim()}:${a[1].trim()}` });
  }
  return { ecosystem: 'maven', relPath, publishedNames, dependencies };
}

/** build.gradle(.kts) — regex-level: implementation("g:a:v") style strings only. */
export function parseGradleManifest(relPath: string, content: string): ManifestInfo {
  const dependencies: ManifestDependency[] = [];
  for (const dep of content.matchAll(
    /(?:implementation|api|compileOnly|runtimeOnly|testImplementation)\s*\(?\s*["']([^"':]+):([^"':]+)(?::([^"']+))?["']/g
  )) {
    if (dep[1] && dep[2]) {
      dependencies.push({ name: `${dep[1]}:${dep[2]}`, ...(dep[3] ? { version: dep[3] } : {}) });
    }
  }
  // Gradle projects rarely declare their own coordinates in the build file.
  return { ecosystem: 'gradle', relPath, publishedNames: [], dependencies };
}

/** Dispatch by basename; null for non-manifest files. */
export function parseManifest(relPath: string, content: string): ManifestInfo | null {
  const base = (relPath.split('/').pop() ?? '').toLowerCase();
  if (base === 'package.json') return parseNpmManifest(relPath, content);
  if (base === 'pyproject.toml') return parsePyprojectManifest(relPath, content);
  if (base === 'go.mod') return parseGoModManifest(relPath, content);
  if (base === 'cargo.toml') return parseCargoManifest(relPath, content);
  if (base === 'pom.xml') return parsePomManifest(relPath, content);
  if (base === 'build.gradle' || base === 'build.gradle.kts') {
    return parseGradleManifest(relPath, content);
  }
  return null;
}

export const MANIFEST_BASENAMES = new Set([
  'package.json',
  'pyproject.toml',
  'go.mod',
  'cargo.toml',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
]);
