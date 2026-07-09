import type { ReactNode } from 'react';
import EmptyState from './EmptyState';

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  /** Cell renderer. Receives the row + its index. */
  render: (row: T, index: number) => ReactNode;
  /** Optional flex-basis width (e.g. '160px', '20%'). */
  width?: string | number;
  /** Optional right-aligned column. */
  align?: 'right' | 'center';
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  onRowClick?: (row: T) => void;
  /** Style tweak: compact mode reduces vertical padding. */
  compact?: boolean;
}

/**
 * Generic table built on the existing `.table` class.
 * Renders a header row + N body rows; falls back to EmptyState when no rows.
 */
export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  emptyTitle = '暂无数据',
  emptyDescription,
  onRowClick,
  compact = false,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
        加载中...
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="card">
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }

  const cellPad = compact ? { padding: '8px 12px' } : undefined;

  return (
    <table className="table">
      <thead>
        <tr>
          {columns.map((c) => (
            <th
              key={c.key}
              style={{
                width: c.width,
                textAlign: c.align ?? 'left',
                ...cellPad,
              }}
            >
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            style={{
              cursor: onRowClick ? 'pointer' : 'default',
            }}
          >
            {columns.map((c) => (
              <td
                key={c.key}
                style={{
                  textAlign: c.align ?? 'left',
                  ...cellPad,
                }}
              >
                {c.render(row, i)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
