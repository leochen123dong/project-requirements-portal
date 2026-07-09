// deno-lint-ignore-file no-explicit-any
import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.45.0';

import { corsHeaders, handleCors } from '../_shared/cors.ts';

/**
 * Edge Function: admin-users
 *
 * Single POST endpoint that dispatches admin user-management operations based
 * on the `action` field in the JSON body. The frontend calls this via
 * `supabase.functions.invoke('admin-users', { body })`; the request/response
 * shapes are pinned by `AdminUserActionSchema` / `AdminUserRecordSchema` in
 * `web/src/types/contracts.ts`.
 *
 * Auth model:
 *   1. CORS preflight first (`handleCors`).
 *   2. JWT in `Authorization: Bearer <jwt>` is verified via the user-scoped
 *      client (`auth.getUser(jwt)`).
 *   3. The caller's `role` in `public.profiles` MUST be 'admin' — non-admins
 *      get 403. This is the ONLY authorization gate; we never trust the
 *      client's claim of being an admin.
 *   4. All privileged DB writes use a separate `service_role` client so RLS
 *      is bypassed by design (and audited by the fact that every privileged
 *      write is funneled through this one function).
 *
 * Response envelope (matches the frontend `AdminResponse<T>` in
 * `web/src/api/admin.ts`):
 *   { ok: true, data?: T }      on success (HTTP 200)
 *   { ok: false, error: '...' } on failure (HTTP 4xx / 5xx)
 *
 * Actions:
 *   - 'list'         -> AdminUserRecord[] (all auth.users JOINed with profiles)
 *   - 'invite'       -> AdminUserRecord  (create auth.users + set role/name)
 *   - 'update-role'  -> AdminUserRecord  (update profiles.role + display_name)
 *   - 'set-password' -> nothing           (admin.users.updateUserById)
 *   - 'delete'       -> nothing           (admin.deleteUser cascades to profile)
 */

// ─── Types ──────────────────────────────────────────────────────────────────

/** Mirror of `Role` in `web/src/types/contracts.ts` — kept in sync by hand. */
const ALLOWED_ROLES = ['presales', 'pm', 'delivery', 'postsales', 'admin'] as const;
type Role = typeof ALLOWED_ROLES[number];

/** Mirror of `AdminUserRecord` in `web/src/types/contracts.ts`. */
interface AdminUserRecord {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  created_at: string;
}

/**
 * Mirror of `AdminUserAction` in `web/src/types/contracts.ts`. Zod validates
 * on the client; we re-validate the runtime shape here as defense-in-depth.
 */
type AdminAction =
  | { action: 'list' }
  | {
    action: 'invite';
    email: string;
    role: Role;
    display_name: string;
    password?: string;
  }
  | { action: 'update-role'; user_id: string; role: Role; display_name?: string }
  | { action: 'set-password'; user_id: string; password: string }
  | { action: 'delete'; user_id: string };

// ─── Response helpers ───────────────────────────────────────────────────────

