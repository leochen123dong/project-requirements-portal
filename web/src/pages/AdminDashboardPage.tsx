// Phase 0 stub — Phase 2a will replace with 4 KPI tiles + activity stream.
export default function AdminDashboardPage() {
  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1 className="page-title">管理仪表盘</h1>
          <p className="page-subtitle">全局 KPI 与活动流</p>
        </div>
      </div>
      <div className="grid-cards">
        <div className="stat-tile">
          <p className="stat-tile-label">进行中项目</p>
          <p className="stat-tile-value">—</p>
        </div>
        <div className="stat-tile">
          <p className="stat-tile-label">超期任务</p>
          <p className="stat-tile-value">—</p>
        </div>
        <div className="stat-tile">
          <p className="stat-tile-label">本周即将到期</p>
          <p className="stat-tile-value">—</p>
        </div>
        <div className="stat-tile">
          <p className="stat-tile-label">人均负载</p>
          <p className="stat-tile-value">—</p>
        </div>
      </div>
      <p style={{ marginTop: 24, color: 'var(--text-muted)', fontSize: 13 }}>
        Phase 2a 将接入 <code>v_dashboard_stats</code> 视图。
      </p>
    </div>
  );
}