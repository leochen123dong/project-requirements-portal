/**
 * ITHub integration helper.
 * Phase 0 stub — Phase 2b backend-dev will implement the actual Edge Function.
 * The frontend always goes through this helper (never calls ITHub directly,
 * so the API Key stays on the server side).
 */

import { supabase } from './supabase';
import type { ITHubTicket } from '../types/contracts';

export interface ITHubSyncResult {
  tickets: ITHubTicket[];
  pulled: number;
  errors: string[];
  ran_at: string;
}

/**
 * Invoke the ithub-sync Edge Function. Returns mock data if `VITE_ITHUB_MOCK=true`
 * or if the Edge Function is not yet deployed.
 */
export async function syncITHubTickets(projectId?: string): Promise<ITHubSyncResult> {
  if (!supabase) {
    return mockTickets(projectId);
  }
  try {
    const { data, error } = await supabase.functions.invoke<ITHubSyncResult>('ithub-sync', {
      body: { project_id: projectId ?? null },
    });
    if (error) throw error;
    return data ?? mockTickets(projectId);
  } catch (e) {
    console.warn('[ithub-sync] Edge Function unavailable, returning mock data', e);
    return mockTickets(projectId);
  }
}

/** Build a URL that deep-links to the ITHub ticket UI (best effort — adjust to your instance). */
export function ithubTicketUrl(ithubId: string): string {
  const base = (import.meta.env.VITE_ITHUB_PORTAL_BASE as string | undefined) ?? 'https://demo.logicalisservice.com';
  return `${base}/tickets/${encodeURIComponent(ithubId)}`;
}

// ─── Mock data for Phase 0 build verification ──────────────────────────────
function mockTickets(projectId?: string): ITHubSyncResult {
  const now = new Date().toISOString();
  return {
    tickets: [
      {
        id: '00000000-0000-0000-0000-000000000001',
        project_id: projectId ?? '00000000-0000-0000-0000-000000000aaa',
        ithub_id: 'T-1001',
        subject: '【示例】核心交换机故障 — 客户机房',
        status: 'open',
        sla_breach_at: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
        last_synced_at: now,
      },
      {
        id: '00000000-0000-0000-0000-000000000002',
        project_id: projectId ?? '00000000-0000-0000-0000-000000000aaa',
        ithub_id: 'T-1002',
        subject: '【示例】防火墙策略优化请求',
        status: 'in_progress',
        sla_breach_at: new Date(Date.now() + 28 * 3600 * 1000).toISOString(),
        last_synced_at: now,
      },
      {
        id: '00000000-0000-0000-0000-000000000003',
        project_id: projectId ?? '00000000-0000-0000-0000-000000000aaa',
        ithub_id: 'T-0998',
        subject: '【示例】服务器扩容 — 已关闭',
        status: 'closed',
        sla_breach_at: null,
        last_synced_at: now,
      },
    ],
    pulled: 3,
    errors: [],
    ran_at: now,
  };
}