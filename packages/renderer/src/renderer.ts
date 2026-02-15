// Enhanced renderer with relationships (arrows)

import type { ArchitectureModel, View, Element } from '@arch-atlas/core-model';
import { Application, Graphics, Text, Container } from 'pixi.js';

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
  setConnectionPreview: (elementId: string | null) => void;
  clearRelationshipSelection: () => void;
  updateLayout: (model: ArchitectureModel, view: View) => void;
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

export function createRenderer(
  container: HTMLElement,
  model: ArchitectureModel,
  view: View,
  options: RendererOptions = {}
): Renderer {
  // Initialize PixiJS v7 application
  const app = new Application({
    width: container.offsetWidth || 800,
    height: container.offsetHeight || 600,
    backgroundAlpha: 0, // Make canvas transparent to show CSS grid
    antialias: options.antialias ?? true,
  });
  
  container.appendChild(app.view as HTMLCanvasElement);

  const stage = new Container();
  app.stage.addChild(stage);

  const handlePointerMove = (event: Event) => {
    const pointerEvent = event as PointerEvent;
    const canvas = app.view as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    previewMouseX = pointerEvent.clientX - rect.left;
    previewMouseY = pointerEvent.clientY - rect.top;

    // Manual hit testing during connection drag
    if (isDraggingConnection) {
      hoveredElementId = null;
      // Check if mouse is over any element
      for (const [elementId, graphics] of elementGraphics.entries()) {
        if (elementId === dragConnectionSourceId) continue; // Skip source element

        const { x, y, w, h } = graphics;
        if (
          previewMouseX >= x &&
          previewMouseX <= x + w &&
          previewMouseY >= y &&
          previewMouseY <= y + h
        ) {
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
          connectionCompleteCallbacks.forEach(cb =>
            cb(dragConnectionSourceId!, hoveredElementId!)
          );
        }
      }
    }

    // Reset drag state
    isDraggingConnection = false;
    dragConnectionSourceId = null;
    connectionPreviewElementId = null;
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

  // Add invisible background to catch clicks on empty space
  const background = new Graphics();
  background.beginFill(0x000000, 0.001); // Nearly invisible but interactive
  background.drawRect(0, 0, app.screen.width, app.screen.height);
  background.endFill();
  background.eventMode = 'static';
  background.on('pointerdown', () => {
    // Clear relationship selection when clicking on empty canvas
    if (selectedRelationshipId) {
      selectedRelationshipId = null;
      renderElements(lastModel, lastView);
    }
  });
  stage.addChildAt(background, 0); // Add at very bottom, below grid

  const drillDownCallbacks: Array<(elementId: string) => void> = [];
  const clickCallbacks: Array<(elementId: string) => void> = [];
  const dragCallbacks: Array<(elementId: string, x: number, y: number) => void> = [];
  const connectionStartCallbacks: Array<(elementId: string) => void> = [];
  const connectionCompleteCallbacks: Array<(sourceId: string, targetId: string) => void> = [];
  const relationshipClickCallbacks: Array<(relationshipId: string) => void> = [];
  let selectedRelationshipId: string | null = null;
  let connectionPreviewElementId: string | null = null;
  let isDraggingConnection = false;
  let dragConnectionSourceId: string | null = null;
  let previewMouseX = 0;
  let previewMouseY = 0;
  let hoveredElementId: string | null = null;
  let lastModel = model;
  let lastView = view;
  const elementGraphics = new Map<
    string,
    {
      box: Graphics;
      label: Text;
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
  let lastNodeMap = new Map<string, { x: number; y: number; w: number; h: number }>();

  function renderElements(currentModel: ArchitectureModel, currentView: View) {
    // Clear existing graphics (but keep the grid)
    elementGraphics.forEach(({ box, label }) => {
      stage.removeChild(box);
      stage.removeChild(label);
    });
    elementGraphics.clear();
    
    // Remove all children except the grid (first child)
    while (stage.children.length > 1) {
      stage.removeChild(stage.children[1]!);
    }

    const elementMap = new Map<string, Element>(currentModel.elements.map(e => [e.id, e]));
    const nodeMap = new Map<string, { x: number; y: number; w: number; h: number }>();

    currentView.layout.nodes.forEach(node => {
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
    currentModel.relationships.forEach(rel => {
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
        if (relationshipClickCallbacks.length > 0) {
          relationshipClickCallbacks.forEach(callback => callback(rel.id));
        }
        renderElements(lastModel, lastView);
        if (event?.stopPropagation) {
          event.stopPropagation();
        }
      });

      relationshipsLayer.addChild(relationshipContainer);
    });

    stage.addChildAt(relationshipsLayer, 1);

    currentView.layout.nodes.forEach(node => {
      const element = elementMap.get(node.elementId);
      if (!element) return;

      const width = node.w ?? 120;
      const height = node.h ?? 80;

      // Draw element box (PixiJS v7 API)
      const box = new Graphics();
      const colors: Record<string, number> = {
        landscape: 0x3498db, // Blue
        system: 0x2ecc71,    // Green
        container: 0xf39c12, // Orange
        component: 0xe74c3c, // Red
        code: 0x9b59b6,      // Purple
      };
      const fillColor = colors[element.kind] || 0xe0e0e0;

      box.beginFill(fillColor, 0.8);
      box.lineStyle(2, 0x2c3e50);
      box.drawRoundedRect(node.x, node.y, width, height, 8);
      box.endFill();

      // Make interactive
      box.eventMode = 'static';
      box.cursor = 'pointer';

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
        const anyHandleHovered = Object.values(handleHoverStates).some(h => h);
        const shouldShowHandles = isHoveringBox || anyHandleHovered || connectionPreviewElementId === node.elementId;

        Object.entries(handles).forEach(([direction, handle]) => {
          handle.visible = shouldShowHandles;
          drawHandle(handle, handleHoverStates[direction as keyof typeof handleHoverStates] || connectionPreviewElementId === node.elementId);
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
            connectionStartCallbacks.forEach(callback => callback(node.elementId));
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
        dragStartX = position.x - node.x;
        dragStartY = position.y - node.y;
        // Clear relationship selection (will re-render when click callback fires)
        selectedRelationshipId = null;
      });

      box.on('pointerup', () => {
        if (isDragging && hasDragged) {
          const graphics = elementGraphics.get(node.elementId);
          if (graphics && dragCallbacks.length > 0) {
            dragCallbacks.forEach(callback => callback(node.elementId, graphics.x, graphics.y));
          }
        }
        isDragging = false;
        hasDragged = false;
      });

      box.on('pointerupoutside', () => {
        isDragging = false;
        hasDragged = false;
      });

      // Handle single-click and double-click with proper flicker prevention
      let singleClickTimeout: NodeJS.Timeout | null = null;
      let doubleClickWindow: NodeJS.Timeout | null = null;
      let clickCount = 0;

      box.on('click', () => {
        if (!hasDragged) {
          clickCount++;

          if (clickCount === 1) {
            singleClickTimeout = setTimeout(() => {
              if (clickCallbacks.length > 0) {
                clickCallbacks.forEach(callback => callback(node.elementId));
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

            if (drillDownCallbacks.length > 0) {
              drillDownCallbacks.forEach(callback => callback(node.elementId));
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
          const newX = position.x - dragStartX;
          const newY = position.y - dragStartY;

          // Update visual position only (don't update model yet)
          box.x = newX - node.x;
          box.y = newY - node.y;

          const graphics = elementGraphics.get(node.elementId);
          if (graphics) {
            graphics.x = newX;
            graphics.y = newY;
            graphics.label.x = newX + 10;
            graphics.label.y = newY + 10;
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

      // Add element label (PixiJS v7 API)
      const label = new Text(element.name, {
        fontSize: 12,
        fill: 0xffffff,
        fontWeight: 'bold',
      });
      label.x = node.x + 10;
      label.y = node.y + 10;

      updateAllHandlesVisibility();
      stage.addChild(box);
      stage.addChild(label);
      // Add all handles to stage
      Object.values(handles).forEach(h => stage.addChild(h));

      elementGraphics.set(node.elementId, {
        box,
        label,
        handles,
        x: node.x,
        y: node.y,
        w: width,
        h: height,
      });
    });

    stage.addChild(previewGraphics);
    renderConnectionPreview();
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

    const fromPoint = getRectEdgePoint(startNode, previewMouseX, previewMouseY);

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
    drawArrow(previewGraphics, fromPoint.x, fromPoint.y, previewMouseX, previewMouseY);
    previewGraphics.beginFill(lineColor, 1);
    previewGraphics.drawCircle(fromPoint.x, fromPoint.y, 3);
    previewGraphics.endFill();
  }

  renderElements(model, view);

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
    setConnectionPreview: (elementId: string | null) => {
      connectionPreviewElementId = elementId;
      renderConnectionPreview();
    },
    clearRelationshipSelection: () => {
      selectedRelationshipId = null;
      renderElements(lastModel, lastView);
    },
    updateLayout: (newModel: ArchitectureModel, newView: View) => {
      lastModel = newModel;
      lastView = newView;
      // Clear selection if the selected relationship no longer exists
      if (selectedRelationshipId && !newModel.relationships.some(r => r.id === selectedRelationshipId)) {
        selectedRelationshipId = null;
      }
      renderElements(newModel, newView);
    },
  };
}
