import type { ReactNode } from 'react';

/**
 * Reusable empty-state placeholder. Renders the `.empty` block from global.css.
 * Use for tables / lists that have no rows yet.
 */
export interface EmptyStateProps {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
}

export default function EmptyState({
  title = '暂无数据',
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="empty">
      <div className="empty-title">{title}</div>
      {description && <p>{description}</p>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}
