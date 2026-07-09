import type { ReactNode } from 'react';
import { useEffect } from 'react';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  /** Optional max-width override (default 480px from global.css). */
  width?: number | string;
  /** Disable ESC + overlay click to close (for blocking dialogs). */
  dismissable?: boolean;
}

/**
 * Reusable modal dialog using `.modal-overlay` / `.modal` from global.css.
 * Handles ESC to close and overlay click when `dismissable` (default true).
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  actions,
  width,
  dismissable = true,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, dismissable]);

  if (!open) return null;

  const styleWidth =
    width !== undefined
      ? { width: typeof width === 'number' ? `${width}px` : width, maxWidth: '95vw' }
      : undefined;

  return (
    <div
      className="modal-overlay"
      onClick={() => {
        if (dismissable) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="modal"
        style={styleWidth}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title">{title}</h2>
        {children && <div className="modal-body">{children}</div>}
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </div>
  );
}
