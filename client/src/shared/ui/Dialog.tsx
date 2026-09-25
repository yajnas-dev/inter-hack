import { useEffect, useRef, type ReactNode } from 'react';
import { Button, IconButton } from './Button';

interface BaseProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Built on the native <dialog>: focus is trapped, Escape closes, the page behind becomes inert, and
 * focus returns to the trigger. Clicking the backdrop closes it.
 */
function useModal(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleClose = () => onClose();
    el.addEventListener('close', handleClose);
    return () => el.removeEventListener('close', handleClose);
  }, [onClose]);
  const onBackdrop = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === ref.current) onClose();
  };
  return { ref, onBackdrop };
}

export function Dialog({ open, onClose, title, children, footer, wide, bare }: BaseProps & { wide?: boolean; bare?: boolean }) {
  const { ref, onBackdrop } = useModal(open, onClose);
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click is a mouse shortcut; Escape closes natively
    <dialog ref={ref} className={`dialog${wide ? ' wide' : ''}${bare ? ' bare' : ''}`} aria-label={title} onClick={onBackdrop}>
      {open && (
        <>
          {!bare && (
            <div className="dialog-head">
              <h2>{title}</h2>
              <IconButton icon="x" label="Close" onClick={onClose} size="sm" />
            </div>
          )}
          <div className="dialog-body">{children}</div>
          {footer && <div className="dialog-foot">{footer}</div>}
        </>
      )}
    </dialog>
  );
}

/** A slide-over panel: from the right (default), left, or as a bottom sheet on small screens. */
export function Drawer({ open, onClose, title, children, footer, side = 'right' }: BaseProps & { side?: 'right' | 'left' | 'sheet' }) {
  const { ref, onBackdrop } = useModal(open, onClose);
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click is a mouse shortcut; Escape closes natively
    <dialog ref={ref} className={`drawer${side === 'right' ? '' : ` ${side}`}`} aria-label={title} onClick={onBackdrop}>
      {open && (
        <>
          <div className="dialog-head">
            <h2>{title}</h2>
            <IconButton icon="x" label="Close" onClick={onClose} size="sm" />
          </div>
          <div className="dialog-body">{children}</div>
          {footer && <div className="dialog-foot">{footer}</div>}
        </>
      )}
    </dialog>
  );
}

interface ConfirmProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Replaces window.confirm: accessible, themed, and it can show a busy state. */
export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger, loading, onConfirm, onCancel }: ConfirmProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{message}</p>
    </Dialog>
  );
}
