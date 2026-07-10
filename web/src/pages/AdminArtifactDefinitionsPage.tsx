import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '../api/supabase';
import { asTypedClient } from '../hooks/useSupabaseClient';
import { useRole } from '../hooks/useRole';
import { useToast } from '../hooks/useToast';
import { canManageArtifactDefinitions } from '../utils/rbac';
import type { ArtifactDefinition } from '../types/contracts';
import DataTable, { type DataTableColumn } from '../components/DataTable';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';

const DefSchema = z.object({
  type: z.string().min(1, '类型标识必填').max(30),
  label: z.string().min(1, '显示名必填').max(80),
  description: z.string().nullable().optional(),
  is_required: z.boolean(),
  display_order: z.coerce.number().int(),
  is_active: z.boolean(),
});
type DefInput = z.input<typeof DefSchema>;

/**
 * Admin CRUD for the global artifact type vocabulary.
 * Mirrors AdminCustomFieldsPage and AdminTagsPage structure.
 */
export default function AdminArtifactDefinitionsPage() {
  const role = useRole();
  const toast = useToast();
  const client = asTypedClient(supabase);

  const [defs, setDefs] = useState<ArtifactDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ArtifactDefinition | null>(null);
  const [deleting, setDeleting] = useState<ArtifactDefinition | null>(null);

  const canManage = canManageArtifactDefinitions(role);

  const loadAll = async () => {
    if (!client) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await client
        .from('artifact_definitions')
        .select('*')
        .order('display_order', { ascending: true });
      if (error) throw error;
      setDefs((data ?? []) as unknown as ArtifactDefinition[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<DefInput>({
    resolver: zodResolver(DefSchema),
    defaultValues: { type: '', label: '', description: '', is_required: false, display_order: 0, is_active: true },
  });

  const onCreate = async (values: DefInput) => {
    if (!client) return;
    setCreating(true);
    try {
      const { error } = await client.from('artifact_definitions').insert({
        type: values.type,
        label: values.label,
        description: values.description || null,
        is_required: values.is_required,
        display_order: values.display_order,
        is_active: values.is_active,
      });
      if (error) throw error;
      toast.success('已添加');
      reset();
      setCreating(false);
      void loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '添加失败');
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (d: ArtifactDefinition) => {
    setEditing(d);
    reset({
      type: d.type,
      label: d.label,
      description: d.description ?? '',
      is_required: d.is_required,
      display_order: d.display_order,
      is_active: d.is_active,
    });
  };

  const onUpdate = async (values: DefInput) => {
    if (!client || !editing) return;
    setCreating(true);
    try {
      const { error } = await client
        .from('artifact_definitions')
        .update({
          label: values.label,
          description: values.description || null,
          is_required: values.is_required,
          display_order: values.display_order,
          is_active: values.is_active,
        })
        .eq('id', editing.id);
      if (error) throw error;
      toast.success('已更新');
      setEditing(null);
      void loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '更新失败');
    } finally {
      setCreating(false);
    }
  };

  const onDelete = async () => {
    if (!client || !deleting) return;
    setCreating(true);
    try {
      const { error } = await client
        .from('artifact_definitions')
        .delete()
        .eq('id', deleting.id);
      if (error) throw error;
      toast.success('已删除');
      setDeleting(null);
      void loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    } finally {
      setCreating(false);
    }
  };

  const columns: DataTableColumn<ArtifactDefinition>[] = [
    { key: 'type', header: '类型标识', render: (d) => <code>{d.type}</code> },
    { key: 'label', header: '显示名', render: (d) => d.label },
    { key: 'description', header: '说明', render: (d) => d.description ?? '—' },
    {
      key: 'is_required',
      header: '必填',
      render: (d) => (d.is_required ? <span className="tag tag-danger">必填</span> : '—'),
    },
    { key: 'display_order', header: '顺序', align: 'right', render: (d) => d.display_order },
    {
      key: 'is_active',
      header: '启用',
      render: (d) => (d.is_active ? '✓' : '—'),
    },
  ];

  if (!client) {
    return (
      <div className="container">
        <div className="page-header">
          <div>
            <h1 className="page-title">交付物管理</h1>
            <p className="page-subtitle">管理立项所需交付物类型</p>
          </div>
        </div>
        <div className="card">
          <EmptyState title="需要先连接 Supabase" />
        </div>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="container">
        <div className="page-header">
          <div>
            <h1 className="page-title">交付物管理</h1>
          </div>
        </div>
        <div className="card">
          <EmptyState title="无权限" description="仅管理员可访问此页" />
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1 className="page-title">交付物管理</h1>
          <p className="page-subtitle">管理立项所需交付物类型 · 共 {defs.length} 个</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            reset({ type: '', label: '', description: '', is_required: false, display_order: defs.length, is_active: true });
            setCreating(true);
          }}
        >
          新增交付物
        </button>
      </div>

      <DataTable
        columns={[
          ...columns,
          ...(canManage
            ? [
                {
                  key: 'actions' as const,
                  header: '操作',
                  align: 'right' as const,
                  render: (d: ArtifactDefinition) => (
                    <>
                      <button className="btn btn-sm btn-ghost" onClick={() => startEdit(d)}>编辑</button>
                      <button
                        className="btn btn-sm btn-ghost"
                        style={{ color: 'var(--danger)', marginLeft: 8 }}
                        onClick={(e) => { e.stopPropagation(); setDeleting(d); }}
                      >
                        删除
                      </button>
                    </>
                  ),
                },
              ]
            : []),
        ]}
        rows={defs}
        rowKey={(d) => d.id}
        loading={loading}
        emptyTitle="暂无交付物类型"
        emptyDescription="点击「新增交付物」添加"
      />

      <Modal
        open={creating}
        onClose={() => !editing && setCreating(false)}
        title={editing ? '编辑交付物类型' : '新增交付物类型'}
        actions={
          <>
            <button className="btn btn-secondary" onClick={() => { setCreating(false); setEditing(null); }} disabled={creating}>
              取消
            </button>
            <button
              className="btn btn-primary"
              form="def-form"
              type="submit"
              disabled={creating}
            >
              {editing ? '保存' : '添加'}
            </button>
          </>
        }
      >
        <form id="def-form" onSubmit={handleSubmit(editing ? onUpdate : onCreate)}>
          <div className="field">
            <label className="field-label">类型标识 (machine name)</label>
            <input
              className="input"
              placeholder="如:tech-spec"
              {...register('type')}
              disabled={!!editing}
            />
            {errors.type && <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>{errors.type.message}</p>}
          </div>
          <div className="field">
            <label className="field-label">显示名</label>
            <input className="input" placeholder="如:技术规格说明书" {...register('label')} />
            {errors.label && <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>{errors.label.message}</p>}
          </div>
          <div className="field">
            <label className="field-label">说明 (可选)</label>
            <input className="input" placeholder="如:整体技术架构与方案设计" {...register('description')} />
          </div>
          <div className="field">
            <label className="field-label">顺序</label>
            <input className="input" type="number" {...register('display_order', { valueAsNumber: true })} />
          </div>
          <div className="field" style={{ display: 'flex', gap: 16 }}>
            <label>
              <input type="checkbox" {...register('is_required')} /> 必填
            </label>
            <label>
              <input type="checkbox" {...register('is_active')} /> 启用
            </label>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title="删除交付物类型"
        tone="danger"
        confirmLabel="确认删除"
        loading={creating}
        onConfirm={onDelete}
        onCancel={() => !creating && setDeleting(null)}
        message={
          <>
            确定要删除交付物类型 <strong>{deleting?.type}</strong>({deleting?.label})?
            <br />
            <span style={{ color: 'var(--danger)', fontSize: 13 }}>
              已上传的文件不会删除,但前端将无法识别此类型。
            </span>
          </>
        }
      />
    </div>
  );
}