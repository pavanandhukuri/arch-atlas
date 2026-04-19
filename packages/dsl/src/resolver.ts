import type { DslAst, DslElementNode, DslRelationshipNode, ParseError, ParseResult } from './types';
import type { ArchitectureModel, Element, Relationship } from '@arch-atlas/core-model';
import { SUPPORTED_DSL_VERSION } from './constants';

export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function makeId(name: string, parentId?: string): string {
  const slug = slugify(name);
  return parentId ? `${parentId}.${slug}` : slug;
}

type NameRegistry = Map<string, string>; // scopedName -> id

function buildRegistry(
  nodes: DslElementNode[],
  errors: ParseError[],
  parentId?: string,
  registry: NameRegistry = new Map()
): NameRegistry {
  for (const node of nodes) {
    const scopeKey = parentId ? `${parentId}::${node.name}` : node.name;
    if (registry.has(scopeKey)) {
      errors.push({
        errorCode: 'DUPLICATE_NAME',
        message: `Duplicate element name '${node.name}' in scope '${parentId ?? 'root'}'`,
        location: { elementName: node.name },
      });
      continue;
    }
    const id = makeId(node.name, parentId);
    registry.set(scopeKey, id);
    // Also register by plain name for cross-scope relationship resolution
    if (!registry.has(node.name)) registry.set(node.name, id);
    if (node.children.length > 0) {
      buildRegistry(node.children, errors, id, registry);
    }
  }
  return registry;
}

function assembleElements(nodes: DslElementNode[], parentId?: string): Element[] {
  const elements: Element[] = [];
  for (const node of nodes) {
    const id = makeId(node.name, parentId);
    const el: Element = {
      id,
      kind: node.kind,
      name: node.name,
      parentId,
    };
    if (node.attrs['description']) el.description = node.attrs['description'];
    if (node.attrs['technology']) el.technology = node.attrs['technology'];
    if (node.attrs['external'] === 'true') el.isExternal = true;
    if (node.attrs['tags']) el.tags = node.attrs['tags'].split(',').map((t) => t.trim());
    if (node.attrs['subtype']) {
      el.containerSubtype = node.attrs['subtype'] as Element['containerSubtype'];
    }
    if (node.attrs['bg'] ?? node.attrs['border'] ?? node.attrs['font']) {
      el.formatting = {};
      if (node.attrs['bg']) el.formatting.backgroundColor = node.attrs['bg'];
      if (node.attrs['border']) el.formatting.borderColor = node.attrs['border'];
      if (node.attrs['font']) el.formatting.fontColor = node.attrs['font'];
    }
    elements.push(el);
    if (node.children.length > 0) {
      elements.push(...assembleElements(node.children, id));
    }
  }
  return elements;
}

function assembleRelationships(
  nodes: DslRelationshipNode[],
  registry: NameRegistry,
  errors: ParseError[]
): Relationship[] {
  const relationships: Relationship[] = [];
  for (const node of nodes) {
    const sourceId = registry.get(node.sourceName);
    const targetId = registry.get(node.targetName);
    if (!sourceId) {
      errors.push({
        errorCode: 'UNRESOLVED_REFERENCE',
        message: `Element '${node.sourceName}' is not declared in this document`,
        location: { line: node.line, elementName: node.sourceName },
      });
    }
    if (!targetId) {
      errors.push({
        errorCode: 'UNRESOLVED_REFERENCE',
        message: `Element '${node.targetName}' is not declared in this document`,
        location: { line: node.line, elementName: node.targetName },
      });
    }
    if (!sourceId || !targetId) continue;

    const relId = `rel-${slugify(node.sourceName)}-${slugify(node.targetName)}`;
    const rel: Relationship = {
      id: relId,
      sourceId,
      targetId,
      type: node.attrs['type'] ?? 'uses',
    };
    if (node.attrs['label']) rel.label = node.attrs['label'];
    if (node.attrs['action']) rel.action = node.attrs['action'];
    if (node.attrs['integration']) rel.integrationMode = node.attrs['integration'];
    if (node.attrs['description']) rel.description = node.attrs['description'];
    if (node.attrs['tags']) rel.tags = node.attrs['tags'].split(',').map((t) => t.trim());
    relationships.push(rel);
  }
  return relationships;
}

export function resolve(ast: DslAst): ParseResult {
  const errors: ParseError[] = [];

  if (ast.version !== undefined && ast.version !== SUPPORTED_DSL_VERSION) {
    errors.push({
      errorCode: 'UNSUPPORTED_VERSION',
      message: `DSL version '${ast.version}' is not supported. Only version '${SUPPORTED_DSL_VERSION}' is accepted.`,
      location: { line: 1 },
    });
    return { ok: false, errors };
  }

  const registry = buildRegistry(ast.elements, errors);

  if (errors.length > 0) return { ok: false, errors };

  const elements = assembleElements(ast.elements);

  if (elements.length === 0) {
    errors.push({
      errorCode: 'EMPTY_DOCUMENT',
      message: 'Document contains no elements. At least one element must be declared.',
      location: {},
    });
    return { ok: false, errors };
  }

  const relationships = assembleRelationships(ast.relationships, registry, errors);

  if (errors.length > 0) return { ok: false, errors };

  const model: ArchitectureModel = {
    schemaVersion: '1.0.0',
    metadata: { title: 'Imported Model', createdAt: new Date().toISOString() },
    elements,
    relationships,
    constraints: [],
    views: [],
  };

  return { ok: true, model };
}