function jsonOk(data?: unknown): Response {
  // `data` is omitted entirely when undefined so set-password / delete return
  // the minimal `{ ok: true }` envelope the spec calls for.
  const body = data === undefined ? { ok: true } : { ok: true, data };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function envOrThrow(name: string): string {
  const v = Deno.env.get(name);
  if (!v) {
    // Service-role is the secret that makes this function dangerous. If it's
    // missing we refuse to start — never fall back to anon-key + 'best effort'.
    throw new Error(
      `${name} is not set. Configure it as a Supabase Edge Function secret.`,
    );
  }
  return v;
}

// ─── Validation helpers (defense-in-depth) ──────────────────────────────────
// Zod already validates on the client. We re-check here so a misbehaving /
// hand-crafted request can't smuggle in an invalid role, bad UUID, or HTML
// in an email field.

function isValidRole(role: unknown): role is Role {
  return typeof role === 'string' &&
    (ALLOWED_ROLES as readonly string[]).includes(role);
}

function isUuid(v: unknown): v is string {
  return typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function isEmail(v: unknown): v is string {
  // RFC 5322 is famously un-greppable; this pragmatic regex matches every
  // address we care about and rejects spaces / missing @ / missing TLD.
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

// ─── Authorization gate ─────────────────────────────────────────────────────

type RequireAdminResult =
  | {
    ok: true;
    adminUser: User;
    callerId: string;
    adminClient: SupabaseClient<any, any, any>;
    userClient: SupabaseClient<any, any, any>;
  }
  | { ok: false; status: number; response: Response };

/**
 * Verify the caller is an authenticated admin. Returns a tagged result so
 * the caller can `if (!auth.ok) return auth.response;` without nesting.
 *
 * Never logs the JWT or the service-role key — those are secrets.
 */
async function requireAdmin(req: Request): Promise<RequireAdminResult> {
  const supabaseUrl = envOrThrow('SUPABASE_URL');
  const serviceKey = envOrThrow('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  const authHeader = req.headers.get('Authorization') ?? '';
  // Strip "Bearer " prefix; supabase.auth.getUser() takes the bare JWT.
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) {
    return {
      ok: false,
      status: 401,
      response: jsonError('Unauthorized: missing Authorization header', 401),
    };
  }

  // User-scoped client — used only for auth.getUser() verification. We can't
  // share the service-role client here because getUser() would then succeed
  // for any forged caller.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  // Admin client — service_role, RLS bypassed by design. Used for every
  // privileged DB read/write below.
  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return {
      ok: false,
      status: 401,
      response: jsonError('Unauthorized: invalid or expired JWT', 401),
    };
  }
  const caller = userData.user;

  // Role check: read profiles.role via service_role (auth.uid() would otherwise
  // be subject to profiles_select_self_or_admin RLS, which still works for
  // self-read but we want a consistent code path).
  const { data: profile, error: profileErr } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .maybeSingle();

  if (profileErr) {
    return {
      ok: false,
      status: 500,
      response: jsonError(`Failed to read caller profile: ${profileErr.message}`, 500),
    };
  }
  if (profile?.role !== 'admin') {
    return {
      ok: false,
      status: 403,
      response: jsonError('Forbidden: admin role required', 403),
    };
  }

  return {
    ok: true,
    adminUser: caller,
    callerId: caller.id,
    adminClient,
    userClient,
  };
}

// ─── Helpers shared by handlers ─────────────────────────────────────────────

/**
 * ISO 8601 strings sort lexicographically, so we can pick the earlier
 * timestamp with a plain string comparison (no Date parsing needed).
 */
function pickEarlier(a: string, b: string): string {
  return a < b ? a : b;
}

/**
 * The handle_new_user trigger (0003_triggers.sql) creates the profile
 * synchronously inside the auth.users INSERT, but the GoTrue admin API
 * returns before the trigger row is visible on the read replica we then
 * hit. Poll briefly so the subsequent UPDATE finds the row.
 */
async function waitForProfile(
  adminClient: SupabaseClient<any, any, any>,
  userId: string,
  attempts = 10,
  delayMs = 100,
): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    const { data } = await adminClient
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();
    if (data) return;
    await new Promise((r) => setTimeout(r, delayMs));
  }
}

/**
 * Re-fetch a user + their profile and merge them into the AdminUserRecord
 * shape the frontend expects. Returns null if the user or profile is gone
 * (e.g. race with delete).
 */
async function fetchJoinedRecord(
  adminClient: SupabaseClient<any, any, any>,
  userId: string,
): Promise<AdminUserRecord | null> {
  const { data: userData, error: uErr } = await adminClient.auth.admin.getUserById(
    userId,
  );
  if (uErr) throw new Error(`getUserById failed: ${uErr.message}`);
  const u = userData?.user;
  if (!u) return null;

  const { data: prof, error: pErr } = await adminClient
    .from('profiles')
    .select('display_name, role, created_at')
    .eq('id', userId)
    .maybeSingle();
  if (pErr) throw new Error(`profile fetch failed: ${pErr.message}`);
  if (!prof) return null;

  return {
    id: userId,
    email: u.email ?? '',
    display_name: prof.display_name,
    role: prof.role as Role,
    created_at: pickEarlier(u.created_at, prof.created_at),
  };
}

