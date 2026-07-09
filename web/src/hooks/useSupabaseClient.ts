/**
 * Supabase typing workaround.
 *
 * The Database type shipped in `api/supabase.ts` defines per-table shapes
 * (Row/Insert/Update) but omits the `Relationships: []` field required by
 * `postgrest-js`'s GenericSchema. Without that, `Database['public']` does
 * NOT satisfy GenericSchema, and the `Schema` generic parameter of
 * SupabaseClient falls back to `never` — which makes `.update()` and
 * `.insert()` parameters type as `never`.
 *
 * Rather than modify `api/supabase.ts` (forbidden for this agent), we
 * `as unknown as` to a properly-shaped schema here, exactly once per file.
 *
 * Usage:
 *   import { supabase } from '../api/supabase';
 *   import { asTypedClient } from '../hooks/useSupabaseClient';
 *   const client = asTypedClient(supabase);
 *   await client.from('tasks').update({ done: true });
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../api/supabase';

/**
 * A schema-compatible copy of Database['public'] that adds the missing
 * `Relationships: []` array to each table. Required by postgrest-js ≥ 1.x.
 */
type PatchedDatabase = {
  public: {
    Tables: {
      [K in keyof Database['public']['Tables']]: Database['public']['Tables'][K] & {
        Relationships: [];
      };
    };
    Views: Database['public']['Views'];
    Functions: Database['public']['Functions'];
    Enums: Database['public']['Enums'];
    CompositeTypes: Database['public']['CompositeTypes'];
  };
};

type TypedClient = SupabaseClient<PatchedDatabase>;

export function asTypedClient(client: SupabaseClient<Database> | null): TypedClient | null {
  return client as unknown as TypedClient | null;
}
