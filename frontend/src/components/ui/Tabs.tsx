import { useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { cx } from './cx';

export interface TabItem {
  id: string;
  label: ReactNode;
  content: ReactNode;
}

interface TabsProps {
  items: readonly TabItem[];
  label: string;
  defaultTab?: string;
  tone?: 'surface' | 'paper';
  className?: string;
}

// WAI-ARIA tabs pattern: roving tabindex, arrows/Home/End move and activate.
export function Tabs({ items, label, defaultTab, tone = 'surface', className }: TabsProps) {
  const baseId = useId();
  const [active, setActive] = useState(defaultTab ?? items[0]?.id);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  function focusTab(index: number) {
    const item = items[(index + items.length) % items.length];
    if (!item) return;
    setActive(item.id);
    tabRefs.current.get(item.id)?.focus();
  }

  function onKeyDown(event: KeyboardEvent, index: number) {
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: items.length - 1,
    };
    const target = moves[event.key];
    if (target === undefined) return;
    event.preventDefault();
    focusTab(target);
  }

  const paper = tone === 'paper';

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={label}
        className={cx('flex gap-8 border-b', paper ? 'border-paper-line' : 'border-line')}
      >
        {items.map((item, index) => {
          const selected = item.id === active;
          return (
            <button
              key={item.id}
              ref={(node) => {
                if (node) tabRefs.current.set(item.id, node);
                else tabRefs.current.delete(item.id);
              }}
              role="tab"
              type="button"
              id={`${baseId}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(item.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cx(
                '-mb-px border-b py-3 text-sm font-medium transition-colors duration-150',
                selected
                  ? paper
                    ? 'border-paper-ink text-paper-ink'
                    : 'border-text text-text'
                  : paper
                    ? 'border-transparent text-paper-muted hover:text-paper-ink'
                    : 'border-transparent text-muted hover:text-text',
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${baseId}-panel-${item.id}`}
          aria-labelledby={`${baseId}-tab-${item.id}`}
          hidden={item.id !== active}
          tabIndex={0}
          className="pt-6"
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
