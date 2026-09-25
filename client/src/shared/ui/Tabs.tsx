import { useId, type ReactNode } from 'react';

interface Tab<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/** Accessible tab strip (roving arrow keys). Content is rendered by the caller for the active value. */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label
}: {
  tabs: Tab<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const id = useId();
  const move = (e: React.KeyboardEvent, index: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next = (index + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
    const target = tabs[next];
    if (target) {
      onChange(target.value);
      document.getElementById(`${id}-${target.value}`)?.focus();
    }
  };
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button
          key={t.value}
          id={`${id}-${t.value}`}
          type="button"
          role="tab"
          className="tab"
          aria-selected={t.value === value}
          tabIndex={t.value === value ? 0 : -1}
          onClick={() => onChange(t.value)}
          onKeyDown={(e) => move(e, i)}
        >
          {t.label}
          {t.count !== undefined && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export const TabPanel = ({ children }: { children: ReactNode }) => <div role="tabpanel">{children}</div>;
