import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../api/supabase';
import { asTypedClient } from '../hooks/useSupabaseClient';
import { useAuthStore } from '../store/authStore';
import { useToast } from '../hooks/useToast';
import { canEditProject } from '../utils/rbac';
import type { Artifact, Comment, CommentTargetType, Milestone, Project, Profile, Task } from '../types/contracts';
import EmptyState from '../components/EmptyState';
import MilestoneTimeline from '../components/MilestoneTimeline';
import TaskList from '../components/TaskList';
import CommentList from '../components/CommentList';
import CommentEditor from '../components/CommentEditor';
import ArtifactUploader from '../components/ArtifactUploader';
import RoleChip from '../components/RoleChip';

const PROJECT_STATUS_LABEL: Record<string, string> = {
  initiated: '已立项',
  in_progress: '交付中',
  accepted: '已验收',
  closed: '已关闭',
};

interface MilestoneWithTasks {
  milestone: Milestone;
  tasks: Task[];
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const profile = useAuthStore((s) => s.profile);
  const toast = useToast();
  const client = asTypedClient(supabase);

  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<Project | null>(null);
  const [pm, setPm] = useState<Profile | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [tasksByMilestone, setTasksByMilestone] = useState<Record<string, Task[]>>({});
  const [comments, setComments] = useState<Comment[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);

  const canEdit = canEditProject((profile?.role ?? 'guest') as 'presales' | 'pm' | 'delivery' | 'postsales' | 'admin');

