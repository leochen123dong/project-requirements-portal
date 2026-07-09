export interface KpiTileProps {
  label: string;
  value: string | number;
  tone?: 'default' | 'danger' | 'success' | 'warning';
  hint?: string;
}

/**
 * KPI tile for dashboards (AdminDashboard, HomePage).
 * Wraps the `.stat-tile` family from global.css.
 */
export default function KpiTile({ label, value, tone = 'default', hint }: KpiTileProps) {
  const valueClass =
    tone === 'default'
      ? 'stat-tile-value'
      : `stat-tile-value ${tone}`;
  return (
    <div className="stat-tile">
      <p className="stat-tile-label">{label}</p>
      <p className={valueClass}>{value}</p>
      {hint && (
        <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>{hint}</p>
      )}
    </div>
  );
}