// ─── Action handlers ────────────────────────────────────────────────────────

async function handleList(
  adminClient: SupabaseClient<any, any, any>,
): Promise<Response> {
  // Pull every auth.users row in one page. 1000 is the MVP cap; when an org
  // crosses that we'll need to loop pages, but that's not Phase A scope.
  const { data: listData, error: listErr } = await adminClient.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listErr) throw new Error(`listUsers failed: ${listErr.message}`);
  const authUsers: User[] = listData?.users ?? [];

  // Pull every profile in one query — service_role bypasses RLS.
  const { data: profileRows, error: profErr } = await adminClient
    .from('profiles')
    .select('id, display_name, role, created_at');
  if (profErr) throw new Error(`profiles select failed: ${profErr.message}`);

  const profileById = new Map<
    string,
    { display_name: string; role: string; created_at: string }
  >();
  for (const p of profileRows ?? []) {
    profileById.set(p.id, {
      display_name: p.display_name,
      role: p.role,
      created_at: p.created_at,
    });
  }

  // Inner-join by id. Users without a profile (trigger failed, manual SQL,
  // etc.) are skipped — they shouldn't show up in the admin UI.
  const records: AdminUserRecord[] = [];
  for (const u of authUsers) {
    const prof = profileById.get(u.id);
    if (!prof) continue;
    if (!isValidRole(prof.role)) continue; // defensive: skip corrupt rows
    records.push({
      id: u.id,
      email: u.email ?? '',
      display_name: prof.display_name,
      role: prof.role,
      created_at: pickEarlier(u.created_at, prof.created_at),
    });
  }

  // Most recent first.
  records.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return jsonOk(records);
}

async function handleInvite(
  adminClient: SupabaseClient<any, any, any>,
  body: Extract<AdminAction, { action: 'invite' }>,
): Promise<Response> {
  if (!isEmail(body.email)) return jsonError('invalid_email', 400);
  if (!isValidRole(body.role)) return jsonError('invalid_role', 400);
  if (
    typeof body.display_name !== 'string' ||
    body.display_name.trim().length === 0 ||
    body.display_name.length > 80
  ) {
    return jsonError('invalid_display_name', 400);
  }
  if (
    body.password !== undefined &&
    (typeof body.password !== 'string' || body.password.length < 6)
  ) {
    return jsonError('password_too_short', 400);
  }

  // Two creation paths:
  //   - password supplied  -> createUser (no email sent; we set it directly)
  //   - no password        -> inviteUserByEmail (GoTrue sends a magic link)
  // Both run as the user-confirmed path: createUser uses email_confirm=true,
  // inviteUserByEmail generates a recovery link the user clicks.
  let createdUser: User | null = null;
  if (body.password) {
    const { data, error } = await adminClient.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
    });
    if (error) throw new Error(`createUser failed: ${error.message}`);
    createdUser = data?.user ?? null;
  } else {
    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(
      body.email,
    );
    if (error) throw new Error(`inviteUserByEmail failed: ${error.message}`);
    createdUser = data?.user ?? null;
  }

  if (!createdUser) {
    throw new Error('Auth admin returned no user after creation');
  }

  // The handle_new_user trigger creates the profile with role='pm' and a
  // generic display_name. Wait for it to land, then overwrite both fields
  // with the values the admin specified.
  await waitForProfile(adminClient, createdUser.id);

  const { error: updateErr } = await adminClient
    .from('profiles')
    .update({
      role: body.role,
      display_name: body.display_name.trim(),
    })
    .eq('id', createdUser.id);
  if (updateErr) throw new Error(`profile update failed: ${updateErr.message}`);

  const record = await fetchJoinedRecord(adminClient, createdUser.id);
  if (!record) {
    throw new Error('Profile not found immediately after invite');
  }
  return jsonOk(record);
}

