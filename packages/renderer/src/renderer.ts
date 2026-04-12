// Enhanced renderer with relationships (arrows)

// Patch PixiJS to work in environments with strict CSP (no unsafe-eval).
// Must be imported before any other pixi.js import.
import '@pixi/unsafe-eval';
import type { ArchitectureModel, View, Element } from '@arch-atlas/core-model';
import { Application, Graphics, Text, Container, Rectangle, settings } from 'pixi.js';

export interface RendererOptions {
  background?: number;
  antialias?: boolean;
  onElementDrag?: (elementId: string, x: number, y: number) => void;
}

export interface Renderer {
  destroy: () => void;
  setZoom: (zoom: number) => void;
  pan: (dx: number, dy: number) => void;
  onDrillDown: (callback: (elementId: string) => void) => void;
  onClick: (callback: (elementId: string) => void) => void;
  onDrag: (callback: (elementId: string, x: number, y: number) => void) => void;
  onConnectionStart: (callback: (elementId: string) => void) => void;
  onConnectionComplete: (callback: (sourceId: string, targetId: string) => void) => void;
  onRelationshipClick: (callback: (relationshipId: string) => void) => void;
  onBackgroundClick: (callback: () => void) => void;
  setConnectionPreview: (elementId: string | null) => void;
  clearRelationshipSelection: () => void;
  updateLayout: (
    model: ArchitectureModel,
    view: View,
    meta?: { boundaryElementIds?: string[]; externalElementIds?: string[]; boundaryLabel?: string }
  ) => void;
}

function drawArrow(graphics: Graphics, fromX: number, fromY: number, toX: number, toY: number) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const angle = Math.atan2(dy, dx);

  // Draw line
  graphics.moveTo(fromX, fromY);
  graphics.lineTo(toX, toY);

  // Draw arrowhead
  const arrowLength = 15;
  graphics.lineTo(
    toX - arrowLength * Math.cos(angle - Math.PI / 6),
    toY - arrowLength * Math.sin(angle - Math.PI / 6)
  );
  graphics.moveTo(toX, toY);
  graphics.lineTo(
    toX - arrowLength * Math.cos(angle + Math.PI / 6),
    toY - arrowLength * Math.sin(angle + Math.PI / 6)
  );
}

