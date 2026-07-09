import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AdminError,
  deleteUser,
  inviteUser,
  listUsers,
  setUserPassword,
  updateUserRole,
} from '../api/admin';
import { supabase } from '../api/supabase';
import { useRole } from '../hooks/useRole';
import { useToast } from '../hooks/useToast';
import { canManageUsers } from '../utils/rbac';
import { ROLES, type AdminUserRecord, type Role } from '../types/contracts';
import DataTable, { type DataTableColumn } from '../components/DataTable';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import RoleChip, { ROLE_LABEL } from '../components/RoleChip';

const ROLE_OPTIONS = ROLES;

const InviteSchema = z.object({
  email: z.string().email('请输入有效邮箱'),
  display_name: z.string().min(1, '请填写显示名').max(80, '显示名最多 80 字'),
  role: z.enum(ROLES),
  password: z
    .string()
    .min(6, '密码至少 6 位')
    .optional()
    .or(z.literal('')),
});
type InviteInput = z.input<typeof InviteSchema>;

const PasswordSchema = z.object({
  password: z.string().min(6, '密码至少 6 位'),
});
type PasswordInput = z.input<typeof PasswordSchema>;

const EditRoleSchema = z.object({
  display_name: z.string().min(1, '请填写显示名').max(80, '显示名最多 80 字'),
  role: z.enum(ROLES),
});
type EditRoleInput = z.input<typeof EditRoleSchema>;

/**
 * Admin user management page.
 *
 * Calls the `admin-users` Supabase Edge Function for every operation.
 * Layout/RoleGate ensures only admins reach this route.
 */
