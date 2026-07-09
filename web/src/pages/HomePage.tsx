import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AuditLog, Opportunity, Project, Task, ITHubTicket } from '../types/contracts';
import { supabase } from '../api/supabase';
import { useAuthStore } from '../store/authStore';
import { useRole } from '../hooks/useRole';
import { useToast } from '../hooks/useToast';
import { asTypedClient } from '../hooks/useSupabaseClient';
import { ROLE_LABEL } from '../components/RoleChip';
import EmptyState from '../components/EmptyState';
import KpiTile from '../components/KpiTile';

interface Tile {
  to: string;
  icon: string;
  title: string;
  desc: string;
  count?: number;
}

const STAGE_LABELS: Record<Opportunity['stage'], string> = {
  lead: '线索',
  qualified: '已验证',
  proposal: '方案中',
  negotiation: '谈判中',
  won: '已成交',
  lost: '已丢单',
};

const PROJECT_STATUS_LABELS: Record<Project['status'], string> = {
  initiated: '已立项',
  in_progress: '交付中',
  accepted: '已验收',
  closed: '已关闭',
};

/**
 * Role-aware landing page. Renders a grid of `.tile`s personalized for each
 * role. Falls back to a friendly "Supabase 未配置" hint when the env is
 * not set up.
 */
export default function HomePage() {
  const navigate = useNavigate();
  const role = useRole();
  const displayName = useAuthStore((s) => s.profile?.display_name);
  const toast = useToast();
  const client = asTypedClient(supabase);

  const [loading, setLoading] = useState(true);
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tickets, setTickets] = useState<ITHubTicket[]>([]);
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const userId = useAuthStore((s) => s.profile?.id ?? null);

  useEffect(() => {
    if (!client) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const tasks: Promise<void>[] = [];

    // presales: my opportunities (any) + lead/qualified count
    if (role === 'presales' || role === 'admin') {
      tasks.push(
        Promise.resolve(
          client
            .from('opportunities')
            .select('*')
            .order('updated_at', { ascending: false })
            .limit(50),
        ).then(({ data }) => {
          if (!cancelled) setOpps((data ?? []) as unknown as Opportunity[]);
        }),
      );
    }
    if (role === 'pm' || role === 'admin') {
      tasks.push(
        Promise.resolve(
          client
            .from('projects')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50),
        ).then(({ data }) => {
          if (!cancelled) setProjects((data ?? []) as unknown as Project[]);
        }),
      );
    }
    if (role === 'delivery' && userId) {
      tasks.push(
        Promise.resolve(
          client
            .from('tasks')
            .select('*')
            .eq('assignee_id', userId)
            .eq('done', false)
            .limit(50),
        ).then(({ data }) => {
          if (!cancelled) setTasks((data ?? []) as unknown as Task[]);
        }),
      );
    }
    if (role === 'delivery' || role === 'pm' || role === 'admin') {
      tasks.push(
        Promise.resolve(
          client
            .from('projects')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50),
        ).then(({ data }) => {
          if (!cancelled) setProjects((data ?? []) as unknown as Project[]);
        }),
      );
    }
    if (role === 'postsales' || role === 'admin') {
      tasks.push(
        Promise.resolve(
          client
            .from('ithub_tickets')
            .select('*')
            .neq('status', 'closed')
            .order('sla_breach_at', { ascending: true })
            .limit(50),
        ).then(({ data }) => {
          if (!cancelled) setTickets((data ?? []) as unknown as ITHubTicket[]);
        }),
      );
    }
    if (role === 'admin') {
      tasks.push(
        Promise.resolve(
          client
            .from('audit_log')
            .select('*')
            .order('at', { ascending: false })
            .limit(10),
        ).then(({ data }) => {
          if (!cancelled) setAudit((data ?? []) as unknown as AuditLog[]);
        }),
      );
    }

    Promise.allSettled(tasks)
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : '加载首页失败');
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, userId]);

  const myOpps = opps; // presales sees all of theirs
  const inFlight = projects.filter((p) => p.status === 'in_progress' || p.status === 'initiated');
  const openTickets = tickets.filter((t) => t.status !== 'closed' && t.status !== 'resolved');
  const slaSoon = openTickets.filter((t) => {
    if (!t.sla_breach_at) return false;
    const ms = Date.parse(t.sla_breach_at) - Date.now();
    return ms < 24 * 3600 * 1000;
  });
  const openTasks = tasks.filter((t) => !t.done);
  const upcomingMilestones: { id: string; name: string; due: string }[] = []; // computed upstream

  const tiles: Tile[] = [];
  if (role === 'presales' || role === 'admin') {
    tiles.push({
      to: '/opportunities',
      icon: '💡',
      title: '我的商机',
      desc: `${myOpps.length} 个`,
      count: myOpps.length,
    });
    tiles.push({
      to: '/opportunities',
      icon: '🚀',
      title: '立项中',
      desc: `${myOpps.filter((o) => o.stage === 'negotiation' || o.stage === 'won').length} 个`,
    });
  }
  if (role === 'pm' || role === 'admin') {
    tiles.push({
      to: '/projects',
      icon: '📁',
      title: '进行中项目',
      desc: `${inFlight.length} 个`,
    });
    tiles.push({
      to: '/projects',
      icon: '🎯',
      title: '待派任务',
      desc: '查看项目任务',
    });
    tiles.push({
      to: '/projects',
      icon: '⏰',
      title: '即将到期里程碑',
      desc: upcomingMilestones.length
        ? `${upcomingMilestones.length} 个`
        : '去项目页查看',
    });
  }
  if (role === 'delivery') {
    tiles.push({
      to: '/projects',
      icon: '📋',
      title: '我的任务',
      desc: `${openTasks.length} 个待办`,
      count: openTasks.length,
    });
    tiles.push({
      to: '/projects',
      icon: '⏳',
      title: '即将到期',
      desc: '查看任务列表',
    });
  }
  if (role === 'postsales' || role === 'admin') {
    tiles.push({
      to: '/tickets',
      icon: '🛠️',
      title: '待处理工单',
      desc: `${openTickets.length} 个`,
      count: openTickets.length,
    });
    tiles.push({
      to: '/tickets',
      icon: '⏰',
      title: 'SLA 即将超时',
      desc: `${slaSoon.length} 个`,
      count: slaSoon.length,
    });
  }

  if (!client) {
    return (
      <div className="container">
        <div className="page-header">
          <div>
            <h1 className="page-title">首页</h1>
            <p className="page-subtitle">欢迎{displayName ? `,${displayName}` : ''}</p>
          </div>
        </div>
        <div className="card">
          <EmptyState
            title="需要先连接 Supabase"
            description="设置 VITE_SUPABASE_URL 与 VITE_SUPABASE_ANON_KEY 后重启,即可登录并访问完整数据。"
            action={
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/login')}>
                去登录
              </button>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1 className="page-title">首页</h1>
          <p className="page-subtitle">
            欢迎{displayName ? `,${displayName}` : ''} · 当前角色 {ROLE_LABEL[role]}
          </p>
        </div>
      </div>

      <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>快速入口</h2>
      <div className="grid-cards" style={{ marginBottom: 24 }}>
        {tiles.map((t) => (
          <a
            key={`${t.to}-${t.title}`}
            className="tile"
            href={`#${t.to}`}
            onClick={(e) => {
              e.preventDefault();
              navigate(t.to);
            }}
          >
            <span className="tile-icon" aria-hidden>
              {t.icon}
            </span>
            <h3 className="tile-title">{t.title}</h3>
            <p className="tile-desc">{t.desc}</p>
          </a>
        ))}
        {tiles.length === 0 && (
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <EmptyState title="该角色暂未配置快捷入口" description={`角色 ${role} 暂无专属入口`} />
          </div>
        )}
      </div>

      {role === 'pm' || role === 'admin' ? (
        <>
          <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>进行中项目</h2>
          <div className="grid-cards" style={{ marginBottom: 24 }}>
            {loading ? (
              <KpiTile label="加载中" value="—" />
            ) : (
              <>
                <KpiTile label="进行中项目" value={inFlight.length} />
                <KpiTile label="已立项项目" value={projects.length} tone="default" />
                <KpiTile
                  label="即将到期里程碑"
                  value={upcomingMilestones.length}
                  tone="warning"
                  hint="7 天内"
                />
              </>
            )}
          </div>
          <div className="card" style={{ marginBottom: 24 }}>
            {loading ? (
              <p style={{ color: 'var(--text-muted)' }}>加载中...</p>
            ) : projects.length === 0 ? (
              <EmptyState title="暂无项目" description="尚无任何项目记录" />
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {projects.slice(0, 5).map((p) => (
                  <li
                    key={p.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 0',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <span style={{ fontWeight: 600, cursor: 'pointer' }} onClick={() => navigate(`/projects/${p.id}`)}>
                      {p.name}
                    </span>
                    <span className="tag tag-info">
                      {PROJECT_STATUS_LABELS[p.status] ?? p.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}

      {role === 'presales' || role === 'admin' ? (
        <>
          <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>我的商机</h2>
          <div className="card">
            {loading ? (
              <p style={{ color: 'var(--text-muted)' }}>加载中...</p>
            ) : opps.length === 0 ? (
              <EmptyState
                title="尚无商机"
                description="到商机页录入第一条吧"
                action={
                  <button className="btn btn-primary btn-sm" onClick={() => navigate('/opportunities')}>
                    前往商机页
                  </button>
                }
              />
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {opps.slice(0, 5).map((o) => (
                  <li
                    key={o.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 0',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <span style={{ cursor: 'pointer' }} onClick={() => navigate(`/opportunities/${o.id}`)}>
                      {o.name} · <small style={{ color: 'var(--text-muted)' }}>{o.customer}</small>
                    </span>
                    <span className="tag tag-info">{STAGE_LABELS[o.stage] ?? o.stage}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}

      {role === 'admin' && (
        <>
          <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>最近活动</h2>
          <div className="card">
            {audit.length === 0 ? (
              <EmptyState title="暂无活动" />
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {audit.map((a) => (
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
        </>
      )}
    </div>
  );
}
