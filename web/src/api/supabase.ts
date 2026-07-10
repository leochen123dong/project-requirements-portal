/**
 * Supabase client. Typed via a hand-written `Database` type that mirrors
 * `supabase/migrations/0001_init.sql`. Run `supabase gen types typescript`
 * later to regenerate, but this stub keeps the frontend usable without
 * a connected Supabase project at type-check time.
 *
 * If env is not configured, we return null so the app can render a setup hint
 * instead of crashing on first import.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Profile } from '../types/contracts';

// ─── Database type stub ────────────────────────────────────────────────────
// Column names exactly match the snake_case columns in 0001_init.sql.
// `Insert` makes `id` / `created_at` / `updated_at` optional (Postgres
// defaults fill them in). `Update` makes every field optional (partial updates).
//
// When Supabase is connected, regenerate this with:
//   supabase gen types typescript --project-id <ref> > web/src/types/database.ts
// and re-export from there.
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          role: 'presales' | 'pm' | 'delivery' | 'postsales' | 'admin';
          created_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          role: 'presales' | 'pm' | 'delivery' | 'postsales' | 'admin';
          created_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          role?: 'presales' | 'pm' | 'delivery' | 'postsales' | 'admin';
          created_at?: string;
        };
      };
      opportunities: {
        Row: {
          id: string;
          name: string;
          customer: string;
          amount: number | null;
          stage: 'lead' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';
          owner_id: string;
          // v0.4 Phase C: role-specific staff columns. Both nullable; existing
          // rows have NULL until backfill / handover. `owner_id` is retained
          // as the original creator for backwards compatibility.
          presales_id: string | null;
          delivery_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          customer: string;
          amount?: number | null;
          stage?: 'lead' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';
          owner_id: string;
          presales_id?: string | null;
          delivery_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          customer?: string;
          amount?: number | null;
          stage?: 'lead' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';
          owner_id?: string;
          presales_id?: string | null;
          delivery_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      projects: {
        Row: {
          id: string;
          opportunity_id: string;
          name: string;
          pm_id: string;
          delivery_id: string | null;  // v0.4
          status: 'initiated' | 'in_progress' | 'accepted' | 'closed';
          ithub_ticket_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          opportunity_id: string;
          name: string;
          pm_id: string;
          delivery_id?: string | null;  // v0.4
          status?: 'initiated' | 'in_progress' | 'accepted' | 'closed';
          ithub_ticket_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          opportunity_id?: string;
          name?: string;
          pm_id?: string;
          status?: 'initiated' | 'in_progress' | 'accepted' | 'closed';
          ithub_ticket_id?: string | null;
          created_at?: string;
        };
      };
      milestones: {
        Row: {
          id: string;
          project_id: string;
          name: string;
          phase: string;
          due_date: string;
          status: 'pending' | 'in_progress' | 'done' | 'blocked';
          order: number;
        };
        Insert: {
          id?: string;
          project_id: string;
          name: string;
          phase: string;
          due_date: string;
          status?: 'pending' | 'in_progress' | 'done' | 'blocked';
          order?: number;
        };
        Update: {
          id?: string;
          project_id?: string;
          name?: string;
          phase?: string;
          due_date?: string;
          status?: 'pending' | 'in_progress' | 'done' | 'blocked';
          order?: number;
        };
      };
      tasks: {
        Row: {
          id: string;
          milestone_id: string;
          assignee_id: string;
          title: string;
          done: boolean;
          due_date: string | null;
        };
        Insert: {
          id?: string;
          milestone_id: string;
          assignee_id: string;
          title: string;
          done?: boolean;
          due_date?: string | null;
        };
        Update: {
          id?: string;
          milestone_id?: string;
          assignee_id?: string;
          title?: string;
          done?: boolean;
          due_date?: string | null;
        };
      };
      comments: {
        Row: {
          id: string;
          target_type: 'opportunity' | 'project' | 'milestone' | 'task';
          target_id: string;
          author_id: string;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          target_type: 'opportunity' | 'project' | 'milestone' | 'task';
          target_id: string;
          author_id: string;
          body: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          target_type?: 'opportunity' | 'project' | 'milestone' | 'task';
          target_id?: string;
          author_id?: string;
          body?: string;
          created_at?: string;
        };
      };
      artifacts: {
        Row: {
          id: string;
          artifact_definition_id: string | null;  // v0.4
          type: 'HT-JL-01' | 'HT-JL-02' | 'HT-JL-03-1' | 'SOW' | 'CONTRACT';
          project_id: string | null;              // v0.4: nullable
          opportunity_id: string | null;          // v0.4: pre-handover upload
          storage_path: string;
          uploaded_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          artifact_definition_id?: string | null;
          type: 'HT-JL-01' | 'HT-JL-02' | 'HT-JL-03-1' | 'SOW' | 'CONTRACT';
          project_id?: string | null;
          opportunity_id?: string | null;
          storage_path: string;
          uploaded_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          artifact_definition_id?: string | null;
          type?: 'HT-JL-01' | 'HT-JL-02' | 'HT-JL-03-1' | 'SOW' | 'CONTRACT';
          project_id?: string | null;
          opportunity_id?: string | null;
          storage_path?: string;
          uploaded_by?: string;
          created_at?: string;
        };
      };
      audit_log: {
        Row: {
          id: string;
          actor_id: string | null;
          action: string;
          entity: string;
          entity_id: string | null;
          at: string;
          // jsonb on the wire (snake_case keys: full NEW/OLD row snapshot from
          // the 0008 trigger). Typed as a generic object map; the frontend
          // accesses named fields like `payload.stage` for diff rendering.
          // v0.4 Phase A.
          payload: Record<string, unknown> | null;
        };
        // INSERT happens via trigger (SECURITY DEFINER), but we expose the
        // shape for completeness — admins querying via service_role.
        Insert: {
          id?: string;
          actor_id?: string | null;
          action: string;
          entity: string;
          entity_id?: string | null;
          at?: string;
          // v0.4 Phase A: trigger populates this; admin tools may set
          // explicitly via service_role.
          payload?: Record<string, unknown> | null;
        };
        // audit_log is append-only; no Update shape used. Kept for
        // structural parity with other tables.
        Update: {
          id?: string;
          actor_id?: string | null;
          action?: string;
          entity?: string;
          entity_id?: string | null;
          at?: string;
          payload?: Record<string, unknown> | null;
        };
      };
      ithub_tickets: {
        Row: {
          id: string;
          project_id: string;
          ithub_id: string;
          subject: string;
          status: string;
          sla_breach_at: string | null;
          last_synced_at: string;
        };
        // INSERT/UPDATE are by service_role (Edge Function) — these shapes
        // exist for type completeness and for test fixtures.
        Insert: {
          id?: string;
          project_id: string;
          ithub_id: string;
          subject: string;
          status: string;
          sla_breach_at?: string | null;
          last_synced_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          ithub_id?: string;
          subject?: string;
          status?: string;
          sla_breach_at?: string | null;
          last_synced_at?: string;
        };
      };
      ithub_sync_log: {
        Row: {
          id: string;
          ran_at: string;
          tickets_pulled: number;
          errors: string | null;
        };
        Insert: {
          id?: string;
          ran_at?: string;
          tickets_pulled?: number;
          errors?: string | null;
        };
        Update: {
          id?: string;
          ran_at?: string;
          tickets_pulled?: number;
          errors?: string | null;
        };
      };
      // ─── Phase B (v0.2): opportunity custom fields ──────────────────────
      // Mirrors supabase/migrations/0004_opportunity_custom_fields.sql.
      // `options` is jsonb on the wire (a JSON array of strings), typed here
      // as string[] | null. `value` is always text; the UI casts per `type`.
      opportunity_field_definitions: {
        Row: {
          id: string;
          name: string;
          label: string;
          type: 'text' | 'number' | 'date' | 'select';
          options: string[] | null;
          required: boolean;
          display_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          label: string;
          type: 'text' | 'number' | 'date' | 'select';
          options?: string[] | null;
          required?: boolean;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          label?: string;
          type?: 'text' | 'number' | 'date' | 'select';
          options?: string[] | null;
          required?: boolean;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
      };
      opportunity_field_values: {
        Row: {
          opportunity_id: string;
          field_id: string;
          value: string | null;
        };
        Insert: {
          opportunity_id: string;
          field_id: string;
          value?: string | null;
        };
        Update: {
          opportunity_id?: string;
          field_id?: string;
          value?: string | null;
        };
      };
      // ─── Phase B (v0.4): opportunity tag definitions (admin vocabulary) ──
      // Mirrors supabase/migrations/0009_opportunity_tag_definitions.sql.
      // `tag` is the machine name (snake_case + hyphens); `label` is the
      // human display. `color` matches the SQL CHECK constraint exactly
      // (literal union). Admin writes; all authenticated read active rows.
      opportunity_tag_definitions: {
        Row: {
          id: string;
          tag: string;
          label: string;
          color: 'tag-info' | 'tag-success' | 'tag-warning' | 'tag-danger' | 'tag-neutral';
          display_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          tag: string;
          label: string;
          color?: 'tag-info' | 'tag-success' | 'tag-warning' | 'tag-danger' | 'tag-neutral';
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          tag?: string;
          label?: string;
          color?: 'tag-info' | 'tag-success' | 'tag-warning' | 'tag-danger' | 'tag-neutral';
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
      };
      // ─── Phase B (v0.4): opportunity tag values (per-opportunity join) ───
      // Composite PK (opportunity_id, tag_id). Insert-or-delete only — tags
      // are managed through the definitions table, never mutated in place.
      // Update is `never` to mirror the RLS (no UPDATE policy exists).
      opportunity_tag_values: {
        Row: {
          opportunity_id: string;
          tag_id: string;
          created_at: string;
        };
        Insert: {
          opportunity_id: string;
          tag_id: string;
          created_at?: string;
        };
        Update: never;
      };
      artifact_definitions: {
        Row: {
          id: string;
          type: string;
          label: string;
          description: string | null;
          is_required: boolean;
          display_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          type: string;
          label: string;
          description?: string | null;
          is_required?: boolean;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          type?: string;
          label?: string;
          description?: string | null;
          is_required?: boolean;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: {
      current_role: { Args: Record<string, never>; Returns: string | null };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient<Database> | null =
  url && anonKey ? createClient<Database>(url, anonKey) : null;

/**
 * Future: replace Database with the generated file:
 *
 *   import type { Database } from '../types/database';
 *   export const supabase = createClient<Database>(url, anonKey);
 *
 * Regenerated via: supabase gen types typescript --project-id <ref> > web/src/types/database.ts
 */

// ─── Helpers (used by Phase 2a pages) ──────────────────────────────────────

export async function signInWithMagicLink(email: string, redirectTo?: string) {
  if (!supabase) throw new Error('Supabase 未配置 (检查 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)');
  return supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo ?? window.location.origin + '/#/home' },
  });
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

/**
 * Password sign-in (added because Supabase free tier rate-limits magic-link
 * emails at ~4/hour). The user must have a password set (via Supabase
 * Dashboard → Auth → Users → "Send recovery email" or via SQL with crypt()).
 */
export async function signInWithPassword(email: string, password: string) {
  if (!supabase) throw new Error('Supabase 未配置');
  return supabase.auth.signInWithPassword({ email, password });
}

/**
 * Fetch the profile row for `userId`.
 * Returns `null` if the profile doesn't exist yet (e.g. trigger hasn't fired)
 * or if Supabase isn't configured.
 */
export async function fetchProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  // Database['public']['Tables']['profiles']['Row'] is structurally the same
  // as Profile, but we cast explicitly to avoid TS drift surprises.
  return data as unknown as Profile;
}
