import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '../api/supabase';
import { asTypedClient } from '../hooks/useSupabaseClient';
import { useRole } from '../hooks/useRole';
import { useToast } from '../hooks/useToast';
import { canManageTagDefinitions } from '../utils/rbac';
import type { OpportunityTagDefinition } from '../types/contracts';
import DataTable, { type DataTableColumn } from '../components/DataTable';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';

const TAG_COLORS = ['tag-info', 'tag-success', 'tag-warning', 'tag-danger', 'tag-neutral'] as const;
type TagColor = (typeof TAG_COLORS)[number];

const TAG_COLOR_LABEL: Record<TagColor, string> = {
  'tag-info': '蓝色',
  'tag-success': '绿色',
  'tag-warning': '黄色',
  'tag-danger': '红色',
  'tag-neutral': '灰色',
};

const TagFormSchema = z.object({
  tag: z
    .string()
    .min(1, '请填写机器名')
    .max(40, '机器名最多 40 字符')
    .regex(/^[a-z][a-z0-9_-]*$/, '机器名以小写字母开头,仅含 a-z、0-9、_、-'),
  label: z
    .string()
    .min(1, '请填写显示名')
    .max(80, '显示名最多 80 字符'),
  color: z.enum(TAG_COLORS),
  display_order: z
    .number({ invalid_type_error: '请填写数字' })
    .int('请填写整数')
    .default(0),
  is_active: z.boolean().default(true),
});
type TagFormInput = z.input<typeof TagFormSchema>;

function defaultTagFormValues(): TagFormInput {
  return {
    tag: '',
    label: '',
    color: 'tag-info',
    display_order: 0,
    is_active: true,
  };
}

/**
 * Admin page for managing the controlled opportunity tag vocabulary.
 *
 * Tags are selected from OpportunityDetailPage via `opportunity_tag_values`;
 * this page only manages definitions in `opportunity_tag_definitions`.
 */