async function handleUpdateRole(
  adminClient: SupabaseClient<any, any, any>,
  body: Extract<AdminAction, { action: 'update-role' }>,
): Promise<Response> {
  if (!isUuid(body.user_id)) return jsonError('invalid_user_id', 400);
  if (!isValidRole(body.role)) return jsonError('invalid_role', 400);
  if (
    body.display_name !== undefined &&
    (typeof body.display_name !== 'string' ||
      body.display_name.trim().length === 0 ||
      body.display_name.length > 80)
  ) {
    return jsonError('invalid_display_name', 400);
  }

  const updates: Record<string, string> = { role: body.role };
  if (body.display_name !== undefined) {
    updates.display_name = body.display_name.trim();
  }

  const { error } = await adminClient
    .from('profiles')
    .update(updates)
    .eq('id', body.user_id);
  if (error) throw new Error(`profile update failed: ${error.message}`);

  const record = await fetchJoinedRecord(adminClient, body.user_id);
  if (!record) return jsonError('user_not_found', 404);
  return jsonOk(record);
}

async function handleSetPassword(
  adminClient: SupabaseClient<any, any, any>,
  body: Extract<AdminAction, { action: 'set-password' }>,
): Promise<Response> {
  if (!isUuid(body.user_id)) return jsonError('invalid_user_id', 400);
  if (typeof body.password !== 'string' || body.password.length < 6) {
    return jsonError('password_too_short', 400);
  }

  const { error } = await adminClient.auth.admin.updateUserById(body.user_id, {
    password: body.password,
  });
  if (error) throw new Error(`updateUserById failed: ${error.message}`);
  // Spec: no record needed, just confirmation.
  return jsonOk();
}

async function handleDelete(
  adminClient: SupabaseClient<any, any, any>,
  body: Extract<AdminAction, { action: 'delete' }>,
): Promise<Response> {
  if (!isUuid(body.user_id)) return jsonError('invalid_user_id', 400);

  // deleteUser cascades to public.profiles via the FK declared in
  // 0001_init.sql (id references auth.users(id) on delete cascade).
  const { error } = await adminClient.auth.admin.deleteUser(body.user_id);
  if (error) throw new Error(`deleteUser failed: ${error.message}`);
  return jsonOk();
}

// ─── Main handler ───────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS preflight — must run before anything else so OPTIONS never needs auth.
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') {
    return jsonError('method_not_allowed', 405);
  }

  // 1. Verify the caller is an authenticated admin. This runs BEFORE we
  //    parse the body so unauthenticated callers can't probe action shapes.
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  // 2. Parse JSON body. Empty / malformed -> 400.
  let body: AdminAction;
  try {
    const text = await req.text();
    if (!text) throw new Error('empty body');
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.action !== 'string') {
      throw new Error('missing action field');
    }
    body = parsed as AdminAction;
  } catch (e) {
    return jsonError(`invalid_json: ${(e as Error).message}`, 400);
  }

  // 3. Dispatch. Each handler does its own per-field validation. Errors are
  //    converted to `{ ok: false, error }` with HTTP 500.
  try {
    switch (body.action) {
      case 'list':
        return await handleList(auth.adminClient);

      case 'invite':
        return await handleInvite(auth.adminClient, body);

      case 'update-role':
        return await handleUpdateRole(auth.adminClient, body);

      case 'set-password':
        return await handleSetPassword(auth.adminClient, body);

      case 'delete':
        return await handleDelete(auth.adminClient, body);

      default: {
        // Exhaustiveness guard — if a new action lands in the union without
        // a case here, this assignment fails to type-check at build time.
        const _exhaustive: never = body;
        return jsonError(`unknown_action: ${String(_exhaustive)}`, 400);
      }
    }
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    console.error('[admin-users] action failed:', msg);
    return jsonError(msg, 500);
  }
});