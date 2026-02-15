// Core domain types for the semantic architecture model

export type ElementKind = 'landscape' | 'system' | 'container' | 'component' | 'code';

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