export default function AdminUsersPage() {
  const role = useRole();
  const toast = useToast();
  const supabaseConfigured = supabase !== null;

  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [inviting, setInviting] = useState(false);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [editing, setEditing] = useState<AdminUserRecord | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState<AdminUserRecord | null>(null);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<AdminUserRecord | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabaseConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await listUsers();
      setUsers(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载用户列表失败');
    } finally {
      setLoading(false);
    }
  }, [supabaseConfigured, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ─── Invite form ─────────────────────────────────────────────────────────
  const inviteForm = useForm<InviteInput>({
    resolver: zodResolver(InviteSchema),
    defaultValues: { email: '', display_name: '', role: 'pm', password: '' },
  });
  const closeInvite = useCallback(() => {
    if (inviteSubmitting) return;
    setInviting(false);
    inviteForm.reset({ email: '', display_name: '', role: 'pm', password: '' });
  }, [inviteSubmitting, inviteForm]);
  const onInvite = async (values: InviteInput) => {
    setInviteSubmitting(true);
    try {
      const password = values.password && values.password.length > 0 ? values.password : undefined;
      await inviteUser({
        email: values.email,
        display_name: values.display_name,
        role: values.role,
        ...(password ? { password } : {}),
      });
      toast.success('邀请已发送');
      setInviting(false);
      inviteForm.reset({ email: '', display_name: '', role: 'pm', password: '' });
      await refresh();
    } catch (e) {
      const msg = e instanceof AdminError ? e.message : e instanceof Error ? e.message : '邀请失败';
      toast.error(msg);
    } finally {
      setInviteSubmitting(false);
    }
  };

  // ─── Edit role / display_name form ───────────────────────────────────────
  const editForm = useForm<EditRoleInput>({
    resolver: zodResolver(EditRoleSchema),
    defaultValues: { display_name: '', role: 'pm' },
  });
  const openEdit = (u: AdminUserRecord) => {
    setEditing(u);
    editForm.reset({ display_name: u.display_name, role: u.role });
  };
  const closeEdit = useCallback(() => {
    if (editSubmitting) return;
    setEditing(null);
  }, [editSubmitting]);
  const onEdit = async (values: EditRoleInput) => {
    if (!editing) return;
    setEditSubmitting(true);
    try {
      await updateUserRole(editing.id, values.role, values.display_name);
      toast.success('角色已更新');
      setEditing(null);
      await refresh();
    } catch (e) {
      const msg = e instanceof AdminError ? e.message : e instanceof Error ? e.message : '更新失败';
      toast.error(msg);
    } finally {
      setEditSubmitting(false);
    }
  };

  // ─── Password form ───────────────────────────────────────────────────────
  const passwordForm = useForm<PasswordInput>({
    resolver: zodResolver(PasswordSchema),
    defaultValues: { password: '' },
  });
  const closePassword = useCallback(() => {
    if (passwordSubmitting) return;
    setPasswordTarget(null);
    passwordForm.reset({ password: '' });
  }, [passwordSubmitting, passwordForm]);
  const onSetPassword = async (values: PasswordInput) => {
    if (!passwordTarget) return;
    setPasswordSubmitting(true);
    try {
      await setUserPassword(passwordTarget.id, values.password);
      toast.success('密码已重置');
      setPasswordTarget(null);
      passwordForm.reset({ password: '' });
    } catch (e) {
      const msg = e instanceof AdminError ? e.message : e instanceof Error ? e.message : '重置失败';
      toast.error(msg);
    } finally {
      setPasswordSubmitting(false);
    }
  };

  // ─── Delete confirm ──────────────────────────────────────────────────────
  const onDelete = async () => {
    if (!deleting) return;
    setDeleteSubmitting(true);
    try {
      await deleteUser(deleting.id);
      toast.success(`已删除 ${deleting.email}`);
      setDeleting(null);
      await refresh();
    } catch (e) {
      const msg = e instanceof AdminError ? e.message : e instanceof Error ? e.message : '删除失败';
      toast.error(msg);
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // ─── RBAC gate ───────────────────────────────────────────────────────────
  if (!canManageUsers(role)) {
    return (
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">用户管理</h1>
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
          <h1 className="page-title">用户管理</h1>
        </div>
        <div className="card">
          <EmptyState
            title="Supabase 未配置"
            description="设置 VITE_SUPABASE_URL 与 VITE_SUPABASE_ANON_KEY 后即可加载用户列表。"
          />
        </div>
      </div>
    );
  }

  // ─── Table columns ───────────────────────────────────────────────────────
  const columns: DataTableColumn<AdminUserRecord>[] = [
    {
      key: 'email',
      header: '邮箱',
      render: (u) => <strong>{u.email}</strong>,
    },
    {
      key: 'display_name',
      header: '显示名',
      render: (u) => u.display_name,
    },
    {
      key: 'role',
      header: '角色',
      render: (u) => <RoleChip role={u.role as Role} />,
    },
    {
      key: 'created_at',
      header: '创建时间',
      render: (u) => new Date(u.created_at).toLocaleDateString('zh-CN'),
    },
    {
      key: 'actions',
      header: '操作',
      align: 'right',
      render: (u) => (
        <div style={{ display: 'inline-flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => openEdit(u)}
            title={`修改 ${u.email} 的角色`}
          >
            修改角色
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => setPasswordTarget(u)}
            title={`重置 ${u.email} 的密码`}
          >
            重置密码
          </button>
          <button
            type="button"
            className="btn btn-sm btn-danger"
            onClick={() => setDeleting(u)}
            title={`删除 ${u.email}`}
          >
            删除
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1 className="page-title">用户管理</h1>
          <p className="page-subtitle">邀请、修改角色、删除用户 · 共 {users.length} 人</p>
        </div>
        <button className="btn btn-primary" onClick={() => setInviting(true)}>
          邀请用户
        </button>
      </div>

      <DataTable
        columns={columns}
        rows={users}
        rowKey={(u) => u.id}
        loading={loading}
        emptyTitle="暂无用户"
        emptyDescription="点击右上角「邀请用户」开始添加成员"
      />

      {/* Invite modal */}
      <Modal
        open={inviting}
        onClose={closeInvite}
        title="邀请用户"
        dismissable={!inviteSubmitting}
        actions={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={closeInvite}
              disabled={inviteSubmitting}
            >
              取消
            </button>
            <button
              type="submit"
              form="invite-form"
              className="btn btn-primary"
              disabled={inviteSubmitting}
            >
              {inviteSubmitting ? '邀请中...' : '邀请'}
            </button>
          </>
        }
      >
        <form id="invite-form" onSubmit={inviteForm.handleSubmit(onInvite)}>
          <div className="field">
            <label className="field-label">邮箱</label>
            <input
              className="input"
              type="email"
              placeholder="name@company.com"
              {...inviteForm.register('email')}
            />
            {inviteForm.formState.errors.email && (
              <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>
                {inviteForm.formState.errors.email.message}
              </p>
            )}
          </div>
          <div className="field">
            <label className="field-label">显示名</label>
            <input
              className="input"
              placeholder="如:张三"
              {...inviteForm.register('display_name')}
            />
            {inviteForm.formState.errors.display_name && (
              <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>
                {inviteForm.formState.errors.display_name.message}
              </p>
            )}
          </div>
          <div className="field">
            <label className="field-label">角色</label>
            <select className="select" {...inviteForm.register('role')}>
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label">初始密码 (可选)</label>
            <input
              className="input"
              type="text"
              placeholder="留空则发送 magic link"
              {...inviteForm.register('password')}
            />
            {inviteForm.formState.errors.password && (
              <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>
                {inviteForm.formState.errors.password.message}
              </p>
            )}
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
              至少 6 位。留空则邀请邮件发送 magic link 登录链接。
            </p>
          </div>
        </form>
      </Modal>

      {/* Edit role / display_name modal */}
      <Modal
        open={editing !== null}
        onClose={closeEdit}
        title={`修改角色 — ${editing?.email ?? ''}`}
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
              form="edit-role-form"
              className="btn btn-primary"
              disabled={editSubmitting}
            >
              {editSubmitting ? '保存中...' : '保存'}
            </button>
          </>
        }
      >
        <form id="edit-role-form" onSubmit={editForm.handleSubmit(onEdit)}>
          <div className="field">
            <label className="field-label">显示名</label>
            <input className="input" {...editForm.register('display_name')} />
            {editForm.formState.errors.display_name && (
              <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>
                {editForm.formState.errors.display_name.message}
              </p>
            )}
          </div>
          <div className="field">
            <label className="field-label">角色</label>
            <select className="select" {...editForm.register('role')}>
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
        </form>
      </Modal>

      {/* Password reset modal */}
      <Modal
        open={passwordTarget !== null}
        onClose={closePassword}
        title={`重置密码 — ${passwordTarget?.email ?? ''}`}
        dismissable={!passwordSubmitting}
        actions={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={closePassword}
              disabled={passwordSubmitting}
            >
              取消
            </button>
            <button
              type="submit"
              form="reset-pw-form"
              className="btn btn-primary"
              disabled={passwordSubmitting}
            >
              {passwordSubmitting ? '重置中...' : '重置'}
            </button>
          </>
        }
      >
        <form id="reset-pw-form" onSubmit={passwordForm.handleSubmit(onSetPassword)}>
          <div className="field">
            <label className="field-label">新密码</label>
            <input
              className="input"
              type="text"
              placeholder="至少 6 位"
              {...passwordForm.register('password')}
            />
            {passwordForm.formState.errors.password && (
              <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>
                {passwordForm.formState.errors.password.message}
              </p>
            )}
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
              请妥善保管并通过安全渠道告知用户。
            </p>
          </div>
        </form>
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleting !== null}
        title="删除用户"
        message={
          <span>
            确定要删除用户 <strong>{deleting?.email}</strong>?此操作不可撤销,
            会同时删除该用户的 auth.users 记录及关联 profile 行。
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