import { useEffect, useState } from 'react';
import { syncITHubTickets } from '../api/ithub';
import { supabase } from '../api/supabase';
import { asTypedClient } from '../hooks/useSupabaseClient';
import { useToast } from '../hooks/useToast';
import { useRole } from '../hooks/useRole';
import { canSyncITHub } from '../utils/rbac';
import type { ITHubTicket } from '../types/contracts';
import EmptyState from '../components/EmptyState';
import ITHubTicketCard from '../components/ITHubTicketCard';
import ChartCard from '../components/ChartCard';
import BarChart from '../components/BarChart';

type Tab = 'open' | 'all';

/**
 * ITHub ticket list. Pulls from local `ithub_tickets` table (populated by
 * Edge Function), shows SLA countdown per row, and exposes a manual "同步"
 * button that triggers an Edge Function call.
 */
export default function TicketsPage() {
  const role = useRole();
  const toast = useToast();
  const client = asTypedClient(supabase);

  const [tab, setTab] = useState<Tab>('open');
  const [tickets, setTickets] = useState<ITHubTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<ITHubSyncState | null>(null);

  const fetchTickets = async () => {
    if (!client) {
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await client
        .from('ithub_tickets')
        .select('*')
        .order('sla_breach_at', { ascending: true, nullsFirst: false });
      if (error) throw error;
      setTickets((data ?? []) as unknown as ITHubTicket[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载工单失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await syncITHubTickets();
      setLastSync({
        ran_at: res.ran_at,
        pulled: res.pulled,
        errors: res.errors.length,
      });
      toast.success(
        res.errors.length
          ? `同步完成,拉取 ${res.pulled} 条,${res.errors.length} 个错误(可能为 Mock 数据)`
          : `同步完成,拉取 ${res.pulled} 条工单`,
      );
      // Refetch from DB so we reflect the (possibly new) rows.
      await fetchTickets();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '同步失败');
    } finally {
      setSyncing(false);
    }
  };

  const visible = tab === 'open'
    ? tickets.filter((t) => t.status !== 'closed' && t.status !== 'resolved')
    : tickets;

  // Phase C: SLA distribution buckets.
  //   breached = sla_breach_at < now AND status != closed/resolved
  //   warning  = sla_breach_at within 24h AND status != closed/resolved
  //   ok       = everything else (incl. closed/resolved)
  const slaData = (() => {
    const now = Date.now();
    const dayMs = 24 * 3600 * 1000;
    let breached = 0;
    let warning = 0;
    let ok = 0;
    for (const t of tickets) {
      const isOpen = t.status !== 'closed' && t.status !== 'resolved';
      const breachAt = t.sla_breach_at ? new Date(t.sla_breach_at).getTime() : null;
      if (isOpen && breachAt !== null && breachAt < now) {
        breached++;
      } else if (isOpen && breachAt !== null && breachAt - now < dayMs) {
        warning++;
      } else {
        ok++;
      }
    }
    return [
      { label: '已超时', value: breached },
      { label: '24h 内', value: warning },
      { label: '正常', value: ok },
    ];
  })();
  const slaEmpty = !loading && tickets.length === 0;

  const canSync = canSyncITHub(role);

  if (!client) {
    return (
      <div className="container">
        <div className="page-header">
          <div>
            <h1 className="page-title">售后工单</h1>
            <p className="page-subtitle">来自 ITHub 的工单与 SLA</p>
          </div>
        </div>
        <div className="card">
          <EmptyState
            title="演示模式"
            description="Supabase 未配置,显示 3 条 Mock 工单用于演示 SLA 倒计时。"
            action={
              <button className="btn btn-secondary btn-sm" onClick={handleSync}>
                加载 Mock 数据
              </button>
            }
          />
          {lastSync && (
            <div className="grid-cards" style={{ marginTop: 16 }}>
              {[
                {
                  id: '00000000-0000-0000-0000-000000000001',
                  project_id: '00000000-0000-0000-0000-000000000aaa',
                  ithub_id: 'T-1001',
                  subject: '【示例】核心交换机故障 — 客户机房',
                  status: 'open',
                  sla_breach_at: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
                  last_synced_at: new Date().toISOString(),
                },
                {
                  id: '00000000-0000-0000-0000-000000000002',
                  project_id: '00000000-0000-0000-0000-000000000aaa',
                  ithub_id: 'T-1002',
                  subject: '【示例】防火墙策略优化请求',
                  status: 'in_progress',
                  sla_breach_at: new Date(Date.now() + 28 * 3600 * 1000).toISOString(),
                  last_synced_at: new Date().toISOString(),
                },
                {
                  id: '00000000-0000-0000-0000-000000000003',
                  project_id: '00000000-0000-0000-0000-000000000aaa',
                  ithub_id: 'T-0998',
                  subject: '【示例】服务器扩容 — 已关闭',
                  status: 'closed',
                  sla_breach_at: null,
                  last_synced_at: new Date().toISOString(),
                },
              ].map((t) => (
                <ITHubTicketCard key={t.id} ticket={t} showLink={false} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1 className="page-title">售后工单</h1>
          <p className="page-subtitle">
            来自 ITHub · 共 {tickets.length} 条
            {lastSync ? ` · 上次同步 ${new Date(lastSync.ran_at).toLocaleTimeString('zh-CN')}` : ''}
          </p>
        </div>
        {canSync && (
          <button className="btn btn-secondary" onClick={handleSync} disabled={syncing}>
            {syncing ? '同步中...' : '同步 ITHub'}
          </button>
        )}
      </div>

      {/* Phase C: SLA distribution chart */}
      <div style={{ marginBottom: 24 }}>
        <ChartCard
          title="SLA 状态分布"
          subtitle="已超时 / 24h 内 / 正常"
          loading={loading}
          empty={slaEmpty}
          emptyText="暂无工单数据"
        >
          <BarChart
            data={slaData}
            colors={['var(--danger)', 'var(--warning)', 'var(--success)']}
          />
        </ChartCard>
      </div>

      <div
        className="row"
        style={{
          gap: 8,
          marginBottom: 16,
          borderBottom: '1px solid var(--border)',
          paddingBottom: 12,
        }}
      >
        <button
          className={`btn btn-sm ${tab === 'open' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setTab('open')}
        >
          待处理 ({tickets.filter((t) => t.status !== 'closed' && t.status !== 'resolved').length})
        </button>
        <button
          className={`btn btn-sm ${tab === 'all' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setTab('all')}
        >
          全部 ({tickets.length})
        </button>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>加载中...</p>
      ) : visible.length === 0 ? (
        <div className="card">
          <EmptyState title="暂无工单" description="点击「同步」拉取 ITHub 工单" />
        </div>
      ) : (
        <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
          {visible.map((t) => (
            <ITHubTicketCard key={t.id} ticket={t} />
          ))}
        </div>
      )}
    </div>
  );
}

interface ITHubSyncState {
  ran_at: string;
  pulled: number;
  errors: number;
}
