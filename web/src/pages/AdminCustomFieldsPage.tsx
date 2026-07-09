import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '../api/supabase';
import { asTypedClient } from '../hooks/useSupabaseClient';
import { useRole } from '../hooks/useRole';
import { useToast } from '../hooks/useToast';
import { canManageCustomFields } from '../utils/rbac';
import type { FieldDefinition } from '../types/contracts';
import DataTable, { type DataTableColumn } from '../components/DataTable';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';

const FIELD_TYPES = ['text', 'number', 'date', 'select'] as const;
const FIELD_TYPE_LABEL: Record<(typeof FIELD_TYPES)[number], string> = {
  text: '文本',
  number: '数字',
  date: '日期',
  select: '下拉单选',
};

/**
 * Schema for create/edit form. Note: `options` is collected as a textarea
 * (one per line) and transformed to string[] before submission; it's only
 * enforced when type='select' (refinement below).
 */
const FieldFormSchema = z
  .object({
    name: z
      .string()
      .min(1, '请填写机器名')
      .max(40, '机器名最多 40 字符')
      .regex(/^[a-z][a-z0-9_]*$/, '机器名必须 snake_case,以小写字母开头,仅含 a-z 0-9 _'),
    label: z
      .string()
      .min(1, '请填写显示名')
      .max(80, '显示名最多 80 字符'),
    type: z.enum(FIELD_TYPES),
    optionsText: z.string(), // textarea, one option per line
    required: z.boolean(),
    display_order: z
      .number({ invalid_type_error: '请填写数字' })
      .int('请填写整数')
      .default(0),
    is_active: z.boolean().default(true),
  })
  .superRefine((val, ctx) => {
    if (val.type === 'select') {
      const opts = val.optionsText
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (opts.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['optionsText'],
          message: 'select 类型至少需要 1 个选项',
        });
      }
    }
  });
type FieldFormInput = z.input<typeof FieldFormSchema>;

/**
 * Supabase client with the new tables. The Database type stub in
 * api/supabase.ts does NOT yet include `opportunity_field_definitions`
 * or `opportunity_field_values`, so we cast through `unknown` here.
 * This cast is local to this page and does not leak the schema change
 * to other files (rbac.ts / contracts.ts / supabase.ts remain untouched).
 */
function makeFieldClient() {
  return asTypedClient(supabase) as unknown as {
    from: (table: string) => {
      select: (cols?: string) => {
        order: (col: string, opts?: { ascending: boolean }) => Promise<{
          data: unknown;
          error: { message: string } | null;
        }>;
        eq: (col: string, val: unknown) => Promise<{
          data: unknown;
          error: { message: string } | null;
        }>;
      };
      insert: (row: unknown) => Promise<{ data: unknown; error: { message: string } | null }>;
      update: (row: unknown) => {
        eq: (col: string, val: unknown) => Promise<{
          data: unknown;
          error: { message: string } | null;
        }>;
      };
      delete: () => {
        eq: (col: string, val: unknown) => Promise<{
          data: unknown;
          error: { message: string } | null;
        }>;
      };
    };
  };
}

/**
 * Admin page for managing opportunity custom field definitions.
 *
 * CRUD on `opportunity_field_definitions` via the typed client. Field
 * values are stored in `opportunity_field_values` and managed from the
 * Opportunities pages — this page is the schema-level catalog only.
 *
 * Layout/RoleGate ensures only admins reach this route. We additionally
 * `canManageCustomFields(role)`-gate for direct URL access.
 */
