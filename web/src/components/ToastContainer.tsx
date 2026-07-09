import { useUIStore } from '../store/uiStore';

/**
 * Renders the toast queue from the uiStore. Mount once in the layout root.
 * Uses `.toast-container`, `.toast`, and `.toast-{kind}` classes from global.css.
 */
export default function ToastContainer() {
  const toasts = useUIStore((s) => s.toasts);
  const dismiss = useUIStore((s) => s.dismissToast);
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} onClick={() => dismiss(t.id)} role="alert">
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
