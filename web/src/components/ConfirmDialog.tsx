import Modal from './Modal';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Pre-built confirmation modal. Use for handover, delete, etc.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  tone = 'primary',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmClass = tone === 'danger' ? 'btn btn-danger' : 'btn btn-primary';
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      dismissable={!loading}
      actions={
        <>
          <button className="btn btn-secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </button>
          <button className={confirmClass} onClick={onConfirm} disabled={loading}>
            {loading ? '处理中...' : confirmLabel}
          </button>
        </>
      }
    >
      {message}
    </Modal>
  );
}
