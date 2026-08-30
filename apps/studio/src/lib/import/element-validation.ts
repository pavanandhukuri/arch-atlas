import type { ElementConfig } from './types';

/**
 * Whether an element's classification is complete enough to leave Tag & Classify.
 * Every container must belong to a system; every system must be explicitly
 * marked external (there's no such thing as an internal "system" in this
 * model — internal services are containers). People are exempt.
 */
export function isElementClassified(element: ElementConfig): boolean {
  switch (element.kind) {
    case 'container':
      return element.systemId !== undefined;
    case 'system':
      return element.isExternal;
    case 'person':
      return true;
  }
}
