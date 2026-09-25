import { Dialog } from './Dialog';

export interface Shortcut {
  keys: string[];
  label: string;
}

/** A cheat sheet of the keys a page understands; opened with "?". */
export function ShortcutsDialog({
  open,
  onClose,
  title = 'Keyboard shortcuts',
  shortcuts
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  shortcuts: Shortcut[];
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <dl className="shortcut-list">
        {shortcuts.map((s) => (
          <div key={s.label} className="shortcut-row">
            <dt>{s.label}</dt>
            <dd>
              {s.keys.map((k) => (
                <kbd key={k}>{k}</kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
