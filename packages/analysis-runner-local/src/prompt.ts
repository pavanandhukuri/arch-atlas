import type { AnalysisContext } from '@arch-atlas/llm-importer';

/**
 * Prompt construction for the bounded per-repository analysis call. Relocated
 * verbatim from the importer's former `analyze-repo.ts` (008 D14) as part of
 * 010.
 */

export type StructuredOutputMode = 'prompt' | 'tool';

export const MODEL_OUTPUT_SHAPE = `{
  "description": "string — 1-3 sentences on what this repository is/does",
  "languages": ["string", ...],
  "frameworks": ["string", ...],
  "served": {
    "httpRoutes": [{ "method": "GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS", "path": "/starts/with/slash", "filePath": "repo/relative/file" }],
    "grpcServices": ["package.v1.ServiceName"],
    "topics": [{ "name": "topic-or-queue", "direction": "publish|consume|unknown", "filePath": "repo/relative/file" }],
    "datastores": [{ "name": "db-or-table", "kind": "relational|document|keyvalue|blob|search|other" }]
  },
  "outbound": [{ "target": "other-system-name", "verb": "calls|depends_on|publishes|subscribes|reads_from|writes_to", "detail": "one sentence", "confidence": 0.0 }]
}`;

export const RETRY_PREAMBLE =
  'IMPORTANT: a previous attempt produced output that could not be used. ' +
  'Respond with ONLY the JSON object — no markdown code fences, no explanation, ' +
  'no text before or after it, no comments, no trailing commas.\n\n';

const GUIDANCE = [
  'Rules:',
  '- `frameworks` = the runtime/application frameworks the code is built on (Express, Gin, Spring Boot, React, Next.js, gRPC). NOT test runners, linters, bundlers, type stubs, or CLI tooling.',
  '- List a served interface only if you can point to the file it is defined in; put that path in `filePath`.',
  '- `served` = interfaces THIS repo exposes. `outbound` = systems this repo calls/depends on/publishes to.',
  '- Prefer the evidence in the source and the detected hints over guessing.',
].join('\n');

function section(title: string, files: Array<{ relPath: string; text: string }>): string {
  if (files.length === 0) return `## ${title}\n(none)\n`;
  return `## ${title}\n` + files.map((f) => `### ${f.relPath}\n${f.text}`).join('\n\n') + '\n';
}

function detectedSection(ctx: AnalysisContext): string {
  const { httpRoutes, topics } = ctx.detected;
  if (httpRoutes.length === 0 && topics.length === 0) return '';
  const lines = ['## Detected interface hints (from a crude literal scan — NOT authoritative)'];
  lines.push(
    'Confirm the real ones against the source above, drop false positives, add anything the scan missed, and set the correct direction/method:'
  );
  for (const r of httpRoutes) {
    lines.push(`- route: ${r.method ?? '?'} ${r.path}  (${r.relPath}:${r.line})`);
  }
  for (const t of topics) {
    lines.push(`- topic: ${t.name}  role=${t.role}  (${t.relPath}:${t.line})`);
  }
  return lines.join('\n') + '\n';
}

function dependencySection(ctx: AnalysisContext): string {
  if (ctx.dependencySplits.length === 0) return '';
  const lines = ['## Declared dependencies (frameworks come from RUNTIME deps, never dev deps)'];
  for (const d of ctx.dependencySplits) {
    lines.push(`### ${d.relPath}`);
    lines.push(`runtime: ${d.dependencies.join(', ') || '(none)'}`);
    if (d.peerDependencies.length > 0) lines.push(`peer: ${d.peerDependencies.join(', ')}`);
    lines.push(`dev (IGNORE for frameworks): ${d.devDependencies.join(', ') || '(none)'}`);
  }
  return lines.join('\n') + '\n';
}

export function renderPrompt(
  ctx: AnalysisContext,
  attempt: 0 | 1 = 0,
  mode: StructuredOutputMode = 'prompt'
): string {
  const responseInstruction =
    mode === 'tool'
      ? 'Reply with ONLY the JSON object matching the schema you were given.'
      : 'Respond with a SINGLE JSON object and nothing else, matching this exact shape (omit optional fields you cannot determine; use empty arrays where there is nothing):';
  return [
    attempt === 1 ? RETRY_PREAMBLE.trimEnd() : '',
    'You are analyzing ONE source-code repository. Use ONLY the material below. Do not ask questions.',
    responseInstruction,
    '',
    MODEL_OUTPUT_SHAPE,
    '',
    GUIDANCE,
    '',
    `## Repository`,
    `name: ${ctx.repoName}`,
    ctx.descriptionHint ? `hint: ${ctx.descriptionHint}` : '',
    '',
    section('READMEs', ctx.readmes),
    dependencySection(ctx),
    section('Manifests', ctx.manifests),
    `## Directory listing\n${ctx.listing.join('\n') || '(empty)'}\n`,
    section(
      'Selected source files',
      ctx.sourceExcerpts.map((s) => ({
        relPath: s.truncated ? `${s.relPath} (truncated)` : s.relPath,
        text: s.text,
      }))
    ),
    detectedSection(ctx),
  ]
    .filter((line) => line !== '')
    .join('\n');
}

export function renderVerifyPrompt(
  ctx: AnalysisContext,
  model: unknown,
  mode: StructuredOutputMode
): string {
  return [
    'Below is a draft analysis of a repository, followed by the source it was derived from.',
    'Return a corrected analysis in the SAME shape. Remove any httpRoute, grpcService, topic,',
    'datastore, or outbound entry that is NOT clearly supported by the provided source or',
    'manifests. Keep everything that IS supported. Do not add new entries. Keep description,',
    'languages, and frameworks unless plainly wrong.',
    mode === 'tool'
      ? 'Reply with ONLY the corrected JSON object.'
      : 'Respond with ONLY the corrected JSON object.',
    '',
    '## Draft analysis',
    JSON.stringify(model, null, 2),
    '',
    section('Manifests', ctx.manifests),
    section(
      'Source files',
      ctx.sourceExcerpts.map((s) => ({ relPath: s.relPath, text: s.text }))
    ),
  ].join('\n');
}
