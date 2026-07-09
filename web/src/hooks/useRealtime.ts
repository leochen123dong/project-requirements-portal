import { useEffect } from 'react';
import { supabase } from '../api/supabase';

/**
 * Subscribe to a Postgres table's realtime changes.
 * Phase 0 stub — Phase 2a will use this for live comments, milestone updates, etc.
 *
 * IMPORTANT: the underlying table must have `REPLICA IDENTITY FULL` and be added
 * to the `supabase_realtime` publication (Phase 1 backend-dev will set this up).
 */
export function useRealtime<T = unknown>(
  table: string,
  onChange: (payload: { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new: T; old: T }) => void,
  filter?: string,
) {
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel(`rt-${table}-${filter ?? 'all'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        (payload) => {
          onChange(payload as unknown as { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new: T; old: T });
        },
      )
      .subscribe();
    return () => {
      supabase?.removeChannel(channel);
    };
  }, [table, filter, onChange]);
}