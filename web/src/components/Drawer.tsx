import type { ReactNode } from 'react';
import { useUIStore } from '../store/uiStore';

export interface DrawerProps {
  /** Open state — when true, drawer slides in. */
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  /** Width override (default 560px from global.css). */
  width?: number | string;
}

/**
 * Right-side drawer for detail editing. Uses `.drawer-overlay` and `.drawer`
 * classes from global.css. Optionally wires into the global uiStore for
 * programmatic open from anywhere via `openDrawer(node)`.
 */
export default function Drawer({
  open,
  onClose,
  title,
  children,
  actions,
  width,
}: DrawerProps) {
  const globalOpen = useUIStore((s) => s.drawerOpen);
  const globalClose = useUIStore((s) => s.closeDrawer);

  const isOpen = open || globalOpen;
  const handleClose = onClose || globalClose;

  if (!isOpen) return null;

  const styleWidth =
    width !== undefined
      ? { width: typeof width === 'number' ? `${width}px` : width, maxWidth: '100vw' }
      : undefined;

  return (
    <>
      <div
        className="drawer-overlay"
        onClick={handleClose}
        role="presentation"
      />
      <aside className="drawer" style={styleWidth} role="dialog" aria-modal="true">
        <header className="drawer-header">
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{title}</h2>
          <button className="btn btn-sm btn-ghost" onClick={handleClose} aria-label="关闭">
            ✕
          </button>
        </header>
        <div className="drawer-body">{children}</div>
        {actions && (
          <div
            className="drawer-body"
            style={{
              borderTop: '1px solid var(--border)',
              paddingTop: 16,
              display: 'flex',
              gap: 8,
              justifyContent: 'flex-end',
            }}
          >
            {actions}
          </div>
        )}
      </aside>
    </>
  );
}
