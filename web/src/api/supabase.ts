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
          status: 'initiated' | 'in_progress' | 'accepted' | 'closed';
          ithub_ticket_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          opportunity_id: string;
          name: string;
          pm_id: string;
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
          project_id: string;
          type: 'HT-JL-01' | 'HT-JL-02' | 'HT-JL-03-1' | 'SOW' | 'CONTRACT';
          storage_path: string;
          uploaded_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          type: 'HT-JL-01' | 'HT-JL-02' | 'HT-JL-03-1' | 'SOW' | 'CONTRACT';
          storage_path: string;
          uploaded_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          type?: 'HT-JL-01' | 'HT-JL-02' | 'HT-JL-03-1' | 'SOW' | 'CONTRACT';
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
        };
        Update: {
          id?: string;
          actor_id?: string | null;
          action?: string;
          entity?: string;
          entity_id?: string | null;
          at?: string;
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