export function getRectEdgePoint(
  rect: { x: number; y: number; w: number; h: number },
  towardX: number,
  towardY: number
): { x: number; y: number } {
  const centerX = rect.x + rect.w / 2;
  const centerY = rect.y + rect.h / 2;
  const dx = towardX - centerX;
  const dy = towardY - centerY;

  if (dx === 0 && dy === 0) {
    return { x: centerX, y: centerY };
  }

  const halfW = rect.w / 2;
  const halfH = rect.h / 2;
  const scaleX = Math.abs(dx) > 0 ? halfW / Math.abs(dx) : Number.POSITIVE_INFINITY;
  const scaleY = Math.abs(dy) > 0 ? halfH / Math.abs(dy) : Number.POSITIVE_INFINITY;
  const scale = Math.min(scaleX, scaleY);

  return {
    x: centerX + dx * scale,
    y: centerY + dy * scale,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Container subtype shape drawing functions
// Each accepts a PixiJS Graphics object, width, and height. The caller is
// responsible for positioning (translating the Graphics before calling).
// ─────────────────────────────────────────────────────────────────────────────

/** Cylinder — for Database containers */
export function drawDatabase(g: Graphics, w: number, h: number, ox = 0, oy = 0): void {
  const rx = w / 2;
  const ry = 12;
  const bodyTop = ry;
  g.drawEllipse(ox + w / 2, oy + h - ry, rx, ry);
  g.drawRect(ox, oy + bodyTop, w, h - bodyTop * 2);
  g.drawEllipse(ox + w / 2, oy + bodyTop, rx, ry);
}

/** Trapezoid — for Storage Bucket containers */
export function drawStorageBucket(g: Graphics, w: number, h: number, ox = 0, oy = 0): void {
  const inset = w * 0.12;
  g.moveTo(ox, oy);
  g.lineTo(ox + w, oy);
  g.lineTo(ox + w - inset, oy + h);
  g.lineTo(ox + inset, oy + h);
  g.closePath();
}

/** Folder with tab — for Static Content containers */
export function drawStaticContent(g: Graphics, w: number, h: number, ox = 0, oy = 0): void {
  const tabW = w * 0.35;
  const tabH = 12;
  g.moveTo(ox, oy + tabH);
  g.lineTo(ox, oy);
  g.lineTo(ox + tabW, oy);
  g.lineTo(ox + tabW + 10, oy + tabH);
  g.lineTo(ox + w, oy + tabH);
  g.lineTo(ox + w, oy + h);
  g.lineTo(ox, oy + h);
  g.closePath();
}

/** Browser window — for User Interface containers */
export function drawUserInterface(g: Graphics, w: number, h: number, ox = 0, oy = 0): void {
  const barH = 22;
  g.drawRoundedRect(ox, oy, w, h, 6);
  g.moveTo(ox, oy + barH);
  g.lineTo(ox + w, oy + barH);
  const dotY = oy + barH / 2;
  g.drawCircle(ox + 12, dotY, 4);
  g.drawCircle(ox + 24, dotY, 4);
  g.drawCircle(ox + 36, dotY, 4);
}

/** Terminal rectangle — for Backend Service containers */
export function drawBackendService(g: Graphics, w: number, h: number, ox = 0, oy = 0): void {
  g.drawRoundedRect(ox, oy, w, h, 6);
  const barH = 22;
  g.moveTo(ox, oy + barH);
  g.lineTo(ox + w, oy + barH);
}

// ─────────────────────────────────────────────────────────────────────────────

// C4 outline style — white background, colored border + text (matches c4model.com diagram key)
const C4_COLORS: Record<string, { bg: number; text: number; border: number }> = {
  landscape: { bg: 0xffffff, text: 0x1168bd, border: 0x1168bd },
  system: { bg: 0xffffff, text: 0x1168bd, border: 0x1168bd },
  person: { bg: 0xffffff, text: 0x007580, border: 0x007580 }, // teal — internal user/staff
  container: { bg: 0xffffff, text: 0x2574a9, border: 0x2574a9 },
  component: { bg: 0xffffff, text: 0x3a7ebf, border: 0x3a7ebf },
  code: { bg: 0xffffff, text: 0x555555, border: 0x555555 },
};

// Color for external-organization systems (element.isExternal === true)
// Distinct red/maroon C4 "external" style
const EXTERNAL_ORG_COLOR = { bg: 0xfff3e0, text: 0x8a0000, border: 0x8a0000 };

function getTypeTag(element: Element): string {
  switch (element.kind) {
    case 'landscape':
      return '[Landscape]';
    case 'system':
      return '[Software System]';
    case 'person':
      return '[User]';
    case 'container':
      return element.technology ? `[Container: ${element.technology}]` : '[Container]';
    case 'component':
      return element.componentType ? `[Component: ${element.componentType}]` : '[Component]';
    case 'code':
      return '[Code]';
    default:
      return `[${element.kind}]`;
  }
}

function drawPersonIcon(graphics: Graphics, cx: number, cy: number, color: number) {
  const headRadius = 11;
  const bodyW = 30;
  const bodyH = 18;
  const bodyY = cy + headRadius + 4;

  // Head — outline only (C4 style)
  graphics.lineStyle(2.5, color, 1);
  graphics.beginFill(0xffffff, 0);
  graphics.drawCircle(cx, cy, headRadius);
  graphics.endFill();

  // Shoulders / torso — outline only
  graphics.lineStyle(2.5, color, 1);
  graphics.beginFill(0xffffff, 0);
  graphics.drawRoundedRect(cx - bodyW / 2, bodyY, bodyW, bodyH, 8);
  graphics.endFill();
}

export function createRenderer(
  container: HTMLElement,
  model: ArchitectureModel,
  view: View,
  options: RendererOptions = {}
): Renderer {
  // Set global resolution so all Text objects render at native DPR (fixes HiDPI blur)
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  settings.RESOLUTION = dpr;

  // Initialize PixiJS v7 application
  const app = new Application({
    width: container.offsetWidth || 800,
    height: container.offsetHeight || 600,
    backgroundAlpha: 0, // Make canvas transparent to show CSS grid
    antialias: options.antialias ?? true,
    resolution: dpr,
    autoDensity: true, // Keeps CSS size correct while rendering at native DPR
  });

  container.appendChild(app.view as HTMLCanvasElement);

  const stage = new Container();
  app.stage.addChild(stage);

  const handlePointerMove = (event: Event) => {
    const pointerEvent = event as PointerEvent;
    const canvas = app.view as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const newMouseX = pointerEvent.clientX - rect.left;
    const newMouseY = pointerEvent.clientY - rect.top;

    // Pan the stage when dragging empty canvas
    if (isPanning) {
      stage.x += newMouseX - previewMouseX;
      stage.y += newMouseY - previewMouseY;
    }

    previewMouseX = newMouseX;
    previewMouseY = newMouseY;

    // Manual hit testing during connection drag — convert to stage-local coords
    if (isDraggingConnection) {
      const stageMouseX = newMouseX - stage.x;
      const stageMouseY = newMouseY - stage.y;
      hoveredElementId = null;
      // Check if mouse is over any element
      for (const [elementId, graphics] of elementGraphics.entries()) {
        if (elementId === dragConnectionSourceId) continue; // Skip source element

        const { x, y, w, h } = graphics;
        if (stageMouseX >= x && stageMouseX <= x + w && stageMouseY >= y && stageMouseY <= y + h) {
          hoveredElementId = elementId;
          break;
        }
      }
    }

    if (isDraggingConnection || connectionPreviewElementId) {
      renderConnectionPreview();
    }
  };

  const handlePointerUp = (_event: Event) => {
    if (isDraggingConnection && dragConnectionSourceId && hoveredElementId) {
      // Complete the connection
      if (dragConnectionSourceId !== hoveredElementId) {
        if (connectionCompleteCallbacks.length > 0) {
          connectionCompleteCallbacks.forEach((cb) =>
            cb(dragConnectionSourceId!, hoveredElementId!)
          );
        }
      }
    }

    // Reset drag/pan state
    isDraggingConnection = false;
    isPanning = false;
    dragConnectionSourceId = null;
    connectionPreviewElementId = null;
    (app.view as HTMLCanvasElement).style.cursor = '';
    renderConnectionPreview();
  };

  (app.view as HTMLCanvasElement).addEventListener('pointermove', handlePointerMove);
  (app.view as HTMLCanvasElement).addEventListener('pointerup', handlePointerUp);

  // Draw grid background
  const gridGraphics = new Graphics();
  const drawGrid = () => {
    gridGraphics.clear();
    const width = app.screen.width;
    const height = app.screen.height;
    const gridSize = 24;
    const dotSize = 1.5;
    const dotColor = 0x999999; // Medium gray

    // Draw dots at grid intersections
    for (let x = 0; x < width; x += gridSize) {
      for (let y = 0; y < height; y += gridSize) {
        gridGraphics.beginFill(dotColor, 1);
        gridGraphics.drawCircle(x, y, dotSize);
        gridGraphics.endFill();
      }
    }
  };
  drawGrid();
  stage.addChildAt(gridGraphics, 0); // Add grid at the bottom layer

  // Add invisible background to catch clicks and panning on empty space.
  // Large enough to cover the full panning range.
  const background = new Graphics();
  background.beginFill(0x000000, 0.001); // Nearly invisible but interactive
  background.drawRect(-3000, -3000, 8000, 8000);
  background.endFill();
  background.eventMode = 'static';
  background.on('pointerdown', () => {
    // Clear all selection when clicking on empty canvas
    const hadSelection = selectedRelationshipId || selectedElementId;
    selectedRelationshipId = null;
    selectedElementId = null;
    if (hadSelection) {
      renderElements(
        lastModel,
        lastView,
        lastBoundaryElementIds,
        lastExternalElementIds,
        lastBoundaryLabel
      );
    }
    backgroundClickCallbacks.forEach((cb) => cb());
    // Start panning if not in a connection drag
    if (!isDraggingConnection) {
      isPanning = true;
      (app.view as HTMLCanvasElement).style.cursor = 'grabbing';
    }
  });
  stage.addChildAt(background, 0); // Add at very bottom, below grid

  const drillDownCallbacks: Array<(elementId: string) => void> = [];
  const clickCallbacks: Array<(elementId: string) => void> = [];
  const dragCallbacks: Array<(elementId: string, x: number, y: number) => void> = [];
  const connectionStartCallbacks: Array<(elementId: string) => void> = [];
  const connectionCompleteCallbacks: Array<(sourceId: string, targetId: string) => void> = [];
  const relationshipClickCallbacks: Array<(relationshipId: string) => void> = [];
  const backgroundClickCallbacks: Array<() => void> = [];
  let selectedRelationshipId: string | null = null;
  let selectedElementId: string | null = null;
  let connectionPreviewElementId: string | null = null;
  let isDraggingConnection = false;
  let isPanning = false;
  let dragConnectionSourceId: string | null = null;
  let previewMouseX = 0;
  let previewMouseY = 0;
  let hoveredElementId: string | null = null;
  let lastModel = model;
  let lastView = view;
  let lastBoundaryElementIds: string[] = [];
  let lastExternalElementIds: string[] = [];
  let lastBoundaryLabel: string | undefined;
  const elementGraphics = new Map<
    string,
    {
      box: Graphics;
      textContainer: Container;
      handles?: {
        top: Graphics;
        right: Graphics;
        bottom: Graphics;
        left: Graphics;
        topLeft: Graphics;
        topRight: Graphics;
        bottomLeft: Graphics;
        bottomRight: Graphics;
      };
      x: number;
      y: number;
      w: number;
      h: number;
    }
  >();
  const previewGraphics = new Graphics();
  previewGraphics.eventMode = 'none';
  const selectionGraphics = new Graphics();
  selectionGraphics.eventMode = 'none';
  let lastNodeMap = new Map<string, { x: number; y: number; w: number; h: number }>();

  function renderElements(
    currentModel: ArchitectureModel,
    currentView: View,
    boundaryIds: string[],
    externalIds: string[],
    boundaryLabel?: string
  ) {
    const externalSet = new Set(externalIds);

    // Clear existing graphics (but keep the grid)
    elementGraphics.forEach(({ box, textContainer }) => {
      stage.removeChild(box);
      stage.removeChild(textContainer);
    });
    elementGraphics.clear();

    // Remove all children except the grid (first child)
    while (stage.children.length > 1) {
      stage.removeChild(stage.children[1]!);
    }

    const elementMap = new Map<string, Element>(currentModel.elements.map((e) => [e.id, e]));
    const nodeMap = new Map<string, { x: number; y: number; w: number; h: number }>();

    currentView.layout.nodes.forEach((node) => {
      const element = elementMap.get(node.elementId);
      if (!element) return;
      nodeMap.set(node.elementId, {
        x: node.x,
        y: node.y,
        w: node.w ?? 120,
        h: node.h ?? 80,
      });
    });

    lastNodeMap = nodeMap;
    const relationshipsLayer = new Container();
    currentModel.relationships.forEach((rel) => {
      const sourceNode = nodeMap.get(rel.sourceId);
      const targetNode = nodeMap.get(rel.targetId);
      if (!sourceNode || !targetNode) return;

      const sourceCenterX = sourceNode.x + sourceNode.w / 2;
      const sourceCenterY = sourceNode.y + sourceNode.h / 2;
      const targetCenterX = targetNode.x + targetNode.w / 2;
      const targetCenterY = targetNode.y + targetNode.h / 2;

      const fromPoint = getRectEdgePoint(sourceNode, targetCenterX, targetCenterY);
      const toPoint = getRectEdgePoint(targetNode, sourceCenterX, sourceCenterY);

      const relationshipContainer = new Container();

      // Draw visible arrow
      const relationshipGraphics = new Graphics();
      const isSelected = rel.id === selectedRelationshipId;
      const lineColor = isSelected ? 0xe74c3c : 0x34495e;
      relationshipGraphics.lineStyle(isSelected ? 3 : 2, lineColor, 0.9);
      drawArrow(relationshipGraphics, fromPoint.x, fromPoint.y, toPoint.x, toPoint.y);

      // Draw connection dots on element borders
      relationshipGraphics.beginFill(lineColor, 1);
      relationshipGraphics.drawCircle(fromPoint.x, fromPoint.y, 3);
      relationshipGraphics.drawCircle(toPoint.x, toPoint.y, 3);
      relationshipGraphics.endFill();

      relationshipContainer.addChild(relationshipGraphics);

      // Add text label if relationship has action or integrationMode
      if (rel.action || rel.integrationMode) {
        const midX = (fromPoint.x + toPoint.x) / 2;
        const midY = (fromPoint.y + toPoint.y) / 2;

        const actionLine = rel.action ?? '';
        const modeLine = rel.integrationMode ? `[${rel.integrationMode}]` : '';
        const labelText = [actionLine, modeLine].filter(Boolean).join('\n');

        const arrowLabel = new Text(labelText, {
          fontSize: 10,
          fill: isSelected ? 0xe74c3c : 0x2c3e50,
          align: 'center',
          wordWrap: true,
          wordWrapWidth: 130,
        });
        arrowLabel.anchor.set(0.5, 0.5);
        arrowLabel.x = midX;
        arrowLabel.y = midY;

        // White background pill behind label for readability
        const bgPadX = 5;
        const bgPadY = 3;
        const labelBg = new Graphics();
        labelBg.beginFill(0xffffff, 0.9);
        labelBg.lineStyle(1, isSelected ? 0xe74c3c : 0xcccccc, 0.8);
        labelBg.drawRoundedRect(
          midX - arrowLabel.width / 2 - bgPadX,
          midY - arrowLabel.height / 2 - bgPadY,
          arrowLabel.width + bgPadX * 2,
          arrowLabel.height + bgPadY * 2,
          4
        );
        labelBg.endFill();

        relationshipContainer.addChild(labelBg);
        relationshipContainer.addChild(arrowLabel);
      }

      // Create a rectangular hit area around the line for better selectability
      const hitWidth = 20; // 20px clickable width on each side

      // Calculate bounding box around the line with padding
      const minX = Math.min(fromPoint.x, toPoint.x) - hitWidth;
      const minY = Math.min(fromPoint.y, toPoint.y) - hitWidth;
      const maxX = Math.max(fromPoint.x, toPoint.x) + hitWidth;
      const maxY = Math.max(fromPoint.y, toPoint.y) + hitWidth;

      // Draw invisible hit area for debugging/interaction
      const hitAreaGraphics = new Graphics();
      hitAreaGraphics.beginFill(0x000000, 0.001); // Nearly invisible
      hitAreaGraphics.drawRect(minX, minY, maxX - minX, maxY - minY);
      hitAreaGraphics.endFill();
      relationshipContainer.addChild(hitAreaGraphics);

      relationshipContainer.eventMode = 'static';
      relationshipContainer.cursor = 'pointer';
      relationshipContainer.on('pointerdown', (event: any) => {
        selectedRelationshipId = rel.id;
        selectedElementId = null;
        if (relationshipClickCallbacks.length > 0) {
          relationshipClickCallbacks.forEach((callback) => callback(rel.id));
        }
        renderElements(
          lastModel,
          lastView,
          lastBoundaryElementIds,
          lastExternalElementIds,
          lastBoundaryLabel
        );
        if (event?.stopPropagation) {
          event.stopPropagation();
        }
      });

      relationshipsLayer.addChild(relationshipContainer);
    });

    stage.addChildAt(relationshipsLayer, 1);

    // Draw boundary rectangle when there are both boundary and external elements
    if (boundaryIds.length > 0 && externalIds.length > 0) {
      const boundaryNodes = boundaryIds
        .map((id) => nodeMap.get(id))
        .filter((n): n is { x: number; y: number; w: number; h: number } => n !== undefined);

      if (boundaryNodes.length > 0) {
        const pad = 24;
        const minX = Math.min(...boundaryNodes.map((n) => n.x)) - pad;
        const minY = Math.min(...boundaryNodes.map((n) => n.y)) - pad;
        const maxX = Math.max(...boundaryNodes.map((n) => n.x + n.w)) + pad;
        const maxY = Math.max(...boundaryNodes.map((n) => n.y + n.h)) + pad;

        const boundaryGraphics = new Graphics();
        // Dashed border — draw as a series of short segments
        const dashLen = 10;
        const gapLen = 6;
        const bx = minX,
          by = minY,
          bw = maxX - minX,
          bh = maxY - minY;
        boundaryGraphics.lineStyle(2, 0x6b7280, 0.6);

        const drawDashedRect = (x: number, y: number, w: number, h: number) => {
          // Top edge
          for (let dx = 0; dx < w; dx += dashLen + gapLen) {
            boundaryGraphics.moveTo(x + dx, y);
            boundaryGraphics.lineTo(x + Math.min(dx + dashLen, w), y);
          }
          // Right edge
          for (let dy = 0; dy < h; dy += dashLen + gapLen) {
            boundaryGraphics.moveTo(x + w, y + dy);
            boundaryGraphics.lineTo(x + w, y + Math.min(dy + dashLen, h));
          }
          // Bottom edge
          for (let dx = 0; dx < w; dx += dashLen + gapLen) {
            boundaryGraphics.moveTo(x + w - dx, y + h);
            boundaryGraphics.lineTo(x + w - Math.min(dx + dashLen, w), y + h);
          }
          // Left edge
          for (let dy = 0; dy < h; dy += dashLen + gapLen) {
            boundaryGraphics.moveTo(x, y + h - dy);
            boundaryGraphics.lineTo(x, y + h - Math.min(dy + dashLen, h));
          }
        };

        drawDashedRect(bx, by, bw, bh);

        // Fill with very subtle tint
        boundaryGraphics.beginFill(0x1168bd, 0.04);
        boundaryGraphics.drawRect(bx, by, bw, bh);
        boundaryGraphics.endFill();

        // Label — dynamic (e.g. "System Boundary: My System")
        const boundaryLabelText = new Text(boundaryLabel ?? 'System Boundary', {
          fontSize: 11,
          fill: 0x6b7280,
          fontStyle: 'italic',
        });
        boundaryLabelText.x = bx + 6;
        boundaryLabelText.y = by + 4;
        stage.addChild(boundaryGraphics);
        stage.addChild(boundaryLabelText);
      }
    }

    currentView.layout.nodes.forEach((node) => {
      const element = elementMap.get(node.elementId);
      if (!element) return;

      const width = node.w ?? 200;
      const height = node.h ?? 130;
      const isScopeExternal = externalSet.has(node.elementId); // out-of-scope neighboring element
      const isOrgExternal = element.isExternal === true; // external organization boundary

      // Resolve colors: org-external > scope-external > formatting overrides > C4 default
      let c4 = isScopeExternal
        ? { bg: 0xffffff, text: 0x888888, border: 0x999999 }
        : (C4_COLORS[element.kind] ?? { bg: 0xffffff, text: 0x555555, border: 0x888888 });

      if (isOrgExternal) {
        c4 = EXTERNAL_ORG_COLOR;
      } else if (!isScopeExternal && element.formatting) {
        // Apply per-element color overrides (not for scope-external or org-external elements)
        const parseHex = (hex: string | undefined): number | undefined =>
          hex ? parseInt(hex.slice(1), 16) : undefined;
        const bgOverride = parseHex(element.formatting.backgroundColor);
        const borderOverride = parseHex(element.formatting.borderColor);
        const textOverride = parseHex(element.formatting.fontColor);
        c4 = {
          bg: bgOverride ?? c4.bg,
          border: borderOverride ?? c4.border,
          text: textOverride ?? c4.text,
        };
      }

      // Draw element box using C4 model-inspired colors
      const box = new Graphics();
      box.beginFill(c4.bg, 1);
      box.lineStyle(isScopeExternal || isOrgExternal ? 1.5 : 2.5, c4.border, 1);

      // Translate to node position, draw the appropriate shape, then translate back
      if (element.kind === 'container' && !isScopeExternal && !isOrgExternal) {
        switch (element.containerSubtype) {
          case 'database':
            drawDatabase(box, width, height, node.x, node.y);
            break;
          case 'storage-bucket':
            drawStorageBucket(box, width, height, node.x, node.y);
            break;
          case 'static-content':
            drawStaticContent(box, width, height, node.x, node.y);
            break;
          case 'user-interface':
            drawUserInterface(box, width, height, node.x, node.y);
            break;
          case 'backend-service':
            drawBackendService(box, width, height, node.x, node.y);
            break;
          default:
            box.drawRoundedRect(node.x, node.y, width, height, 8);
            break;
        }
      } else {
        box.drawRoundedRect(node.x, node.y, width, height, 8);
      }

      box.endFill();

      // Explicit hit area covering the full bounding box — required so compound shapes
      // (cylinder, trapezoid, folder, etc.) respond to pointer events across their entire area.
      box.hitArea = new Rectangle(node.x, node.y, width, height);

      // External elements are draggable but not clickable (no editor opens)
      box.eventMode = 'static';
      box.cursor = isScopeExternal || isOrgExternal ? 'grab' : 'pointer';

      let isDragging = false;
      let hasDragged = false;
      let dragStartX = 0;
      let dragStartY = 0;
      let isHoveringBox = false;
      const handleHoverStates = {
        top: false,
        right: false,
        bottom: false,
        left: false,
        topLeft: false,
        topRight: false,
        bottomLeft: false,
        bottomRight: false,
      };

      // Create 8 connection handles (cardinal + corners)
      const handles = {
        top: new Graphics(),
        right: new Graphics(),
        bottom: new Graphics(),
        left: new Graphics(),
        topLeft: new Graphics(),
        topRight: new Graphics(),
        bottomLeft: new Graphics(),
        bottomRight: new Graphics(),
      };

      const handlePositions = {
        top: { x: node.x + width / 2, y: node.y },
        right: { x: node.x + width, y: node.y + height / 2 },
        bottom: { x: node.x + width / 2, y: node.y + height },
        left: { x: node.x, y: node.y + height / 2 },
        topLeft: { x: node.x, y: node.y },
        topRight: { x: node.x + width, y: node.y },
        bottomLeft: { x: node.x, y: node.y + height },
        bottomRight: { x: node.x + width, y: node.y + height },
      };

      const drawHandle = (handle: Graphics, active: boolean) => {
        handle.clear();
        handle.beginFill(active ? 0x1abc9c : 0x2c3e50, 0.9);
        handle.drawCircle(0, 0, active ? 7 : 6);
        handle.endFill();
      };

      const updateAllHandlesVisibility = () => {
        const anyHandleHovered = Object.values(handleHoverStates).some((h) => h);
        const shouldShowHandles =
          isHoveringBox || anyHandleHovered || connectionPreviewElementId === node.elementId;

        Object.entries(handles).forEach(([direction, handle]) => {
          handle.visible = shouldShowHandles;
          drawHandle(
            handle,
            handleHoverStates[direction as keyof typeof handleHoverStates] ||
              connectionPreviewElementId === node.elementId
          );
        });
      };

      // Setup each handle
      Object.entries(handles).forEach(([direction, handle]) => {
        const dir = direction as keyof typeof handles;
        const pos = handlePositions[dir];

        handle.x = pos.x;
        handle.y = pos.y;
        handle.visible = false;
        handle.eventMode = 'static';
        handle.cursor = 'crosshair';
        drawHandle(handle, false);

        handle.on('pointerover', () => {
          handleHoverStates[dir] = true;
          updateAllHandlesVisibility();
        });

        handle.on('pointerout', () => {
          handleHoverStates[dir] = false;
          updateAllHandlesVisibility();
        });

        // Drag-to-connect: Start dragging on pointerdown
        handle.on('pointerdown', (event: any) => {
          isDraggingConnection = true;
          dragConnectionSourceId = node.elementId;
          connectionPreviewElementId = node.elementId;

          const position = event.data.global;
          previewMouseX = position.x;
          previewMouseY = position.y;
          renderConnectionPreview();

          // Notify page that connection has started
          if (connectionStartCallbacks.length > 0) {
            connectionStartCallbacks.forEach((callback) => callback(node.elementId));
          }

          if (event?.stopPropagation) {
            event.stopPropagation();
          }
        });
      });

      // Track hover state for drag-to-connect target detection
      box.on('pointerover', () => {
        isHoveringBox = true;
        hoveredElementId = node.elementId;
        updateAllHandlesVisibility();
      });

      box.on('pointerout', () => {
        isHoveringBox = false;
        if (hoveredElementId === node.elementId) {
          hoveredElementId = null;
        }
        updateAllHandlesVisibility();
      });

      box.on('pointerdown', (event: any) => {
        isDragging = true;
        hasDragged = false;
        const position = event.data.global;
        const stageX = (position.x - stage.x) / stage.scale.x;
        const stageY = (position.y - stage.y) / stage.scale.y;
        dragStartX = stageX - node.x;
        dragStartY = stageY - node.y;
        // Immediately show selection highlight without a full re-render
        selectedRelationshipId = null;
        if (!isScopeExternal) {
          selectedElementId = node.elementId;
          renderSelection();
        }
      });

      box.on('pointerup', () => {
        if (isDragging && hasDragged) {
          const graphics = elementGraphics.get(node.elementId);
          if (graphics && dragCallbacks.length > 0) {
            dragCallbacks.forEach((callback) => callback(node.elementId, graphics.x, graphics.y));
          }
        }
        isDragging = false;
        hasDragged = false;
      });

      box.on('pointerupoutside', () => {
        isDragging = false;
        hasDragged = false;
      });

      // Handle single-click and double-click with proper flicker prevention.
      // External elements skip click-to-edit.
      let singleClickTimeout: NodeJS.Timeout | null = null;
      let doubleClickWindow: NodeJS.Timeout | null = null;
      let clickCount = 0;

      box.on('click', () => {
        if (isScopeExternal) {
          // Scope-external elements: double-click navigates into that system
          if (!hasDragged) {
            clickCount++;
            if (clickCount === 1) {
              doubleClickWindow = setTimeout(() => {
                clickCount = 0;
              }, 400);
            } else if (clickCount === 2) {
              if (doubleClickWindow) {
                clearTimeout(doubleClickWindow);
                doubleClickWindow = null;
              }
              clickCount = 0;
              drillDownCallbacks.forEach((cb) => cb(node.elementId));
            }
          } else {
            clickCount = 0;
          }
          return;
        }
        if (!hasDragged) {
          clickCount++;

          if (clickCount === 1) {
            singleClickTimeout = setTimeout(() => {
              if (clickCallbacks.length > 0) {
                clickCallbacks.forEach((callback) => callback(node.elementId));
              }
            }, 250);

            doubleClickWindow = setTimeout(() => {
              clickCount = 0;
            }, 400);
          } else if (clickCount === 2) {
            if (singleClickTimeout) {
              clearTimeout(singleClickTimeout);
              singleClickTimeout = null;
            }
            if (doubleClickWindow) {
              clearTimeout(doubleClickWindow);
              doubleClickWindow = null;
            }
            clickCount = 0;

            // Person elements have no children to drill into
            if (element.kind !== 'person' && drillDownCallbacks.length > 0) {
              selectedElementId = null;
              drillDownCallbacks.forEach((callback) => callback(node.elementId));
            }
          }
        } else {
          clickCount = 0;
          if (singleClickTimeout) {
            clearTimeout(singleClickTimeout);
            singleClickTimeout = null;
          }
          if (doubleClickWindow) {
            clearTimeout(doubleClickWindow);
            doubleClickWindow = null;
          }
        }
      });

      box.on('pointermove', (event: any) => {
        if (isDragging) {
          hasDragged = true;
          const position = event.data.global;
          const stageX = (position.x - stage.x) / stage.scale.x;
          const stageY = (position.y - stage.y) / stage.scale.y;
          const newX = stageX - dragStartX;
          const newY = stageY - dragStartY;

          // Update visual position only (don't update model yet)
          box.x = newX - node.x;
          box.y = newY - node.y;

          const graphics = elementGraphics.get(node.elementId);
          if (graphics) {
            graphics.x = newX;
            graphics.y = newY;
            graphics.textContainer.x = newX;
            graphics.textContainer.y = newY;
            if (graphics.handles) {
              graphics.handles.top.x = newX + width / 2;
              graphics.handles.top.y = newY;
              graphics.handles.right.x = newX + width;
              graphics.handles.right.y = newY + height / 2;
              graphics.handles.bottom.x = newX + width / 2;
              graphics.handles.bottom.y = newY + height;
              graphics.handles.left.x = newX;
              graphics.handles.left.y = newY + height / 2;
              graphics.handles.topLeft.x = newX;
              graphics.handles.topLeft.y = newY;
              graphics.handles.topRight.x = newX + width;
              graphics.handles.topRight.y = newY;
              graphics.handles.bottomLeft.x = newX;
              graphics.handles.bottomLeft.y = newY + height;
              graphics.handles.bottomRight.x = newX + width;
              graphics.handles.bottomRight.y = newY + height;
            }
          }
        }
      });

      // Build C4-style text container with name, type tag, and description
      const textContainer = new Container();
      textContainer.x = node.x;
      textContainer.y = node.y;

      const textColor = c4.text;
      const innerW = width - 20; // 10px padding each side
      const isPerson = element.kind === 'person';

      // For person elements: draw head + torso icon at top of the box
      if (isPerson) {
        const iconGraphics = new Graphics();
        drawPersonIcon(iconGraphics, width / 2, 22, textColor);
        textContainer.addChild(iconGraphics);
      }

      // Vertical offset: push text below the person icon if needed
      // Icon cy=22, headRadius=11, bodyY=37, bodyH=18 → icon bottom ≈ 55px → start text at 62
      const textTopY = isPerson ? 62 : 10;
      // Center X inside the box (anchor will be 0.5 so position at mid-width)
      const midX = width / 2;

      // Type tag (e.g., "[Software System]", "[External System]", "[Container: Spring Boot]")
      const typeTagStr = isOrgExternal
        ? '[External System]'
        : isScopeExternal
          ? `[External ${element.kind}]`
          : getTypeTag(element);
      const tagText = new Text(typeTagStr, {
        fontSize: 10,
        fill: textColor,
        fontStyle: 'italic',
        align: 'center',
        wordWrap: true,
        wordWrapWidth: innerW,
      });
      tagText.anchor.set(0.5, 0); // center horizontally
      tagText.alpha = 0.85;
      tagText.x = midX;
      tagText.y = textTopY;

      // Name — bold, larger, centered
      const nameText = new Text(element.name, {
        fontSize: 13,
        fill: textColor,
        fontWeight: 'bold',
        align: 'center',
        wordWrap: true,
        wordWrapWidth: innerW,
      });
      nameText.anchor.set(0.5, 0);
      nameText.x = midX;
      nameText.y = tagText.y + tagText.height + 4;

      textContainer.addChild(tagText);
      textContainer.addChild(nameText);

      // Description (optional, truncated to fit, centered)
      if (element.description) {
        const maxDescLen = 80;
        const descStr =
          element.description.length > maxDescLen
            ? element.description.substring(0, maxDescLen) + '…'
            : element.description;
        const descText = new Text(descStr, {
          fontSize: 10,
          fill: textColor,
          align: 'center',
          wordWrap: true,
          wordWrapWidth: innerW,
        });
        descText.anchor.set(0.5, 0);
        descText.alpha = 0.8;
        descText.x = midX;
        descText.y = nameText.y + nameText.height + 4;
        textContainer.addChild(descText);
      }

      // Clip text to box bounds
      const clipMask = new Graphics();
      clipMask.beginFill(0xffffff, 1);
      clipMask.drawRoundedRect(node.x + 2, node.y + 2, width - 4, height - 4, 4);
      clipMask.endFill();
      textContainer.mask = clipMask;
      stage.addChild(clipMask);

      if (!isScopeExternal && !isOrgExternal) {
        updateAllHandlesVisibility();
      }
      stage.addChild(box);
      stage.addChild(textContainer);
      // Add handles only for non-external elements
      if (!isScopeExternal && !isOrgExternal) {
        Object.values(handles).forEach((h) => stage.addChild(h));
      }

      elementGraphics.set(node.elementId, {
        box,
        textContainer,
        handles,
        x: node.x,
        y: node.y,
        w: width,
        h: height,
      });
    });

    stage.addChild(previewGraphics);
    stage.addChild(selectionGraphics);
    renderConnectionPreview();
    renderSelection();
  }

  function renderConnectionPreview() {
    previewGraphics.clear();
    if (!connectionPreviewElementId) {
      return;
    }
    const startNode = lastNodeMap.get(connectionPreviewElementId);
    if (!startNode) {
      return;
    }

    // Convert canvas mouse coords to stage-local coords for accurate drawing
    const stageMouseX = previewMouseX - stage.x;
    const stageMouseY = previewMouseY - stage.y;

    const fromPoint = getRectEdgePoint(startNode, stageMouseX, stageMouseY);

    // Highlight target element if hovering over one during drag
    if (isDraggingConnection && hoveredElementId) {
      const targetGraphics = elementGraphics.get(hoveredElementId);
      if (targetGraphics) {
        previewGraphics.lineStyle(3, 0x1abc9c, 0.3);
        previewGraphics.drawRoundedRect(
          targetGraphics.x - 4,
          targetGraphics.y - 4,
          targetGraphics.w + 8,
          targetGraphics.h + 8,
          10
        );
      }
    }

    // Draw preview arrow
    const lineColor = hoveredElementId ? 0x1abc9c : 0x95a5a6;
    previewGraphics.lineStyle(2, lineColor, 0.8);
    drawArrow(previewGraphics, fromPoint.x, fromPoint.y, stageMouseX, stageMouseY);
    previewGraphics.beginFill(lineColor, 1);
    previewGraphics.drawCircle(fromPoint.x, fromPoint.y, 3);
    previewGraphics.endFill();
  }

  function renderSelection() {
    selectionGraphics.clear();
    if (!selectedElementId) return;
    const g = elementGraphics.get(selectedElementId);
    if (!g) return;
    selectionGraphics.lineStyle(3, 0x74b9ff, 1);
    selectionGraphics.beginFill(0, 0); // transparent fill needed to close the path
    selectionGraphics.drawRoundedRect(g.x - 4, g.y - 4, g.w + 8, g.h + 8, 10);
    selectionGraphics.endFill();
  }

  renderElements(model, view, lastBoundaryElementIds, lastExternalElementIds, lastBoundaryLabel);

  // Initialize drag callbacks from options
  if (options.onElementDrag) {
    dragCallbacks.push(options.onElementDrag);
  }

  return {
    destroy: () => {
      (app.view as HTMLCanvasElement).removeEventListener('pointermove', handlePointerMove);
      (app.view as HTMLCanvasElement).removeEventListener('pointerup', handlePointerUp);
      app.destroy(true, { children: true, texture: true });
    },
    setZoom: (zoom: number) => {
      stage.scale.set(zoom);
    },
    pan: (dx: number, dy: number) => {
      stage.x += dx;
      stage.y += dy;
    },
    onDrillDown: (callback: (elementId: string) => void) => {
      drillDownCallbacks.push(callback);
    },
    onClick: (callback: (elementId: string) => void) => {
      clickCallbacks.push(callback);
    },
    onDrag: (callback: (elementId: string, x: number, y: number) => void) => {
      dragCallbacks.push(callback);
    },
    onConnectionStart: (callback: (elementId: string) => void) => {
      connectionStartCallbacks.push(callback);
    },
    onConnectionComplete: (callback: (sourceId: string, targetId: string) => void) => {
      connectionCompleteCallbacks.push(callback);
    },
    onRelationshipClick: (callback: (relationshipId: string) => void) => {
      relationshipClickCallbacks.push(callback);
    },
    onBackgroundClick: (callback: () => void) => {
      backgroundClickCallbacks.push(callback);
    },
    setConnectionPreview: (elementId: string | null) => {
      connectionPreviewElementId = elementId;
      renderConnectionPreview();
    },
    clearRelationshipSelection: () => {
      selectedRelationshipId = null;
      renderElements(
        lastModel,
        lastView,
        lastBoundaryElementIds,
        lastExternalElementIds,
        lastBoundaryLabel
      );
    },
    updateLayout: (
      newModel: ArchitectureModel,
      newView: View,
      meta?: {
        boundaryElementIds?: string[];
        externalElementIds?: string[];
        boundaryLabel?: string;
      }
    ) => {
      lastModel = newModel;
      lastView = newView;
      lastBoundaryElementIds = meta?.boundaryElementIds ?? [];
      lastExternalElementIds = meta?.externalElementIds ?? [];
      lastBoundaryLabel = meta?.boundaryLabel;
      // Clear selection if the selected relationship no longer exists
      if (
        selectedRelationshipId &&
        !newModel.relationships.some((r) => r.id === selectedRelationshipId)
      ) {
        selectedRelationshipId = null;
      }
      renderElements(
        newModel,
        newView,
        lastBoundaryElementIds,
        lastExternalElementIds,
        lastBoundaryLabel
      );
    },
  };
}