export default function AdminTagsPage() {
  const role = useRole();
  const toast = useToast();
  const client = asTypedClient(supabase);
  const supabaseConfigured = supabase !== null;

  const [defs, setDefs] = useState<OpportunityTagDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [creating, setCreating] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [editing, setEditing] = useState<OpportunityTagDefinition | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<OpportunityTagDefinition | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteUsageCount, setDeleteUsageCount] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!supabaseConfigured || !client) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await client
        .from('opportunity_tag_definitions')
        .select('*')
        .order('display_order', { ascending: true });
      if (res.error) throw res.error;
      setDefs((res.data ?? []) as unknown as OpportunityTagDefinition[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载标签定义失败');
    } finally {
      setLoading(false);
    }
  }, [supabaseConfigured, client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ─── Create form ─────────────────────────────────────────────────────────
  const createForm = useForm<TagFormInput>({
    resolver: zodResolver(TagFormSchema),
    defaultValues: defaultTagFormValues(),
  });
  const closeCreate = useCallback(() => {
    if (createSubmitting) return;
    setCreating(false);
    createForm.reset(defaultTagFormValues());
  }, [createSubmitting, createForm]);
  const onCreate = async (values: TagFormInput) => {
    if (!supabaseConfigured || !client) return;
    setCreateSubmitting(true);
    try {
      const res = await client.from('opportunity_tag_definitions').insert({
        tag: values.tag,
        label: values.label,
        color: values.color,
        display_order: values.display_order,
        is_active: values.is_active,
      });
      if (res.error) throw res.error;
      toast.success('标签已创建');
      setCreating(false);
      createForm.reset(defaultTagFormValues());
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '创建失败');
    } finally {
      setCreateSubmitting(false);
    }
  };

  // ─── Edit form ───────────────────────────────────────────────────────────
  const editForm = useForm<TagFormInput>({
    resolver: zodResolver(TagFormSchema),
    defaultValues: defaultTagFormValues(),
  });
  const openEdit = (d: OpportunityTagDefinition) => {
    setEditing(d);
    editForm.reset({
      tag: d.tag,
      label: d.label,
      color: TAG_COLORS.includes(d.color as TagColor) ? (d.color as TagColor) : 'tag-info',
      display_order: d.display_order,
      is_active: d.is_active,
    });
  };
  const closeEdit = useCallback(() => {
    if (editSubmitting) return;
    setEditing(null);
  }, [editSubmitting]);
  const onEdit = async (values: TagFormInput) => {
    if (!supabaseConfigured || !client || !editing) return;
    setEditSubmitting(true);
    try {
      const res = await client
        .from('opportunity_tag_definitions')
        .update({
          tag: values.tag,
          label: values.label,
          color: values.color,
          display_order: values.display_order,
          is_active: values.is_active,
        })
        .eq('id', editing.id);
      if (res.error) throw res.error;
      toast.success('标签已更新');
      setEditing(null);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '更新失败');
    } finally {
      setEditSubmitting(false);
    }
  };

  // ─── Delete confirm ──────────────────────────────────────────────────────
  const checkUsageCount = useCallback(
    async (d: OpportunityTagDefinition) => {
      if (!client) return;
      setDeleteUsageCount(null);
      try {
        const res = await client
          .from('opportunity_tag_values')
          .select('*')
          .eq('tag_id', d.id);
        if (res.error) throw res.error;
        setDeleteUsageCount(Array.isArray(res.data) ? res.data.length : 0);
      } catch (e) {
        setDeleteUsageCount(null);
        toast.error(e instanceof Error ? e.message : '检查标签使用量失败');
      }
    },
    [client],
  );

  const openDelete = (d: OpportunityTagDefinition) => {
    setDeleting(d);
    void checkUsageCount(d);
  };

  const onDelete = async () => {
    if (!supabaseConfigured || !client || !deleting) return;
    setDeleteSubmitting(true);
    try {
      const refRes = await client
        .from('opportunity_tag_values')
        .select('*')
        .eq('tag_id', deleting.id);
      if (refRes.error) throw refRes.error;
      const refCount = Array.isArray(refRes.data) ? refRes.data.length : 0;

      const delRes = await client
        .from('opportunity_tag_definitions')
        .delete()
        .eq('id', deleting.id);
      if (delRes.error) throw delRes.error;
      toast.success(
        refCount > 0
          ? `已删除标签「${deleting.label}」,级联清理 ${refCount} 个商机标签`
          : `已删除标签「${deleting.label}」`,
      );
      setDeleting(null);
      setDeleteUsageCount(null);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // ─── RBAC gate ───────────────────────────────────────────────────────────
  if (!canManageTagDefinitions(role)) {
    return (
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">标签管理</h1>
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

  // ─── Supabase not configured ─────────────────────────────────────────────
  if (!supabaseConfigured) {
    return (
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">标签管理</h1>
        </div>
        <div className="card">
          <EmptyState
            title="Supabase 未配置"
            description="设置 VITE_SUPABASE_URL 与 VITE_SUPABASE_ANON_KEY 后即可管理标签。"
          />
        </div>
      </div>
    );
  }

  // ─── Table columns ───────────────────────────────────────────────────────
  const columns: DataTableColumn<OpportunityTagDefinition>[] = [
    {
      key: 'tag',
      header: '机器名',
      render: (d) => <code style={{ fontSize: 13 }}>{d.tag}</code>,
    },
    {
      key: 'label',
      header: '显示名',
      render: (d) => <strong>{d.label}</strong>,
    },
    {
      key: 'color',
      header: '颜色',
      render: (d) => (
        <span className={`tag ${d.color}`}>
          {TAG_COLOR_LABEL[d.color as TagColor] ?? d.color} · {d.label}
        </span>
      ),
    },
    {
      key: 'display_order',
      header: '顺序',
      align: 'right',
      render: (d) => d.display_order,
    },
    {
      key: 'is_active',
      header: '启用',
      align: 'center',
      render: (d) =>
        d.is_active ? (
          <span style={{ color: 'var(--success)', fontWeight: 600 }}>✓</span>
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>—</span>
        ),
    },
    {
      key: 'actions',
      header: '操作',
      align: 'right',
      render: (d) => (
        <div style={{ display: 'inline-flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => openEdit(d)}
            title={`编辑 ${d.label}`}
          >
            编辑
          </button>
          <button
            type="button"
            className="btn btn-sm btn-danger"
            onClick={() => openDelete(d)}
            title={`删除 ${d.label}`}
          >
            删除
          </button>
        </div>
      ),
    },
  ];

  const renderTagForm = (form: ReturnType<typeof useForm<TagFormInput>>) => {
    const errors = form.formState.errors;
    const selectedColor = form.watch('color');
    return (
      <>
        <div className="field">
          <label className="field-label">机器名</label>
          <input
            className="input"
            placeholder="如:finance / key_account"
            {...form.register('tag')}
          />
          {errors.tag && (
            <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>
              {errors.tag.message}
            </p>
          )}
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
            以小写字母开头,仅含 a-z、0-9、_、- 。
          </p>
        </div>
        <div className="field">
          <label className="field-label">显示名</label>
          <input
            className="input"
            placeholder="如:金融 / 重点跟进"
            {...form.register('label')}
          />
          {errors.label && (
            <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>
              {errors.label.message}
            </p>
          )}
        </div>
        <div className="field">
          <label className="field-label">颜色</label>
          <select className="select" {...form.register('color')}>
            {TAG_COLORS.map((c) => (
              <option key={c} value={c}>
                {TAG_COLOR_LABEL[c]}
              </option>
            ))}
          </select>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            预览:{' '}
            <span className={`tag ${selectedColor}`}>
              {form.watch('label') || '标签'}
            </span>
          </p>
        </div>
        <div className="field">
          <label className="field-label">显示顺序</label>
          <input
            className="input"
            type="number"
            {...form.register('display_order', { valueAsNumber: true })}
          />
          {errors.display_order && (
            <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>
              {errors.display_order.message}
            </p>
          )}
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
            数字越小越靠前。
          </p>
        </div>
        <div className="field">
          <label
            className="field-label"
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
          >
            <input type="checkbox" {...form.register('is_active')} />
            <span>启用 (关闭后商机详情不再显示)</span>
          </label>
        </div>
      </>
    );
  };

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1 className="page-title">标签管理</h1>
          <p className="page-subtitle">管理商机可选标签 (金融、重点跟进等) · 共 {defs.length} 个</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          新增标签
        </button>
      </div>

      <DataTable
        columns={columns}
        rows={defs}
        rowKey={(d) => d.id}
        loading={loading}
        emptyTitle="暂无标签"
        emptyDescription="点击右上角「新增标签」开始定义"
      />

      {/* Create modal */}
      <Modal
        open={creating}
        onClose={closeCreate}
        title="新增标签"
        dismissable={!createSubmitting}
        actions={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={closeCreate}
              disabled={createSubmitting}
            >
              取消
            </button>
            <button
              type="submit"
              form="create-tag-form"
              className="btn btn-primary"
              disabled={createSubmitting}
            >
              {createSubmitting ? '创建中...' : '创建'}
            </button>
          </>
        }
      >
        <form id="create-tag-form" onSubmit={createForm.handleSubmit(onCreate)}>
          {renderTagForm(createForm)}
        </form>
      </Modal>

      {/* Edit modal */}
      <Modal
        open={editing !== null}
        onClose={closeEdit}
        title={`编辑标签 — ${editing?.label ?? ''}`}
        dismissable={!editSubmitting}
        actions={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={closeEdit}
              disabled={editSubmitting}
            >
              取消
            </button>
            <button
              type="submit"
              form="edit-tag-form"
              className="btn btn-primary"
              disabled={editSubmitting}
            >
              {editSubmitting ? '保存中...' : '保存'}
            </button>
          </>
        }
      >
        <form id="edit-tag-form" onSubmit={editForm.handleSubmit(onEdit)}>
          {renderTagForm(editForm)}
        </form>
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleting !== null}
        title="删除标签"
        message={
          <span>
            确定要删除标签 <strong>{deleting?.label}</strong> (机器名 <code>{deleting?.tag}</code>)?
            此操作不可撤销。
            <br />
            {deleteUsageCount === null ? (
              <span style={{ color: 'var(--text-muted)' }}>正在检查使用量...</span>
            ) : (
              <strong>{deleteUsageCount} 个商机使用此标签,删除后会一并移除。</strong>
            )}
          </span>
        }
        confirmLabel="删除"
        tone="danger"
        loading={deleteSubmitting}
        onConfirm={onDelete}
        onCancel={() => {
          if (!deleteSubmitting) {
            setDeleting(null);
            setDeleteUsageCount(null);
          }
        }}
      />
    </div>
  );
}
