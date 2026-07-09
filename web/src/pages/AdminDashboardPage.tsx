import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../api/supabase';
import { asTypedClient } from '../hooks/useSupabaseClient';
import { useToast } from '../hooks/useToast';
import { useAuthStore } from '../store/authStore';
import { canManageUsers, canViewAdminDashboard } from '../utils/rbac';
import type { AuditLog, ITHubSyncLog, Milestone, Project, Task } from '../types/contracts';
import KpiTile from '../components/KpiTile';
import EmptyState from '../components/EmptyState';

interface DashStats {
  inFlightProjects: number;
  overdueTasks: number;
  upcomingMilestones: number;
  avgLoad: number;
}

/**
 * Admin dashboard: 4 KPI tiles + last sync time + recent activity.
 * Visible to admin only — Layout's tab gate enforces this, but we also
 * `can()`-check here for direct URL access.
 */
export default function AdminDashboardPage() {
  const role = useAuthStore((s) => s.profile?.role ?? 'guest');
  const userId = useAuthStore((s) => s.profile?.id ?? null);
  const toast = useToast();
  const client = asTypedClient(supabase);

  const [stats, setStats] = useState<DashStats>({
    inFlightProjects: 0,
    overdueTasks: 0,
    upcomingMilestones: 0,
    avgLoad: 0,
  });
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<ITHubSyncLog | null>(null);
  const [activity, setActivity] = useState<AuditLog[]>([]);

  useEffect(() => {
    if (!client) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const today = new Date();
        const inAWeek = new Date(today.getTime() + 7 * 24 * 3600 * 1000);
        const isoToday = today.toISOString().slice(0, 10);
        const isoInAWeek = inAWeek.toISOString().slice(0, 10);

        const [projRes, overdueRes, upcomingRes, tasksRes, syncRes, auditRes] = await Promise.all([
          client.from('projects').select('*').eq('status', 'in_progress'),
          client.from('tasks').select('*').eq('done', false).lt('due_date', isoToday),
          client.from('milestones').select('*').gte('due_date', isoToday).lte('due_date', isoInAWeek),
          client.from('tasks').select('*'),
          client
            .from('ithub_sync_log')
            .select('*')
            .order('ran_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          client.from('audit_log').select('*').order('at', { ascending: false }).limit(10),
        ]);

        if (projRes.error) throw projRes.error;
        if (overdueRes.error) throw overdueRes.error;
        if (upcomingRes.error) throw upcomingRes.error;
        if (tasksRes.error) throw tasksRes.error;
        if (syncRes.error) throw syncRes.error;
        if (auditRes.error) throw auditRes.error;

        if (cancelled) return;

        const projs = (projRes.data ?? []) as unknown as Project[];
        const overdue = (overdueRes.data ?? []) as unknown as Task[];
        const upcoming = (upcomingRes.data ?? []) as unknown as Milestone[];
        const allTasks = (tasksRes.data ?? []) as unknown as Task[];

        // Average open tasks per assignee (assignee with at least 1 open task).
        const open = allTasks.filter((t) => !t.done);
        const assignees = new Set(open.map((t) => t.assignee_id));
        const avgLoad = assignees.size ? open.length / assignees.size : 0;

        setStats({
          inFlightProjects: projs.length,
          overdueTasks: overdue.length,
          upcomingMilestones: upcoming.length,
          avgLoad: Number(avgLoad.toFixed(1)),
        });

        setLastSync((syncRes.data ?? null) as unknown as ITHubSyncLog | null);
        setActivity((auditRes.data ?? []) as unknown as AuditLog[]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '加载仪表盘失败');
      } finally {
        !cancelled && setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!canViewAdminDashboard(role as 'admin')) {
    return (
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">管理仪表盘</h1>
        </div>
        <div className="card">
          <EmptyState
            title="无权限"
            description="仅管理员可访问此页。请联系系统管理员获取权限。"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1 className="page-title">管理仪表盘</h1>
          <p className="page-subtitle">
            全局 KPI 与活动流 · 角色 {role}
            {userId ? ` · UID ${userId.slice(0, 8)}…` : ''}
          </p>
        </div>
      </div>

      <div className="grid-cards" style={{ marginBottom: 24 }}>
        <KpiTile
          label="进行中项目"
          value={loading ? '...' : stats.inFlightProjects}
          hint="status = in_progress"
        />
        <KpiTile
          label="超期任务"
          value={loading ? '...' : stats.overdueTasks}
          tone={stats.overdueTasks > 0 ? 'danger' : 'default'}
          hint="done=false 且 due_date < 今天"
        />
        <KpiTile
          label="本周即将到期"
          value={loading ? '...' : stats.upcomingMilestones}
          tone={stats.upcomingMilestones > 0 ? 'warning' : 'default'}
          hint="里程碑 7 天内到期"
        />
        <KpiTile
          label="人均负载"
          value={loading ? '...' : stats.avgLoad}
          tone={stats.avgLoad > 5 ? 'warning' : 'default'}
          hint="open tasks / assignees"
        />
      </div>

      {canManageUsers(role as 'admin') && (
        <div className="grid-cards" style={{ marginBottom: 24 }}>
          <Link to="/admin/users" className="tile">
            <div className="tile-icon">👥</div>
            <h3 className="tile-title">用户管理</h3>
            <p className="tile-desc">邀请、修改角色、删除用户</p>
          </Link>
        </div>
      )}

      <div className="grid-cards" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 24 }}>
        <div className="card">
          <h3 className="card-title">ITHub 最近同步</h3>
          {lastSync ? (
            <div>
              <p style={{ fontSize: 28, fontWeight: 700, color: 'var(--brand-primary)', margin: '8px 0' }}>
                {new Date(lastSync.ran_at).toLocaleString('zh-CN')}
              </p>
              <p style={{ color: 'var(--text-muted)', margin: '4px 0', fontSize: 13 }}>
                拉取 {lastSync.tickets_pulled} 条
                {lastSync.errors && <span style={{ color: 'var(--danger)' }}> · {lastSync.errors.length} 错误</span>}
              </p>
            </div>
          ) : (
            <EmptyState title="暂无同步记录" description="触发 ITHub 同步后将在此显示" />
          )}
        </div>

        <div className="card">
          <h3 className="card-title">最近活动</h3>
          {activity.length === 0 ? (
            <EmptyState title="暂无活动" />
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {activity.map((a) => (
                <li
                  key={a.id}
                  style={{
                    padding: '8px 0',
                    borderBottom: '1px solid var(--border)',
                    fontSize: 13,
                    color: 'var(--text-muted)',
                  }}
                >
                  <strong style={{ color: 'var(--text)' }}>{a.action.toUpperCase()}</strong>{' '}
                  {a.entity}
                  {a.entity_id ? ` · ${a.entity_id.slice(0, 8)}…` : ''} ·{' '}
                  {new Date(a.at).toLocaleString('zh-CN')}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
