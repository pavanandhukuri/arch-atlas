import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ArchitectureModel } from '@archatlas/core-model';

const push = vi.fn();
let searchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => searchParams,
}));

import { useDiagramNavigation } from '../../src/hooks/useDiagramNavigation';

function modelWithHierarchy(): ArchitectureModel {
  return {
    schemaVersion: '0.1.0',
    metadata: { title: 'My Diagram', createdAt: '', updatedAt: '' },
    elements: [
      { id: 'land-1', name: 'Landscape', kind: 'landscape', description: '' },
      { id: 'sys-1', name: 'Checkout', kind: 'system', description: '', parentId: 'land-1' },
    ],
    relationships: [],
    constraints: [],
    views: [],
  };
}

describe('useDiagramNavigation', () => {
  beforeEach(() => {
    push.mockClear();
    searchParams = new URLSearchParams();
    document.title = '';
  });

  it('defaults to the landscape level with nothing focused when the URL has no params', () => {
    const { result } = renderHook(() => useDiagramNavigation(null));
    expect(result.current.currentLevel).toBe('landscape');
    expect(result.current.focusedElementId).toBeNull();
    expect(result.current.diagramTitle).toBe('Architecture Landscape');
  });

  it('initializes level/focus from the URL query params', () => {
    searchParams = new URLSearchParams({ level: 'system', focus: 'sys-1' });
    const { result } = renderHook(() => useDiagramNavigation(modelWithHierarchy()));
    expect(result.current.currentLevel).toBe('system');
    expect(result.current.focusedElementId).toBe('sys-1');
    expect(result.current.focusedElement?.name).toBe('Checkout');
    expect(result.current.diagramTitle).toBe('System Context — Checkout');
  });

  it('navigateToLevel updates state and pushes the new URL', () => {
    const { result } = renderHook(() => useDiagramNavigation(modelWithHierarchy()));

    act(() => result.current.navigateToLevel('system', 'sys-1'));

    expect(result.current.currentLevel).toBe('system');
    expect(result.current.focusedElementId).toBe('sys-1');
    expect(push).toHaveBeenCalledWith('?level=system&focus=sys-1', { scroll: false });
  });

  it('navigateToLevel omits the focus param when none is given', () => {
    const { result } = renderHook(() => useDiagramNavigation(modelWithHierarchy()));
    act(() => result.current.navigateToLevel('landscape'));
    expect(push).toHaveBeenCalledWith('?level=landscape', { scroll: false });
  });

  it('sets document.title from the diagram title and model name', () => {
    renderHook(() => useDiagramNavigation(modelWithHierarchy()));
    expect(document.title).toBe('Architecture Landscape · My Diagram');
  });

  it('builds breadcrumbs from the model hierarchy', () => {
    searchParams = new URLSearchParams({ level: 'system', focus: 'sys-1' });
    const { result } = renderHook(() => useDiagramNavigation(modelWithHierarchy()));
    expect(result.current.breadcrumbs).toEqual([
      { label: 'System Landscape', level: 'landscape', focusId: null },
      { label: 'Checkout', level: 'system', focusId: 'sys-1' },
    ]);
  });
});
