// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { ITHubClient, type ITHubRawTicket } from '../_shared/ithubClient.ts';

/**
 * Edge Function: itHub Sync
 *
 * Pulls tickets (and their SLA timers) from the ITHub ServiceDesk API and
 * upserts them into the `public.ithub_tickets` table. Logs each run to
 * `public.ithub_sync_log` so the admin dashboard can show "last sync time".
 *
 * Modes:
 *   - MOCK  (env ITHUB_MOCK=true): returns 3 hard-coded tickets covering
 *           different SLA states. Does NOT touch the database. Used by
 *           Phase 0/2a build verification and offline demos.
 *   - REAL: pulls from ITHub via ITHubClient, upserts rows, writes log.
 *
 * Auth: requires a logged-in user with role in (admin, postsales).
 * Mock mode is the only path that bypasses this requirement, so the frontend
 * can still render in unauthenticated demo deployments.
 */

// ─── Request / Response shapes ──────────────────────────────────────────────

interface SyncRequest {
  /** Optional project_id — if provided, scopes the run to a single project. */
  project_id?: string | null;
}

interface SyncResponse {
  tickets: SyncTicket[];
  pulled: number;
  errors: string[];
  ran_at: string;
}

interface SyncTicket {
  id: string;
  project_id: string;
  ithub_id: string;
  subject: string;
  status: string;
  sla_breach_at: string | null;
  last_synced_at: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function envOrThrow(name: string): string {
  const v = Deno.env.get(name);
  if (!v) {
    throw new Error(
      `${name} is not set. Configure it as a Supabase Edge Function secret.`,
    );
  }
  return v;
}

/**
 * Build a deterministic-ish project_id for the mock branch: re-use the
 * caller-supplied project_id, or fall back to a fixed placeholder so multiple
 * mock runs return rows that line up with the seed data in supabase/seed.sql.
 */
function mockProjectId(provided?: string | null): string {
  return provided ?? '00000000-0000-0000-0000-000000000aaa';
}

function mockResponse(providedProjectId: string | null | undefined): SyncResponse {
  const now = new Date().toISOString();
  const projectId = mockProjectId(providedProjectId);
  const tickets: SyncTicket[] = [
    {
      id: '00000000-0000-0000-0000-000000000001',
      project_id: projectId,
      ithub_id: 'T-1001',
      subject: '【示例】核心交换机故障 — 客户机房',
      status: 'open',
      sla_breach_at: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
      last_synced_at: now,
    },
    {
      id: '00000000-0000-0000-0000-000000000002',
      project_id: projectId,
      ithub_id: 'T-1002',
      subject: '【示例】防火墙策略优化请求',
      status: 'in_progress',
      sla_breach_at: new Date(Date.now() + 28 * 3600 * 1000).toISOString(),
      last_synced_at: now,
    },
    {
      id: '00000000-0000-0000-0000-000000000003',
      project_id: projectId,
      ithub_id: 'T-0998',
      subject: '【示例】服务器扩容 — 已关闭',
      status: 'closed',
      sla_breach_at: null,
      last_synced_at: now,
    },
  ];
  return { tickets, pulled: tickets.length, errors: [], ran_at: now };
}

/**
 * Map a raw ITHub ticket to the Postgres row shape. We can't construct a
 * UUID for `id` from ITHub's string id, so we let Postgres generate one and
 * match on `ithub_id` in the UPSERT conflict clause.
 */
function toUpsertRow(
  raw: ITHubRawTicket,
  projectId: string,
): {
  project_id: string;
  ithub_id: string;
  subject: string;
  status: string;
  sla_breach_at: string | null;
  last_synced_at: string;
} {
  return {
    project_id: projectId,
    ithub_id: raw.id,
    subject: raw.subject,
    status: raw.status,
    sla_breach_at: raw.sla_breach_at ?? null,
    last_synced_at: new Date().toISOString(),
  };
}

// ─── Main handler ───────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS preflight — handled first so OPTIONS requests never need auth.
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  // 1. MOCK short-circuit. No DB, no auth — keeps the demo build verifiable
  //    even when Supabase isn't connected.
  if (Deno.env.get('ITHUB_MOCK') === 'true') {
    let body: SyncRequest = {};
    try {
      // Empty body is fine for mock mode.
      const text = await req.text();
      body = text ? (JSON.parse(text) as SyncRequest) : {};
    } catch {
      body = {};
    }
    return jsonResponse(mockResponse(body.project_id ?? null));
  }

