import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { RepositoryKnowledgeGraphSchema, type RepositoryKnowledgeGraph } from './schema.js';

function artifactPath(outputDir: string, repoName: string): string {
  return join(outputDir, `${repoName}.knowledge-graph.json`);
}

/** US3/FR-011: does a valid cached artifact already exist for this repo? */
export async function hasValidCachedArtifact(
  outputDir: string,
  repoName: string
): Promise<boolean> {
  const path = artifactPath(outputDir, repoName);
  try {
    await access(path);
  } catch {
    return false;
  }
  try {
    const raw: unknown = JSON.parse(await readFile(path, 'utf8'));
    return RepositoryKnowledgeGraphSchema.safeParse(raw).success;
  } catch {
    return false;
  }
}

export async function readKnowledgeGraph(
  outputDir: string,
  repoName: string
): Promise<RepositoryKnowledgeGraph> {
  const path = artifactPath(outputDir, repoName);
  const raw: unknown = JSON.parse(await readFile(path, 'utf8'));
  return RepositoryKnowledgeGraphSchema.parse(raw);
}

export async function writeKnowledgeGraph(
  outputDir: string,
  graph: RepositoryKnowledgeGraph
): Promise<string> {
  RepositoryKnowledgeGraphSchema.parse(graph); // throws on invalid — never persist bad data
  await mkdir(outputDir, { recursive: true });
  const path = artifactPath(outputDir, graph.repository.name);
  await writeFile(path, JSON.stringify(graph, null, 2), 'utf8');
  return path;
}

export async function listAllKnowledgeGraphs(
  outputDir: string
): Promise<RepositoryKnowledgeGraph[]> {
  const { readdir } = await import('node:fs/promises');
  let entries: string[];
  try {
    entries = await readdir(outputDir);
  } catch {
    return [];
  }
  const graphs: RepositoryKnowledgeGraph[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.knowledge-graph.json')) continue;
    try {
      const raw: unknown = JSON.parse(await readFile(join(outputDir, entry), 'utf8'));
      const parsed = RepositoryKnowledgeGraphSchema.safeParse(raw);
      if (parsed.success) graphs.push(parsed.data);
    } catch {
      // Skip unreadable/corrupt artifacts rather than fail the whole aggregate load.
    }
  }
  return graphs;
}
