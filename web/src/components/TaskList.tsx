import { useEffect, useState } from 'react';
import type { Task } from '../types/contracts';
import { canCompleteTask } from '../utils/rbac';
import { supabase } from '../api/supabase';
import { useToast } from '../hooks/useToast';
import { useAuthStore } from '../store/authStore';
import { useRole } from '../hooks/useRole';
import { asTypedClient } from '../hooks/useSupabaseClient';

export interface TaskListProps {
  milestoneId: string;
  tasks: Task[];
  onChange?: () => void;
}

/**
 * Per-milestone task list with checkbox and inline title edit.
 * Realtime updates via `useEffect`/`supabase.channel` so newly added tasks
 * appear without a hard refresh.
 */
export default function TaskList({ milestoneId, tasks, onChange }: TaskListProps) {
  const role = useRole();
  const userId = useAuthStore((s) => s.profile?.id ?? null);
  const toast = useToast();
  const canTick = canCompleteTask(role);
  const client = asTypedClient(supabase);

  const handleToggle = async (t: Task) => {
    if (!client) return;
    if (!canTick) {
      toast.error('当前角色无权限更新任务状态');
      return;
    }
    try {
      const { error } = await client
        .from('tasks')
        .update({ done: !t.done })
        .eq('id', t.id);
      if (error) throw error;
      onChange?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '更新任务失败');
    }
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const startEdit = (t: Task) => {
    setEditingId(t.id);
    setEditingTitle(t.title);
  };

  const commitEdit = async (t: Task) => {
    if (!client) return;
    const next = editingTitle.trim();
    if (!next || next === t.title) {
      setEditingId(null);
      return;
    }
    try {
      const { error } = await client.from('tasks').update({ title: next }).eq('id', t.id);
      if (error) throw error;
      setEditingId(null);
      onChange?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '编辑任务失败');
    }
  };

  // Realtime: refresh when a task is inserted/updated/deleted on the same milestone.
  useEffect(() => {
    if (!client) return;
    const c = client;
    const channel = c
      .channel(`rt-tasks-${milestoneId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `milestone_id=eq.${milestoneId}` },
        () => onChange?.(),
      )
      .subscribe();
    return () => {
      void c.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [milestoneId, client]);

  if (tasks.length === 0) {
    return <p style={{ color: 'var(--text-muted)' }}>暂无任务</p>;
  }

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {tasks.map((t) => {
        const editing = editingId === t.id;
        const isMine = !!userId && t.assignee_id === userId;
        return (
          <li
            key={t.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '8px 0',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <input
              type="checkbox"
              checked={t.done}
              disabled={!canTick}
              onChange={() => handleToggle(t)}
              aria-label={t.title}
            />
            {editing ? (
              <input
                className="input"
                value={editingTitle}
                autoFocus
                onChange={(e) => setEditingTitle(e.target.value)}
                onBlur={() => commitEdit(t)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void commitEdit(t);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                style={{ flex: 1 }}
              />
            ) : (
              <span
                onDoubleClick={() => startEdit(t)}
                style={{
                  flex: 1,
                  textDecoration: t.done ? 'line-through' : 'none',
                  color: t.done ? 'var(--text-muted)' : 'var(--text)',
                }}
              >
                {t.title}
              </span>
            )}
            {t.due_date && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.due_date}</span>
            )}
            {!editing && (
              <button className="btn btn-sm btn-ghost" onClick={() => startEdit(t)}>
                编辑
              </button>
            )}
            {isMine && <span className="tag tag-info">我</span>}
          </li>
        );
      })}
    </ul>
  );
}