  const loadAll = useCallback(async () => {
    if (!id || !client) return;
    setLoading(true);
    try {
      const [projRes, msRes, tasksRes, commentsRes, artsRes] = await Promise.all([
        client.from('projects').select('*').eq('id', id).maybeSingle(),
        client.from('milestones').select('*').eq('project_id', id).order('order', { ascending: true }),
        client.from('tasks').select('*'),
        client
          .from('comments')
          .select('*')
          .eq('target_type', 'project')
          .eq('target_id', id)
          .order('created_at', { ascending: true }),
        client.from('artifacts').select('*').eq('project_id', id),
      ]);

      if (projRes.error) throw projRes.error;
      if (msRes.error) throw msRes.error;
      if (commentsRes.error) throw commentsRes.error;
      if (artsRes.error) throw artsRes.error;

      const proj = (projRes.data ?? null) as unknown as Project | null;
      setProject(proj);

      const msList = (msRes.data ?? []) as unknown as Milestone[];
      setMilestones(msList);

      // Filter tasks to those on this project's milestones.
      const msIds = new Set(msList.map((m) => m.id));
      const allTasks = (tasksRes.data ?? []) as unknown as Task[];
      const projectTasks = allTasks.filter((t) => msIds.has(t.milestone_id));
      const grouped: Record<string, Task[]> = {};
      for (const t of projectTasks) {
        (grouped[t.milestone_id] ??= []).push(t);
      }
      setTasksByMilestone(grouped);

      setComments((commentsRes.data ?? []) as unknown as Comment[]);
      setArtifacts((artsRes.data ?? []) as unknown as Artifact[]);

      // Fetch PM profile.
      if (proj?.pm_id) {
        const { data: pmData } = await client
          .from('profiles')
          .select('*')
          .eq('id', proj.pm_id)
          .maybeSingle();
        setPm((pmData ?? null) as unknown as Profile | null);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载项目失败');
    } finally {
      setLoading(false);
    }
  }, [id, client, toast]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Realtime subscription for comments on this project.
  useEffect(() => {
    if (!client || !id) return;
    const c = client;
    const target: CommentTargetType = 'project';
    const channel = c
      .channel(`rt-comments-project-${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'comments',
          filter: `target_type=eq.${target},target_id=eq.${id}`,
        },
        () => {
          // Refetch comments on any change.
          c.from('comments')
            .select('*')
            .eq('target_type', target)
            .eq('target_id', id)
            .order('created_at', { ascending: true })
            .then(({ data }) => setComments((data ?? []) as unknown as Comment[]));
        },
      )
      .subscribe();
    return () => {
      void c.removeChannel(channel);
    };
  }, [client, id]);

  const groupedMilestones = useMemo<MilestoneWithTasks[]>(() => {
    return milestones.map((m) => ({ milestone: m, tasks: tasksByMilestone[m.id] ?? [] }));
  }, [milestones, tasksByMilestone]);

  const handleMilestoneStatusChange = async (m: Milestone, status: Milestone['status']) => {
    if (!client) return;
    if (!canEdit) {
      toast.error('当前角色无权限编辑里程碑');
      return;
    }
    try {
      const { error } = await client
        .from('milestones')
        .update({ status })
        .eq('id', m.id);
      if (error) throw error;
      toast.success(`里程碑「${m.name}」已更新为 ${status}`);
      void loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '更新里程碑失败');
    }
  };

  const refreshTasks = () => {
    void loadAll();
  };

  const refreshArtifacts = () => {
    void loadAll();
  };

  if (!client) {
    return (
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">项目详情</h1>
        </div>
        <div className="card">
          <EmptyState title="需要先连接 Supabase" />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container">
        <p style={{ color: 'var(--text-muted)' }}>加载中...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">项目详情</h1>
        </div>
        <div className="card">
          <EmptyState title="未找到项目" description="该 ID 不存在或不可见" />
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1 className="page-title">{project.name}</h1>
          <p className="page-subtitle" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={`tag ${project.status === 'in_progress' ? 'tag-warning' : project.status === 'accepted' ? 'tag-success' : 'tag-info'}`}>
              {PROJECT_STATUS_LABEL[project.status] ?? project.status}
            </span>
            {pm && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span
                  className="user-avatar"
                  style={{ width: 24, height: 24, fontSize: 11 }}
                >
                  {pm.display_name.slice(0, 1).toUpperCase()}
                </span>
                PM: {pm.display_name} <RoleChip role={pm.role} />
              </span>
            )}
          </p>
        </div>
        {canEdit && (
          <span className="tag tag-success">可编辑</span>
        )}
      </div>

      <div className="grid-cards" style={{ gridTemplateColumns: '2fr 1fr', marginBottom: 24 }}>
        <div className="card">
          <h3 className="card-title">里程碑</h3>
          {groupedMilestones.length === 0 ? (
            <EmptyState title="尚未设置里程碑" />
          ) : (
            <>
              <MilestoneTimeline
                milestones={milestones}
                onEdit={(m) => {
                  const order: Milestone['status'][] = ['pending', 'in_progress', 'done', 'blocked'];
                  const next = order[(order.indexOf(m.status) + 1) % order.length];
                  void handleMilestoneStatusChange(m, next);
                }}
              />
              <div style={{ marginTop: 16 }}>
                {groupedMilestones.map(({ milestone, tasks }) => (
                  <div
                    key={milestone.id}
                    style={{
                      borderTop: '1px solid var(--border)',
                      paddingTop: 12,
                      marginTop: 12,
                    }}
                  >
                    <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>{milestone.name} · 任务</h4>
                    <TaskList milestoneId={milestone.id} tasks={tasks} onChange={refreshTasks} />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="col">
          <div className="card">
            <h3 className="card-title">交付物</h3>
            <ArtifactUploader
              projectId={project.id}
              artifacts={artifacts}
              onChange={refreshArtifacts}
              readOnly={!canEdit}
            />
          </div>

          <div className="card">
            <h3 className="card-title">评论</h3>
            <CommentList
              comments={comments}
              resolveAuthor={(authorId) =>
                authorId === pm?.id ? pm.display_name : undefined
              }
            />
            <div style={{ marginTop: 16 }}>
              <CommentEditor
                targetType="project"
                targetId={project.id}
                onPosted={() => {
                  // Realtime handler will refresh automatically.
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