  // 2. Real mode: parse body, set up clients, verify auth.
  let body: SyncRequest = {};
  try {
    const text = await req.text();
    body = text ? (JSON.parse(text) as SyncRequest) : {};
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const supabaseUrl = envOrThrow('SUPABASE_URL');
  const serviceKey = envOrThrow('SUPABASE_SERVICE_ROLE_KEY');
  const authHeader = req.headers.get('Authorization') ?? '';

  // Client scoped to the caller's JWT — used for getUser() verification.
  // We can't share a single client because the service-role client would
  // impersonate any caller when reading profiles.role.
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) {
    return jsonResponse({ error: 'Unauthorized: missing or invalid JWT' }, 401);
  }

  // 3. Role check — only admin / postsales may trigger a sync.
  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
  const { data: profile, error: profileErr } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (profileErr) {
    return jsonResponse(
      { error: `Failed to read profile: ${profileErr.message}` },
      500,
    );
  }
  const role = profile?.role as string | undefined;
  if (role !== 'admin' && role !== 'postsales') {
    return jsonResponse(
      { error: `Forbidden: role '${role ?? 'unknown'}' cannot trigger sync` },
      403,
    );
  }

  // 4. Determine checkpoint (last successful sync time, in Unix ms).
  const { data: lastSync, error: syncLogErr } = await adminClient
    .from('ithub_sync_log')
    .select('ran_at')
    .order('ran_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (syncLogErr) {
    // Non-fatal — fall back to "no checkpoint, pull everything".
    console.warn('[ithub-sync] failed to read sync log', syncLogErr.message);
  }
  const sinceMs = lastSync?.ran_at
    ? new Date(lastSync.ran_at as string).getTime()
    : undefined;

  // 5. Pull from ITHub. Surface errors via the errors array (per spec) rather
  //    than throwing, so partial successes still produce a useful response.
  const errors: string[] = [];
  let rawTickets: ITHubRawTicket[] = [];
  try {
    const client = new ITHubClient();
    rawTickets = await client.listTickets(sinceMs);
  } catch (e) {
    const msg = `ITHub listTickets failed: ${(e as Error).message}`;
    console.error('[ithub-sync]', msg);
    errors.push(msg);

    // Log the failed run so the admin dashboard can surface it.
    await adminClient.from('ithub_sync_log').insert({
      ran_at: new Date().toISOString(),
      tickets_pulled: 0,
      errors: msg,
    });

    return jsonResponse({
      tickets: [],
      pulled: 0,
      errors,
      ran_at: new Date().toISOString(),
    });
  }

  // 6. Resolve target project(s). If `body.project_id` is set we only upsert
  //    tickets for that project; otherwise we need a deterministic mapping —
  //    ITHub's tickets don't carry our UUID, so in the unscoped case we leave
  //    `project_id` unset and let the upsert fail loudly rather than silently
  //    attach tickets to the wrong project. The seed.sql pre-creates three
  //    demo tickets so the unscoped case still renders something useful.
  const targetProjectId = body.project_id ?? null;

  // 7. Upsert each ticket. `onConflict: 'ithub_id'` is the unique constraint
  //    declared in 0001_init.sql. Errors are collected, not thrown.
  let pulled = 0;
  for (const raw of rawTickets) {
    if (!targetProjectId) {
      errors.push(
        `Skipped ${raw.id}: no project_id provided and ITHub tickets are not yet ` +
          `bound to portal projects by external id. Run with { project_id } or pre-bind.`,
      );
      continue;
    }
    const row = toUpsertRow(raw, targetProjectId);
    const { error: upsertErr } = await adminClient
      .from('ithub_tickets')
      .upsert(row, { onConflict: 'ithub_id' });
    if (upsertErr) {
      errors.push(`Upsert ${raw.id} failed: ${upsertErr.message}`);
      continue;
    }
    pulled += 1;
  }

  // 8. Write sync log (success or partial). errors is null on full success.
  const ranAt = new Date().toISOString();
  const logErrors = errors.length > 0 ? errors.join('\n') : null;
  const { error: logErr } = await adminClient.from('ithub_sync_log').insert({
    ran_at: ranAt,
    tickets_pulled: pulled,
    errors: logErrors,
  });
  if (logErr) {
    console.error('[ithub-sync] failed to write sync log', logErr.message);
    errors.push(`Sync log write failed: ${logErr.message}`);
  }

  // 9. Re-read the tickets we just wrote so the response matches the
  //    ITHubSyncResult shape the frontend expects.
  const { data: stored, error: readErr } = await adminClient
    .from('ithub_tickets')
    .select('*')
    .order('last_synced_at', { ascending: false })
    .limit(200);
  if (readErr) {
    errors.push(`Read-back failed: ${readErr.message}`);
  }

  return jsonResponse({
    tickets: (stored ?? []) as SyncTicket[],
    pulled,
    errors,
    ran_at: ranAt,
  });
});