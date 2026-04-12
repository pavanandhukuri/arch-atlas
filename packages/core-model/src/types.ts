// Core domain types for the semantic architecture model

export type ElementKind = 'landscape' | 'system' | 'person' | 'container' | 'component' | 'code';

/**
 * Visual subtype for container elements.
 * Controls the shape rendered in the container view.
 * Only valid on elements with kind === 'container'.
 * Treat absent/unknown values as 'default'.
 */
export type ContainerSubtype =
  | 'default'
  | 'database'
  | 'storage-bucket'
  | 'static-content'
  | 'user-interface'
  | 'backend-service';

/**
 * Per-element color overrides applied by the renderer.
 * Only valid when isExternal !== true.
 * All color strings MUST match /^#[0-9a-fA-F]{6}$/ (6-digit hex).
 */
export interface ElementFormatting {
  backgroundColor?: string;
  borderColor?: string;
  fontColor?: string;
}

export interface CodeReference {
  kind: 'module' | 'file' | 'symbol';
  ref: string;
  repoHint?: string;
}

export interface Element {
  id: string;
  kind: ElementKind;
  name: string;
  description?: string;
  parentId?: string;
  tags?: string[];
  attributes?: Record<string, unknown>;
  codeRef?: CodeReference;
  // Kind-specific fields
  technology?: string; // For containers: e.g., "Docker", "Spring Boot", "React"
  componentType?: string; // For components: e.g., "Service", "Controller", "Repository"
  /**
   * Marks a system as belonging to an external organization.
   * Only valid when kind === 'system'.
   * External systems render in a distinct muted color, cannot be drilled into,
   * and cannot have children. Cannot coexist with formatting overrides.
   */
  isExternal?: boolean;
  /**
   * Visual subtype for container elements.
   * Only valid when kind === 'container'.
   * Controls the PixiJS shape used in the container view.
   * Defaults to 'default' (rounded rectangle) when absent.
   */
  containerSubtype?: ContainerSubtype;
  /**
   * Per-element color overrides. Not valid when isExternal === true.
   */
  formatting?: ElementFormatting;
}

export interface Relationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  label?: string; // Deprecated - use action instead
  action?: string; // What the arrow does, e.g., "Fetches data", "Sends events"
  integrationMode?: string; // Mode of integration, e.g., "REST API", "SQL", "Message Queue"
  description?: string;
  tags?: string[];
}

export interface Constraint {
  id: string;
  type: string;
  scope: Record<string, unknown>;
  parameters?: Record<string, unknown>;
  severity: 'error' | 'warning';
}

export interface LayoutNode {
  elementId: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  collapsed?: boolean;
}

export interface LayoutEdge {
  relationshipId: string;
  path?: Record<string, unknown>;
}

export interface LayoutState {
  algorithm: string;
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  viewport?: Record<string, unknown>;
}

export interface View {
  id: string;
  level: ElementKind;
  title: string;
  filter?: Record<string, unknown>;
  layout: LayoutState;
}

export interface ArchitectureModel {
  schemaVersion: string;
  metadata: {
    title: string;
    description?: string;
    createdAt?: string;
    updatedAt?: string;
  };
  elements: Element[];
  relationships: Relationship[];
  constraints: Constraint[];
  views: View[];
}

export interface Change {
  op: 'add' | 'update' | 'delete';
  targetType: 'element' | 'relationship' | 'constraint' | 'view';
  targetId: string;
  value?: unknown;
}

export interface ChangeProposal {
  id: string;
  summary: string;
  changes: Change[];
}
