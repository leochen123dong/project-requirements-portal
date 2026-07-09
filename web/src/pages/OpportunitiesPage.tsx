import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Database } from '../api/supabase';
import { supabase } from '../api/supabase';
import { asTypedClient } from '../hooks/useSupabaseClient';
import { useAuthStore } from '../store/authStore';
import { useRole } from '../hooks/useRole';
import { useToast } from '../hooks/useToast';
import { canCreateOpportunity } from '../utils/rbac';
import type { Opportunity, OpportunityStage } from '../types/contracts';
import DataTable, { type DataTableColumn } from '../components/DataTable';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';

type OppRow = Database['public']['Tables']['opportunities']['Row'];

const STAGES = ['lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost'] as const;
const STAGE_LABEL: Record<OpportunityStage, string> = {
  lead: '线索',
  qualified: '已验证',
  proposal: '方案中',
  negotiation: '谈判中',
  won: '成交',
  lost: '丢单',
};

const NewOpportunitySchema = z.object({
  name: z.string().min(2, '名称至少 2 字符'),
  customer: z.string().min(1, '请填写客户'),
  amount: z
    .string()
    .transform((v) => (v === '' ? null : Number(v)))
    .refine((v) => v === null || (!Number.isNaN(v) && v >= 0), '请填写有效的金额'),
  stage: z.enum(['lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost'] as const),
});
type NewOpportunityInput = z.input<typeof NewOpportunitySchema>;

/**
 * Opportunities list with stage filter tabs and create modal.
 * presales / admin only — Layout already gates the page, this enforces
 * the create button.
 */
export default function OpportunitiesPage() {
  const navigate = useNavigate();
  const role = useRole();
  const userId = useAuthStore((s) => s.profile?.id ?? null);
  const toast = useToast();
  const client = asTypedClient(supabase);

  const [allOpps, setAllOpps] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState<OpportunityStage | 'all'>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!client || !userId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.resolve(
      client
        .from('opportunities')
        .select('*')
        .order('updated_at', { ascending: false }),
    )
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) throw error;
        setAllOpps((data ?? []) as unknown as Opportunity[]);
      })
      .catch((e) =>
        toast.error(e instanceof Error ? e.message : '加载商机失败'),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const visible = allOpps.filter((o) => (stage === 'all' ? true : o.stage === stage));
  const canCreate = canCreateOpportunity(role);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NewOpportunityInput>({
    resolver: zodResolver(NewOpportunitySchema),
    defaultValues: { name: '', customer: '', amount: '', stage: 'lead' },
  });

  const onCreate = async (values: NewOpportunityInput) => {
    if (!client || !userId) return;
    setCreating(true);
    try {
      const row: Database['public']['Tables']['opportunities']['Insert'] = {
        name: values.name,
        customer: values.customer,
        amount: values.amount === '' ? null : Number(values.amount),
        stage: values.stage,
        owner_id: userId,
      };
      const { data, error } = await client
        .from('opportunities')
        .insert(row)
        .select('*')
        .maybeSingle();
      if (error) throw error;
      toast.success('商机已创建');
      setShowCreate(false);
      reset({ name: '', customer: '', amount: '', stage: 'lead' });
      if (data) navigate(`/opportunities/${(data as unknown as OppRow).id}`);
      else void loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '创建失败');
    } finally {
      setCreating(false);
    }
  };

  const loadAll = async () => {
    if (!client) return;
    setLoading(true);
    try {
      const { data, error } = await client
        .from('opportunities')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      setAllOpps((data ?? []) as unknown as Opportunity[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '刷新失败');
    } finally {
      setLoading(false);
    }
  };

  const columns: DataTableColumn<Opportunity>[] = [
    {
      key: 'name',
      header: '商机名称',
      render: (o) => <strong>{o.name}</strong>,
    },
    { key: 'customer', header: '客户', render: (o) => o.customer },
    {
      key: 'amount',
      header: '金额',
      align: 'right',
      render: (o) =>
        o.amount !== null
          ? new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 0 }).format(o.amount)
          : '—',
    },
    {
      key: 'stage',
      header: '阶段',
      render: (o) => <span className={`tag ${o.stage === 'won' ? 'tag-success' : o.stage === 'lost' ? 'tag-neutral' : 'tag-info'}`}>{STAGE_LABEL[o.stage]}</span>,
    },
    {
      key: 'updated',
      header: '更新时间',
      render: (o) => new Date(o.updated_at).toLocaleDateString('zh-CN'),
    },
  ];

  if (!client) {
    return (
      <div className="container">
        <div className="page-header">
          <div>
            <h1 className="page-title">商机</h1>
            <p className="page-subtitle">售前录入与跟踪</p>
          </div>
        </div>
        <div className="card">
          <EmptyState
            title="需要先连接 Supabase"
            description="设置 VITE_SUPABASE_URL 与 VITE_SUPABASE_ANON_KEY 后即可加载商机数据。"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1 className="page-title">商机</h1>
          <p className="page-subtitle">售前录入与跟踪 · 共 {allOpps.length} 个</p>
        </div>
        {canCreate && (
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            新建商机
          </button>
        )}
      </div>

      <div
        className="row"
        style={{
          marginBottom: 16,
          gap: 8,
          borderBottom: '1px solid var(--border)',
          paddingBottom: 12,
        }}
      >
        <button
          className={`btn btn-sm ${stage === 'all' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setStage('all')}
        >
          全部 ({allOpps.length})
        </button>
        {STAGES.map((s) => {
          const c = allOpps.filter((o) => o.stage === s).length;
          return (
            <button
              key={s}
              className={`btn btn-sm ${stage === s ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setStage(s)}
            >
              {STAGE_LABEL[s]} ({c})
            </button>
          );
        })}
      </div>

      <DataTable
        columns={columns}
        rows={visible}
        rowKey={(o) => o.id}
        loading={loading}
        emptyTitle="暂无商机"
        emptyDescription={canCreate ? '点击「新建商机」开始录入' : '当前阶段下没有匹配的商机'}
        onRowClick={(o) => navigate(`/opportunities/${o.id}`)}
      />

      <Modal
        open={showCreate}
        onClose={() => {
          if (!creating) setShowCreate(false);
        }}
        title="新建商机"
        actions={
          <>
            <button
              className="btn btn-secondary"
              onClick={() => setShowCreate(false)}
              disabled={creating}
            >
              取消
            </button>
            <button
              className="btn btn-primary"
              form="new-opp-form"
              type="submit"
              disabled={creating}
            >
              {creating ? '创建中...' : '创建'}
            </button>
          </>
        }
      >
        <form id="new-opp-form" onSubmit={handleSubmit(onCreate)}>
          <div className="field">
            <label className="field-label">名称</label>
            <input className="input" placeholder="如:某银行核心网改造项目" {...register('name')} />
            {errors.name && (
              <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>
                {errors.name.message}
              </p>
            )}
          </div>
          <div className="field">
            <label className="field-label">客户</label>
            <input className="input" placeholder="客户名称" {...register('customer')} />
            {errors.customer && (
              <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>
                {errors.customer.message}
              </p>
            )}
          </div>
          <div className="field">
            <label className="field-label">金额 (CNY)</label>
            <input
              className="input"
              type="number"
              step="1000"
              placeholder="可留空"
              {...register('amount')}
            />
            {errors.amount && (
              <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>
                {errors.amount.message}
              </p>
            )}
          </div>
          <div className="field">
            <label className="field-label">阶段</label>
            <select className="select" {...register('stage')}>
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </form>
      </Modal>
    </div>
  );
}
