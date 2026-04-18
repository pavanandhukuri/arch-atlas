'use client';

import type { ElementKind } from '@arch-atlas/core-model';
import type { ContainerSubtype } from '@arch-atlas/core-model';
import type { DiagramLevel } from '@/services/diagram-context';
import { getElementKindForLevel, getLevelIcon } from '@/services/diagram-context';

interface ElementPaletteProps {
  currentLevel: DiagramLevel;
  onAddElement: (kind: ElementKind) => void;
  onAddContainerSubtype?: (subtype: ContainerSubtype) => void;
}

const elementMeta: Record<ElementKind, { label: string; description: string }> = {
  landscape: { label: 'Add Landscape', description: 'Top-level view of all systems and actors' },
  system: { label: 'Add System', description: 'A software system within the architecture' },
  person: {
    label: 'Add User',
    description: 'An external user or actor that interacts with the system',
  },
  container: {
    label: 'Add Container',
    description: 'An application, service, database or file system',
  },
  component: { label: 'Add Component', description: 'A grouping of related code or functionality' },
  code: {
    label: 'Add Code Element',
    description: 'A class, function or module within a component',
  },
};

const CONTAINER_SUBTYPES: {
  subtype: ContainerSubtype;
  label: string;
  description: string;
  icon: string;
}[] = [
  {
    subtype: 'database',
    label: 'Database',
    description: 'A relational or NoSQL persistent data store',
    icon: '🗄',
  },
  {
    subtype: 'storage-bucket',
    label: 'Storage Bucket',
    description: 'Cloud object or blob storage (S3, GCS, etc.)',
    icon: '🪣',
  },
  {
    subtype: 'static-content',
    label: 'Static Content',
    description: 'Website, CDN-served files or static assets',
    icon: '📁',
  },
  {
    subtype: 'user-interface',
    label: 'User Interface',
    description: 'A frontend app — web, mobile or desktop',
    icon: '🖥',
  },
  {
    subtype: 'backend-service',
    label: 'Backend Service',
    description: 'A service, microservice or API backend',
    icon: '⚙',
  },
];

interface TooltipBtnProps {
  className?: string;
  onClick: () => void;
  children: React.ReactNode;
  label: string;
  description: string;
}

function TooltipBtn({ className, onClick, children, label, description }: TooltipBtnProps) {
  return (
    <div className="palette-tooltip-wrapper">
      <button
        className={`palette-icon-btn${className ? ` ${className}` : ''}`}
        onClick={onClick}
        aria-label={label}
      >
        {children}
      </button>
      <div className="palette-tooltip" role="tooltip">
        <span className="palette-tooltip-title">{label}</span>
        <span className="palette-tooltip-desc">{description}</span>
      </div>
    </div>
  );
}

export function ElementPalette({
  currentLevel,
  onAddElement,
  onAddContainerSubtype,
}: ElementPaletteProps) {
  const elementKind = getElementKindForLevel(currentLevel);
  const levelIcon = getLevelIcon(currentLevel);
  const showUserButton =
    currentLevel === 'landscape' || currentLevel === 'system' || currentLevel === 'container';
  const meta = elementMeta[elementKind];

  return (
    <div className="element-palette">
      <div className="palette-level-indicator">{levelIcon}</div>

      <div className="palette-divider" />

      <TooltipBtn
        className="palette-icon-btn--add"
        onClick={() => onAddElement(elementKind)}
        label={meta.label}
        description={meta.description}
      >
        +
      </TooltipBtn>

      {showUserButton && (
        <TooltipBtn
          onClick={() => onAddElement('person')}
          label={elementMeta.person.label}
          description={elementMeta.person.description}
        >
          👤
        </TooltipBtn>
      )}

      {currentLevel === 'system' && onAddContainerSubtype && (
        <>
          <div className="palette-divider" />
          {CONTAINER_SUBTYPES.map(({ subtype, label, description, icon }) => (
            <TooltipBtn
              key={subtype}
              onClick={() => onAddContainerSubtype(subtype)}
              label={label}
              description={description}
            >
              {icon}
            </TooltipBtn>
          ))}
        </>
      )}
    </div>
  );
}
