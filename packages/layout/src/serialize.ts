// Layout serialization utilities

import type { LayoutState } from '@arch-atlas/core-model';

export function serializeLayoutState(layout: LayoutState): string {
  return JSON.stringify(layout, null, 2);
}

export function deserializeLayoutState(json: string): LayoutState {
  return JSON.parse(json) as LayoutState;
}

export function cloneLayoutState(layout: LayoutState): LayoutState {
  return JSON.parse(JSON.stringify(layout)) as LayoutState;
}
