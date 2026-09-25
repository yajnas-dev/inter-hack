import { useEffect, useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog } from './Dialog';
import { Icon, type IconName } from './Icon';

export interface Command {
  id: string;
  label: string;
  icon: IconName;
  hint: string;
  run: () => void;
}

/**
 * The header's Ctrl/Cmd+K palette: type to search jobs, or jump to a page. Arrow keys move, Enter runs,
 * Escape closes. It is a combobox over a listbox, so screen readers hear the highlighted option.
 */
export function CommandPalette({
  open,
  onClose,
  pages,
  searches = []
}: {
  open: boolean;
  onClose: () => void;
  pages: Array<{ to: string; label: string }>;
  /** Saved and recent job searches, offered as one-key shortcuts. */
  searches?: Array<{ to: string; label: string; kind: 'Saved' | 'Recent' }>;
}) {
  const navigate = useNavigate();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const q = query.trim();
    const go = (to: string) => () => {
      onClose();
      navigate(to);
    };
    const list: Command[] = [];
    if (q)
      list.push({
        id: 'search',
        label: `Search jobs for "${q}"`,
        icon: 'search',
        hint: 'Jobs',
        run: go(`/jobs?title=${encodeURIComponent(q)}`)
      });
    const lower = q.toLowerCase();
    for (const p of pages) {
      if (!lower || p.label.toLowerCase().includes(lower))
        list.push({ id: p.to, label: p.label, icon: 'right', hint: 'Go to', run: go(p.to) });
    }
    for (const s of searches) {
      if (!lower || s.label.toLowerCase().includes(lower))
        list.push({ id: `search:${s.to}`, label: s.label, icon: 'search', hint: s.kind, run: go(s.to) });
    }
    if (!lower || 'all jobs'.includes(lower))
      list.push({ id: 'all', label: 'Browse all jobs', icon: 'briefcase', hint: 'Jobs', run: go('/jobs') });
    return list;
  }, [query, pages, searches, navigate, onClose]);

  const current = commands[Math.min(active, commands.length - 1)];

  return (
    <Dialog open={open} onClose={onClose} title="Search jobs or jump to a page" bare>
      <div className="palette">
        <div className="palette-input">
          <Icon name="search" />
          <input
            // biome-ignore lint/a11y/noAutofocus: the palette exists to be typed into
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={current ? `${listId}-${current.id}` : undefined}
            aria-label="Search jobs or jump to a page"
            placeholder="Search jobs, or jump to a page"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => (a + 1) % Math.max(1, commands.length));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => (a - 1 + commands.length) % Math.max(1, commands.length));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                current?.run();
              }
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div id={listId} role="listbox" aria-label="Results" className="palette-list">
          {commands.map((c, i) => (
            // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard access is the combobox input above
            // biome-ignore lint/a11y/useFocusableInteractive: options are reached with aria-activedescendant from the input
            <div
              key={c.id}
              id={`${listId}-${c.id}`}
              role="option"
              aria-selected={i === active}
              className="palette-item"
              onMouseMove={() => setActive(i)}
              onClick={c.run}
            >
              <Icon name={c.icon} />
              <span className="grow truncate">{c.label}</span>
              <span className="palette-hint">{c.hint}</span>
            </div>
          ))}
          {commands.length === 0 && <div className="palette-empty">Nothing matches.</div>}
        </div>
      </div>
    </Dialog>
  );
}
