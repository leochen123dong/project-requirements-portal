import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../api/supabase';
import { asTypedClient } from '../hooks/useSupabaseClient';
import { useAuthStore } from '../store/authStore';
import { useToast } from '../hooks/useToast';
import { useRole } from '../hooks/useRole';
import type { Project, ProjectStatus } from '../types/contracts';
import DataTable, { type DataTableColumn } from '../components/DataTable';
import EmptyState from '../components/EmptyState';

const STATUSES: (ProjectStatus | 'all')[] = ['all', 'initiated', 'in_progress', 'accepted', 'closed'];
const STATUS_LABEL: Record<ProjectStatus, string> = {
  initiated: '已立项',
  in_progress: '交付中',
  accepted: '已验收',
  closed: '已关闭',
};

const STATUS_TAG: Record<ProjectStatus, string> = {
  initiated: 'tag-info',
  in_progress: 'tag-warning',
  accepted: 'tag-success',
  closed: 'tag-neutral',
};

/**
 * Projects list with status filter. Click row -> /projects/:id.
 * pm/admin see all; delivery/postsales see only theirs (RLS-enforced server-side,
 * here we just send no owner filter).
 */
export default function ProjectsPage() {
  const navigate = useNavigate();
  const role = useRole();
  const userId = useAuthStore((s) => s.profile?.id ?? null);
  const toast = useToast();
  const client = asTypedClient(supabase);

  const [all, setAll] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ProjectStatus | 'all'>('all');

  useEffect(() => {
    if (!client) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.resolve(client.from('projects').select('*').order('created_at', { ascending: false }))
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) throw error;
        setAll((data ?? []) as unknown as Project[]);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : '加载失败'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = filter === 'all' ? all : all.filter((p) => p.status === filter);

  const columns: DataTableColumn<Project>[] = [
    {
      key: 'name',
      header: '项目名称',
      render: (p) => <strong>{p.name}</strong>,
    },
    {
      key: 'status',
      header: '状态',
      render: (p) => (
        <span className={`tag ${STATUS_TAG[p.status]}`}>{STATUS_LABEL[p.status]}</span>
      ),
    },
    {
      key: 'ithub_ticket_id',
      header: 'ITHub 工单',
      render: (p) =>
        p.ithub_ticket_id ? (
          <span className="tag tag-info">{p.ithub_ticket_id}</span>
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>—</span>
        ),
    },
    {
      key: 'created',
      header: '立项时间',
      render: (p) => new Date(p.created_at).toLocaleDateString('zh-CN'),
    },
  ];

  if (!client) {
    return (
      <div className="container">
        <div className="page-header">
          <div>
            <h1 className="page-title">项目</h1>
            <p className="page-subtitle">立项后的项目管理</p>
          </div>
        </div>
        <div className="card">
          <EmptyState title="需要先连接 Supabase" />
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1 className="page-title">项目</h1>
          <p className="page-subtitle">
            当前角色 {role} · 共 {all.length} 个
          </p>
        </div>
      </div>

      <div
        className="row"
        style={{
          gap: 8,
          marginBottom: 16,
          borderBottom: '1px solid var(--border)',
          paddingBottom: 12,
        }}
      >
        {STATUSES.map((s) => {
          const c = s === 'all' ? all.length : all.filter((p) => p.status === s).length;
          const isActive = filter === s;
          return (
            <button
              key={s}
              className={`btn btn-sm ${isActive ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilter(s)}
            >
              {s === 'all' ? '全部' : STATUS_LABEL[s as ProjectStatus]} ({c})
            </button>
          );
        })}
      </div>

      <DataTable
        columns={columns}
        rows={visible}
        rowKey={(p) => p.id}
        loading={loading}
        emptyTitle="暂无项目"
        emptyDescription={
          role === 'pm' || role === 'admin'
            ? '尚无任何项目记录'
            : '你当前未参与任何项目,或当前角色不可见'
        }
        onRowClick={(p) => navigate(`/projects/${p.id}`)}
      />
      {userId ? null : null}
    </div>
  );
}