export default function AdminCustomFieldsPage() {
  const role = useRole();
  const toast = useToast();
  const client = makeFieldClient();
  const supabaseConfigured = supabase !== null;

  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [creating, setCreating] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [editing, setEditing] = useState<FieldDefinition | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<FieldDefinition | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabaseConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await client
        .from('opportunity_field_definitions')
        .select('*')
        .order('display_order', { ascending: true });
      if (res.error) throw new Error(res.error.message);
      setFields((res.data ?? []) as unknown as FieldDefinition[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载字段定义失败');
    } finally {
      setLoading(false);
    }
  }, [supabaseConfigured, toast, client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ─── Create form ─────────────────────────────────────────────────────────
  const createForm = useForm<FieldFormInput>({
    resolver: zodResolver(FieldFormSchema),
    defaultValues: {
      name: '',
      label: '',
      type: 'text',
      optionsText: '',
      required: false,
      display_order: 0,
      is_active: true,
    },
  });
  const closeCreate = useCallback(() => {
    if (createSubmitting) return;
    setCreating(false);
    createForm.reset({
      name: '',
      label: '',
      type: 'text',
      optionsText: '',
      required: false,
      display_order: 0,
      is_active: true,
    });
  }, [createSubmitting, createForm]);
  const onCreate = async (values: FieldFormInput) => {
    if (!supabaseConfigured) return;
    setCreateSubmitting(true);
    try {
      const opts =
        values.type === 'select'
          ? values.optionsText
              .split('\n')
              .map((s) => s.trim())
              .filter((s) => s.length > 0)
          : null;
      const row = {
        name: values.name,
        label: values.label,
        type: values.type,
        options: opts,
        required: values.required,
        display_order: values.display_order,
        is_active: values.is_active,
      };
      const res = await client.from('opportunity_field_definitions').insert(row);
      if (res.error) throw new Error(res.error.message);
      toast.success('字段已创建');
      setCreating(false);
      createForm.reset({
        name: '',
        label: '',
        type: 'text',
        optionsText: '',
        required: false,
        display_order: 0,
        is_active: true,
      });
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '创建失败');
    } finally {
      setCreateSubmitting(false);
    }
  };

  // ─── Edit form ───────────────────────────────────────────────────────────
  const editForm = useForm<FieldFormInput>({
    resolver: zodResolver(FieldFormSchema),
    defaultValues: {
      name: '',
      label: '',
      type: 'text',
      optionsText: '',
      required: false,
      display_order: 0,
      is_active: true,
    },
  });
  const openEdit = (f: FieldDefinition) => {
    setEditing(f);
    editForm.reset({
      name: f.name,
      label: f.label,
      type: f.type,
      optionsText: (f.options ?? []).join('\n'),
      required: f.required,
      display_order: f.display_order,
      is_active: f.is_active,
    });
  };
  const closeEdit = useCallback(() => {
    if (editSubmitting) return;
    setEditing(null);
  }, [editSubmitting]);
  const onEdit = async (values: FieldFormInput) => {
    if (!supabaseConfigured || !editing) return;
    setEditSubmitting(true);
    try {
      const opts =
        values.type === 'select'
          ? values.optionsText
              .split('\n')
              .map((s) => s.trim())
              .filter((s) => s.length > 0)
          : null;
      const row = {
        name: values.name,
        label: values.label,
        type: values.type,
        options: opts,
        required: values.required,
        display_order: values.display_order,
        is_active: values.is_active,
      };
      const res = await client
        .from('opportunity_field_definitions')
        .update(row)
        .eq('id', editing.id);
      if (res.error) throw new Error(res.error.message);
      toast.success('字段已更新');
      setEditing(null);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '更新失败');
    } finally {
      setEditSubmitting(false);
    }
  };

  // ─── Delete confirm ──────────────────────────────────────────────────────
  /**
   * Check how many values reference this field BEFORE deleting — if any
   * exist, the deletion will succeed (FK is ON DELETE CASCADE) but the
   * admin should be informed about the cascade so they don't think the
   * operation was a no-op.
   */
  const onDelete = async () => {
    if (!supabaseConfigured || !deleting) return;
    setDeleteSubmitting(true);
    try {
      const refRes = await client
        .from('opportunity_field_values')
        .select('*')
        .eq('field_id', deleting.id);
      if (refRes.error) throw new Error(refRes.error.message);
      const refCount = Array.isArray(refRes.data) ? refRes.data.length : 0;

      const delRes = await client
        .from('opportunity_field_definitions')
        .delete()
        .eq('id', deleting.id);
      if (delRes.error) throw new Error(delRes.error.message);
      toast.success(
        refCount > 0
          ? `已删除字段「${deleting.label}」,级联清理 ${refCount} 条值`
          : `已删除字段「${deleting.label}」`,
      );
      setDeleting(null);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // ─── RBAC gate ───────────────────────────────────────────────────────────
  if (!canManageCustomFields(role)) {
    return (
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">自定义字段</h1>
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
          <h1 className="page-title">自定义字段</h1>
        </div>
        <div className="card">
          <EmptyState
            title="Supabase 未配置"
            description="设置 VITE_SUPABASE_URL 与 VITE_SUPABASE_ANON_KEY 后即可管理自定义字段。"
          />
        </div>
      </div>
    );
  }

  // ─── Table columns ───────────────────────────────────────────────────────
  const columns: DataTableColumn<FieldDefinition>[] = [
    {
      key: 'name',
      header: '机器名',
      render: (f) => <code style={{ fontSize: 13 }}>{f.name}</code>,
    },
    {
      key: 'label',
      header: '显示名',
      render: (f) => <strong>{f.label}</strong>,
    },
    {
      key: 'type',
      header: '类型',
      render: (f) => (
        <span className="tag tag-info">{FIELD_TYPE_LABEL[f.type] ?? f.type}</span>
      ),
    },
    {
      key: 'options',
      header: '选项',
      render: (f) =>
        f.type === 'select' && f.options && f.options.length > 0
          ? f.options.join(' / ')
          : <span style={{ color: 'var(--text-muted)' }}>—</span>,
    },
    {
      key: 'required',
      header: '必填',
      align: 'center',
      render: (f) =>
        f.required ? (
          <span style={{ color: 'var(--danger)', fontWeight: 600 }}>✓</span>
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>—</span>
        ),
    },
    {
      key: 'display_order',
      header: '顺序',
      align: 'right',
      render: (f) => f.display_order,
    },
    {
      key: 'is_active',
      header: '启用',
      align: 'center',
      render: (f) =>
        f.is_active ? (
          <span style={{ color: 'var(--success)', fontWeight: 600 }}>✓</span>
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>—</span>
        ),
    },
    {
      key: 'actions',
      header: '操作',
      align: 'right',
      render: (f) => (
        <div style={{ display: 'inline-flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => openEdit(f)}
            title={`编辑 ${f.label}`}
          >
            编辑
          </button>
          <button
            type="button"
            className="btn btn-sm btn-danger"
            onClick={() => setDeleting(f)}
            title={`删除 ${f.label}`}
          >
            删除
          </button>
        </div>
      ),
    },
  ];

  // Shared form rendering for create + edit.
  const renderFieldForm = (form: ReturnType<typeof useForm<FieldFormInput>>) => {
    const selectedType = form.watch('type');
    const errors = form.formState.errors;
    return (
      <>
        <div className="field">
          <label className="field-label">机器名 (snake_case)</label>
          <input
            className="input"
            placeholder="如:industry / customer_source"
            {...form.register('name')}
          />
          {errors.name && (
            <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>
              {errors.name.message}
            </p>
          )}
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
            以小写字母开头,仅含 a-z、0-9、_ 。保存后不可修改。
          </p>
        </div>
        <div className="field">
          <label className="field-label">显示名</label>
          <input
            className="input"
            placeholder="如:行业 / 客户来源"
            {...form.register('label')}
          />
          {errors.label && (
            <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>
              {errors.label.message}
            </p>
          )}
        </div>
        <div className="field">
          <label className="field-label">类型</label>
          <select className="select" {...form.register('type')}>
            {FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {FIELD_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        {selectedType === 'select' && (
          <div className="field">
            <label className="field-label">选项 (每行一个)</label>
            <textarea
              className="textarea"
              rows={5}
              placeholder={'金融\n制造\n互联网\n政府'}
              {...form.register('optionsText')}
            />
            {errors.optionsText && (
              <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>
                {errors.optionsText.message}
              </p>
            )}
          </div>
        )}
        <div className="field">
          <label
            className="field-label"
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
          >
            <input type="checkbox" {...form.register('required')} />
            <span>必填 (商机创建时强制填写)</span>
          </label>
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
            <span>启用 (关闭后商机表单不再显示)</span>
          </label>
        </div>
      </>
    );
  };

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1 className="page-title">自定义字段</h1>
          <p className="page-subtitle">管理商机可选字段 (行业、来源等) · 共 {fields.length} 个</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          新增字段
        </button>
      </div>

      <DataTable
        columns={columns}
        rows={fields}
        rowKey={(f) => f.id}
        loading={loading}
        emptyTitle="暂无自定义字段"
        emptyDescription="点击右上角「新增字段」开始定义"
      />

      {/* Create modal */}
      <Modal
        open={creating}
        onClose={closeCreate}
        title="新增字段"
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
              form="create-field-form"
              className="btn btn-primary"
              disabled={createSubmitting}
            >
              {createSubmitting ? '创建中...' : '创建'}
            </button>
          </>
        }
      >
        <form id="create-field-form" onSubmit={createForm.handleSubmit(onCreate)}>
          {renderFieldForm(createForm)}
        </form>
      </Modal>

      {/* Edit modal */}
      <Modal
        open={editing !== null}
        onClose={closeEdit}
        title={`编辑字段 — ${editing?.label ?? ''}`}
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
              form="edit-field-form"
              className="btn btn-primary"
              disabled={editSubmitting}
            >
              {editSubmitting ? '保存中...' : '保存'}
            </button>
          </>
        }
      >
        <form id="edit-field-form" onSubmit={editForm.handleSubmit(onEdit)}>
          {renderFieldForm(editForm)}
        </form>
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleting !== null}
        title="删除字段"
        message={
          <span>
            确定要删除字段 <strong>{deleting?.label}</strong> (机器名 <code>{deleting?.name}</code>)?
            此操作不可撤销,如已有商机填写了此字段,值会被一并删除。
          </span>
        }
        confirmLabel="删除"
        tone="danger"
        loading={deleteSubmitting}
        onConfirm={onDelete}
        onCancel={() => {
          if (!deleteSubmitting) setDeleting(null);
        }}
      />
    </div>
  );
}