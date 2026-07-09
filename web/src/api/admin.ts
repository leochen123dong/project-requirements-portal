/**
 * Admin Edge Function client.
 *
 * All admin user-management operations go through the `admin-users` Edge
 * Function (service_role holder on the server). The frontend never calls
 * Supabase directly for these operations so RLS cannot be bypassed by an
 * over-eager client.
 *
 * Response shape (per spec):
 *   { ok: boolean; error?: string; data?: T }
 *
 * Throws when `ok === false` so call sites can simply `try/catch` and
 * surface the error via `useToast`.
 */

import { supabase } from './supabase';
import type {
  AdminUserAction,
  AdminUserRecord,
  Role,
} from '../types/contracts';

export interface AdminResponse<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

export class AdminError extends Error {
  readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'AdminError';
    this.code = code;
  }
}

/**
 * Low-level helper that invokes the Edge Function. Returns the parsed
 * response envelope; throws `AdminError` when `ok === false`.
 */
export async function callAdmin<T = unknown>(
  action: AdminUserAction,
): Promise<{ ok: boolean; error?: string; data?: T }> {
  if (!supabase) {
    throw new AdminError('Supabase 未配置 (检查 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)');
  }
  const { data, error } = await supabase.functions.invoke<AdminResponse<T>>(
    'admin-users',
    { body: action as unknown as Record<string, unknown> },
  );
  if (error) {
    // Network / invocation error — surface verbatim.
    throw new AdminError(error.message ?? 'Edge Function 调用失败');
  }
  const envelope = (data ?? { ok: false, error: '空响应' }) as AdminResponse<T>;
  if (!envelope.ok) {
    throw new AdminError(envelope.error ?? '操作失败');
  }
  return envelope;
}

// ─── Typed wrappers ────────────────────────────────────────────────────────

/** List all users (profile + email). Admin only — backend enforces this. */
export async function listUsers(): Promise<AdminUserRecord[]> {
  const res = await callAdmin<AdminUserRecord[]>({ action: 'list' });
  return res.data ?? [];
}

export interface InviteUserArgs {
  email: string;
  role: Role;
  display_name: string;
  /** Optional. If omitted, the Edge Function sends a magic link. */
  password?: string;
}

/** Invite (create) a new user. Returns the created profile record. */
export async function inviteUser(args: InviteUserArgs): Promise<AdminUserRecord> {
  const res = await callAdmin<AdminUserRecord>({
    action: 'invite',
    email: args.email,
    role: args.role,
    display_name: args.display_name,
    ...(args.password ? { password: args.password } : {}),
  });
  if (!res.data) throw new AdminError('邀请成功但未返回用户记录');
  return res.data;
}

/** Update a user's role (and optionally display_name). */
export async function updateUserRole(
  userId: string,
  role: Role,
  display_name?: string,
): Promise<AdminUserRecord> {
  const res = await callAdmin<AdminUserRecord>({
    action: 'update-role',
    user_id: userId,
    role,
    ...(display_name ? { display_name } : {}),
  });
  if (!res.data) throw new AdminError('更新成功但未返回用户记录');
  return res.data;
}

/** Reset a user's password (admin operation). */
export async function setUserPassword(userId: string, password: string): Promise<void> {
  await callAdmin<void>({ action: 'set-password', user_id: userId, password });
}

/** Delete a user. Cascades to profile via FK. */
export async function deleteUser(userId: string): Promise<void> {
  await callAdmin<void>({ action: 'delete', user_id: userId });
}