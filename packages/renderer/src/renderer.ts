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
    backgroundColor: options.background ?? 0xffffff,
    antialias: options.antialias ?? true,
  });
  
  container.appendChild(app.view as HTMLCanvasElement);

  const stage = new Container();
  app.stage.addChild(stage);

  const drillDownCallbacks: Array<(elementId: string) => void> = [];
  const clickCallbacks: Array<(elementId: string) => void> = [];
  const dragCallbacks: Array<(elementId: string, x: number, y: number) => void> = [];
  const elementGraphics = new Map<string, { box: Graphics; label: Text; x: number; y: number; w: number; h: number }>();

  function renderElements(currentModel: ArchitectureModel, currentView: View) {
    // Clear existing graphics
    elementGraphics.forEach(({ box, label }) => {
      stage.removeChild(box);
      stage.removeChild(label);
    });
    elementGraphics.clear();
    
    // Remove all children (includes arrows)
    while (stage.children.length > 0) {
      stage.removeChild(stage.children[0]!);
    }

    // Render elements first
    const elementMap = new Map<string, Element>(currentModel.elements.map(e => [e.id, e]));
    
    currentView.layout.nodes.forEach(node => {
      const element = elementMap.get(node.elementId);
      if (!element) return;

      // Draw element box (PixiJS v7 API)
      const box = new Graphics();
      const width = node.w ?? 120;
      const height = node.h ?? 80;
      
      // Color based on element kind (following C4 model colors)
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
      box.interactive = true;
      box.cursor = 'pointer';
      
      let isDragging = false;
      let hasDragged = false;
      let dragStartX = 0;
      let dragStartY = 0;

      box.on('mousedown', (event: any) => {
        console.log('[Renderer] mousedown on', node.elementId);
        isDragging = true;
        hasDragged = false;
        const position = event.data.global;
        dragStartX = position.x - node.x;
        dragStartY = position.y - node.y;
      });

      box.on('mouseup', () => {
        // If we were dragging, notify about the final position
        if (isDragging && hasDragged) {
          const graphics = elementGraphics.get(node.elementId);
          if (graphics && dragCallbacks.length > 0) {
            console.log('[Renderer] Drag ended, notifying final position:', graphics.x, graphics.y);
            dragCallbacks.forEach(callback => callback(node.elementId, graphics.x, graphics.y));
          }
        }
        isDragging = false;
        hasDragged = false;
      });

      box.on('mouseupoutside', () => {
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
            // First click - wait to see if there's a second click
            singleClickTimeout = setTimeout(() => {
              // No second click came, execute single-click
              if (clickCallbacks.length > 0) {
                clickCallbacks.forEach(callback => callback(node.elementId));
              }
            }, 250);
            
            // Set a window to detect double-click
            doubleClickWindow = setTimeout(() => {
              clickCount = 0;
            }, 400);
          } else if (clickCount === 2) {
            // Second click detected - cancel single-click and execute double-click
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
          // Was dragging, reset everything
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

      box.on('mousemove', (event: any) => {
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
          }

          // Note: Don't call drag callbacks during mousemove to avoid constant re-renders
          // Callbacks will be called on mouseup instead
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

      stage.addChild(box);
      stage.addChild(label);
      
      elementGraphics.set(node.elementId, { box, label, x: node.x, y: node.y, w: width, h: height });
    });

    // Render relationships (arrows) after elements
    const relationshipsGraphics = new Graphics();
    relationshipsGraphics.lineStyle(2, 0x34495e, 0.8);
    
    currentModel.relationships.forEach(rel => {
      const sourceGraphics = elementGraphics.get(rel.sourceId);
      const targetGraphics = elementGraphics.get(rel.targetId);
      
      if (sourceGraphics && targetGraphics) {
        // Calculate connection points (center of boxes)
        const fromX = sourceGraphics.x + sourceGraphics.w / 2;
        const fromY = sourceGraphics.y + sourceGraphics.h / 2;
        const toX = targetGraphics.x + targetGraphics.w / 2;
        const toY = targetGraphics.y + targetGraphics.h / 2;
        
        drawArrow(relationshipsGraphics, fromX, fromY, toX, toY);
      }
    });
    
    stage.addChildAt(relationshipsGraphics, 0); // Add arrows behind elements
  }

  renderElements(model, view);

  // Initialize drag callbacks from options
  if (options.onElementDrag) {
    console.log('[Renderer] Initializing drag callback from options');
    dragCallbacks.push(options.onElementDrag);
  } else {
    console.log('[Renderer] No onElementDrag in options');
  }

  return {
    destroy: () => {
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
      console.log('[Renderer] onDrag called, adding callback. Total callbacks:', dragCallbacks.length + 1);
      dragCallbacks.push(callback);
    },
    updateLayout: (newModel: ArchitectureModel, newView: View) => {
      renderElements(newModel, newView);
    },
  };
}
