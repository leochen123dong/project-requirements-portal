import type { ReactNode } from 'react';
import EmptyState from './EmptyState';

export interface ChartCardProps {
  title: string;
  subtitle?: string;
  height?: number;
  loading?: boolean;
  empty?: boolean;
  emptyText?: string;
  children: ReactNode;
}

/**
 * Generic container for chart visualizations.
 * Renders a `.card` with title + subtitle + fixed-height content area.
 * Shows "加载中..." placeholder while loading; EmptyState when empty.
 *
 * Phase C: used by AdminDashboardPage (2 charts), ProjectsPage (1),
 * OpportunitiesPage (1), TicketsPage (1).
 */
export default function ChartCard({
  title,
  subtitle,
  height = 280,
  loading = false,
  empty = false,
  emptyText,
  children,
}: ChartCardProps) {
  return (
    <div className="card">
      <h3 className="card-title">{title}</h3>
      {subtitle && (
        <p style={{ margin: '-12px 0 12px', fontSize: 13, color: 'var(--text-muted)' }}>
          {subtitle}
        </p>
      )}
      <div style={{ width: '100%', height }}>
        {loading ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100%',
              color: 'var(--text-muted)',
              fontSize: 14,
            }}
          >
            加载中...
          </div>
        ) : empty ? (
          <EmptyState title={emptyText ?? '暂无数据'} />
        ) : (
          children
        )}
      </div>
    </div>
  );
}