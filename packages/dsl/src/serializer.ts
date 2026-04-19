import type { ArchitectureModel, Element, Relationship } from '@arch-atlas/core-model';
import { SUPPORTED_DSL_VERSION } from './constants';

function escapeAttr(value: string): string {
  return value.replace(/"/g, '\\"');
}

function serializeAttrs(attrs: Record<string, string>): string {
  const entries = Object.entries(attrs);
  if (entries.length === 0) return '';
  return ' [' + entries.map(([k, v]) => `${k}="${escapeAttr(v)}"`).join(', ') + ']';
}

function buildElementAttrs(el: Element): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (el.description) attrs['description'] = el.description;
  if (el.technology) attrs['technology'] = el.technology;
  if (el.isExternal) attrs['external'] = 'true';
  if (el.tags && el.tags.length > 0) attrs['tags'] = el.tags.join(',');
  if (el.containerSubtype && el.containerSubtype !== 'default')
    attrs['subtype'] = el.containerSubtype;
  if (el.formatting) {
    if (el.formatting.backgroundColor) attrs['bg'] = el.formatting.backgroundColor;
    if (el.formatting.borderColor) attrs['border'] = el.formatting.borderColor;
    if (el.formatting.fontColor) attrs['font'] = el.formatting.fontColor;
  }
  return attrs;
}

function serializeElement(
  el: Element,
  children: Element[],
  allElements: Element[],
  indent: number
): string {
  const pad = '  '.repeat(indent);
  const attrs = serializeAttrs(buildElementAttrs(el));
  const directChildren = children.filter((c) => c.parentId === el.id);

  if (directChildren.length === 0) {
    return `${pad}${el.kind} "${el.name}"${attrs}`;
  }

  const childLines = directChildren
    .map((c) =>
      serializeElement(
        c,
        allElements.filter((x) => x.parentId === c.id),
        allElements,
        indent + 1
      )
    )
    .join('\n');

  return `${pad}${el.kind} "${el.name}"${attrs} {\n${childLines}\n${pad}}`;
}

function buildElementName(id: string, elements: Element[]): string {
  return elements.find((e) => e.id === id)?.name ?? id;
}

function serializeRelationship(rel: Relationship, elements: Element[]): string {
  const sourceName = buildElementName(rel.sourceId, elements);
  const targetName = buildElementName(rel.targetId, elements);
  const attrs: Record<string, string> = {};
  if (rel.type) attrs['type'] = rel.type;
  if (rel.label) attrs['label'] = rel.label;
  if (rel.action) attrs['action'] = rel.action;
  if (rel.integrationMode) attrs['integration'] = rel.integrationMode;
  if (rel.description) attrs['description'] = rel.description;
  if (rel.tags && rel.tags.length > 0) attrs['tags'] = rel.tags.join(',');
  return `"${sourceName}" -> "${targetName}"${serializeAttrs(attrs)}`;
}

export function serialize(model: ArchitectureModel): string {
  const lines: string[] = [`version "${SUPPORTED_DSL_VERSION}"`, ''];

  const topLevel = model.elements.filter((e) => !e.parentId);

  for (const el of topLevel) {
    const childElements = model.elements.filter((c) => c.parentId !== undefined);
    lines.push(serializeElement(el, childElements, model.elements, 0));
  }

  if (model.relationships.length > 0) {
    lines.push('');
    for (const rel of model.relationships) {
      lines.push(serializeRelationship(rel, model.elements));
    }
  }

  return lines.join('\n');
}
