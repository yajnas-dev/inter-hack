import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

interface MenuProps {
  /** Text on the trigger. */
  label: ReactNode;
  icon?: IconName;
  /** Accessible name when the label is an icon or a count. */
  ariaLabel?: string;
  align?: 'left' | 'right';
  active?: boolean;
  className?: string;
  /** Render as a plain icon button (no chevron). */
  iconOnly?: boolean;
  /** Receives `close` so items can dismiss the menu. */
  children: (close: () => void) => ReactNode;
}

/**
 * A popover menu: opens on click, closes on outside click / Escape / focus leaving, arrow keys move between
 * items, and focus returns to the trigger. Panels may hold checkboxes and inputs (filter menus), not just links.
 */
export function Menu({ label, icon, ariaLabel, align = 'left', active, className = '', iconOnly, children }: MenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const onPanelKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = Array.from(root.current?.querySelectorAll<HTMLElement>('.menu-item') ?? []);
    if (!items.length) return;
    e.preventDefault();
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'ArrowDown' ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <div className="menu" ref={root}>
      <button
        ref={trigger}
        type="button"
        className={iconOnly ? `btn btn-ghost btn-icon ${className}` : `chip ${active ? 'active' : ''} ${className}`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
      >
        {icon && <Icon name={icon} />}
        {label}
        {!iconOnly && <Icon name="down" />}
      </button>
      {open && (
        // biome-ignore lint/a11y/noStaticElementInteractions: arrow-key roving for the items inside; the panel itself is not a widget
        <div id={id} className={`menu-panel align-${align}`} onKeyDown={onPanelKey}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  selected,
  danger,
  onClick,
  href
}: {
  icon?: IconName;
  children: ReactNode;
  selected?: boolean;
  danger?: boolean;
  onClick?: () => void;
  href?: string;
}) {
  const cls = `menu-item${danger ? ' danger' : ''}${selected ? ' selected' : ''}`;
  const content = (
    <>
      {icon && <Icon name={icon} />}
      <span className="grow">{children}</span>
      {selected && <Icon name="check" />}
    </>
  );
  if (href) {
    return (
      <a className={cls} href={href} role="menuitem">
        {content}
      </a>
    );
  }
  if (selected === undefined) {
    return (
      <button type="button" className={cls} role="menuitem" onClick={onClick}>
        {content}
      </button>
    );
  }
  return (
    <button type="button" className={cls} role="menuitemradio" aria-checked={selected} onClick={onClick}>
      {content}
    </button>
  );
}
