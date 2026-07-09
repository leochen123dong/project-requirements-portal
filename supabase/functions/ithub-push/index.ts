// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { ITHubClient } from '../_shared/ithubClient.ts';

/**
 * Edge Function: itHub Push
 *
 * Pushes a status update for a ticket back to ITHub. Best-effort: if the
 * upstream push fails (network, auth, schema mismatch) we still return 200
 * with `{ pushed: false, error }` so the frontend can surface a warning
 * rather than crash the page.
 *
 * Auth: requires a logged-in user with role in (admin, postsales).
 * Mock mode (ITHUB_MOCK=true) skips both auth and the upstream call.
 */

// ─── Request / Response shapes ──────────────────────────────────────────────

interface PushRequest {
  ithub_id: string;
  status: string;
  note: string;
}

interface PushResponse {
  pushed: boolean;
  mock?: boolean;
  error?: string;
}

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

Deno.serve(async (req: Request) => {
  // CORS preflight first.
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  // Parse body once — both mock and real paths need it.
  let body: PushRequest;
  try {
    const text = await req.text();
    body = text ? (JSON.parse(text) as PushRequest) : ({} as PushRequest);
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }
  if (!body.ithub_id || !body.status) {
    return jsonResponse({ error: 'ithub_id and status are required' }, 400);
  }

  // 1. Mock short-circuit — no auth, no upstream call.
  if (Deno.env.get('ITHUB_MOCK') === 'true') {
    console.log('[ithub-push] mock mode', body);
    return jsonResponse({ pushed: true, mock: true });
  }

  // 2. Real mode: JWT verify + role check.
  const supabaseUrl = envOrThrow('SUPABASE_URL');
  const serviceKey = envOrThrow('SUPABASE_SERVICE_ROLE_KEY');
  const authHeader = req.headers.get('Authorization') ?? '';

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
      { error: `Forbidden: role '${role ?? 'unknown'}' cannot push status` },
      403,
    );
  }

  // 3. Best-effort upstream push. Per spec, we return 200 with `pushed: false`
  //    on failure so the frontend can show a warning without crashing.
  try {
    const client = new ITHubClient();
    await client.pushStatus(body.ithub_id, body.status, body.note ?? '');
    return jsonResponse({ pushed: true });
  } catch (e) {
    const msg = (e as Error).message;
    console.error('[ithub-push] upstream push failed', msg);
    return jsonResponse({ pushed: false, error: msg });
  }
});