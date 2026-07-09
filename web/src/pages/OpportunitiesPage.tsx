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
import type {
  FieldDefinition,
  Opportunity,
  OpportunityStage,
} from '../types/contracts';
import DataTable, { type DataTableColumn } from '../components/DataTable';
import Modal from '../components/Modal';
import ChartCard from '../components/ChartCard';
import BarChart from '../components/BarChart';
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

/**
 * Lightly-typed accessor for the two new tables. The Database type stub
 * in api/supabase.ts does not yet know about them, so we cast through
 * `unknown` at this single callsite.
 */
type FieldClient = {
  from: (table: string) => {
    select: (cols?: string) => {
      eq: (col: string, val: unknown) => {
        order: (col: string, opts?: { ascending: boolean }) => Promise<{
          data: unknown;
          error: { message: string } | null;
        }>;
      };
    };
    insert: (rows: unknown) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
};
const fieldClient = asTypedClient(supabase) as unknown as FieldClient | null;

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
  // Active custom field definitions + their current draft values (id → string).
  // Re-fetched each time the modal opens so admins can pick up schema edits live.
  const [activeFields, setActiveFields] = useState<FieldDefinition[]>([]);
  const [fieldDraft, setFieldDraft] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

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
    // Client-side validation for custom fields (required + non-empty).
    const errs: Record<string, string> = {};
    for (const def of activeFields) {
      const raw = fieldDraft[def.id] ?? '';
      const trimmed = raw.trim();
      if (def.required && trimmed === '') {
        errs[def.id] = '此字段为必填';
        continue;
      }
      if (trimmed !== '' && def.type === 'number' && Number.isNaN(Number(trimmed))) {
        errs[def.id] = '请填写有效数字';
      }
    }
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
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
      const newId = data ? (data as unknown as OppRow).id : null;

      // Insert custom field values (one row per non-empty value).
      if (newId && fieldClient && activeFields.length > 0) {
        const valueRows = activeFields
          .map((def) => {
            const raw = fieldDraft[def.id] ?? '';
            const trimmed = raw.trim();
            if (trimmed === '') return null;
            return {
              opportunity_id: newId,
              field_id: def.id,
              value: trimmed,
            };
          })
          .filter(
            (r): r is { opportunity_id: string; field_id: string; value: string } => r !== null,
          );
        if (valueRows.length > 0) {
          const vRes = await fieldClient.from('opportunity_field_values').insert(valueRows);
          if (vRes.error) {
            // Surface the error but don't block the user — the opportunity
            // exists, the values just didn't persist.
            toast.error(`商机已创建,但自定义字段保存失败: ${vRes.error.message}`);
          }
        }
      }

      toast.success('商机已创建');
      setShowCreate(false);
      reset({ name: '', customer: '', amount: '', stage: 'lead' });
      setFieldDraft({});
      if (newId) navigate(`/opportunities/${newId}`);
      else void loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '创建失败');
    } finally {
      setCreating(false);
    }
  };

  /** Open the create modal and refresh the active field catalog. */
  const openCreateModal = async () => {
    setShowCreate(true);
    setFieldDraft({});
    setFieldErrors({});
    if (!fieldClient) return;
    try {
      const res = await fieldClient
        .from('opportunity_field_definitions')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      if (res.error) throw new Error(res.error.message);
      setActiveFields(
        ((res.data ?? []) as unknown as FieldDefinition[]).sort(
          (a, b) => a.display_order - b.display_order,
        ),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载自定义字段失败');
    }
  };

  const closeCreateModal = () => {
    if (creating) return;
    setShowCreate(false);
    setFieldDraft({});
    setFieldErrors({});
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
          ? new Intl.NumberFormat('zh-CN', {
              style: 'currency',
              currency: 'CNY',
              maximumFractionDigits: 0,
            }).format(o.amount)
          : '—',
    },
    {
      key: 'stage',
      header: '阶段',
      render: (o) => (
        <span
          className={`tag ${
            o.stage === 'won'
              ? 'tag-success'
              : o.stage === 'lost'
                ? 'tag-neutral'
                : 'tag-info'
          }`}
        >
          {STAGE_LABEL[o.stage]}
        </span>
      ),
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
          <button className="btn btn-primary" onClick={openCreateModal}>
            新建商机
          </button>
        )}
      </div>

      {/* Phase C: stage distribution chart */}
      <div style={{ marginBottom: 24 }}>
        <ChartCard
          title="商机阶段分布"
          subtitle="按 stage 聚合"
          loading={loading}
          empty={allOpps.length === 0}
          emptyText="暂无商机数据"
        >
          <BarChart
            data={STAGES.map((s) => ({
              label: STAGE_LABEL[s],
              value: allOpps.filter((o) => o.stage === s).length,
            }))}
          />
        </ChartCard>
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
        onClose={closeCreateModal}
        title="新建商机"
        actions={
          <>
            <button
              className="btn btn-secondary"
              onClick={closeCreateModal}
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
            <input
              className="input"
              placeholder="如:某银行核心网改造项目"
              {...register('name')}
            />
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

          {activeFields.length > 0 && (
            <div
              style={{
                marginTop: 16,
                paddingTop: 16,
                borderTop: '1px solid var(--border)',
              }}
            >
              <h4
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  margin: '0 0 12px',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                自定义字段
              </h4>
              {activeFields.map((def) => {
                const err = fieldErrors[def.id];
                const value = fieldDraft[def.id] ?? '';
                return (
                  <div className="field" key={def.id}>
                    <label className="field-label">
                      {def.label}
                      {def.required && (
                        <span style={{ color: 'var(--danger)', marginLeft: 4 }}>*</span>
                      )}
                    </label>
                    {def.type === 'text' && (
                      <input
                        className="input"
                        type="text"
                        value={value}
                        onChange={(e) =>
                          setFieldDraft((prev) => ({ ...prev, [def.id]: e.target.value }))
                        }
                      />
                    )}
                    {def.type === 'number' && (
                      <input
                        className="input"
                        type="number"
                        value={value}
                        onChange={(e) =>
                          setFieldDraft((prev) => ({ ...prev, [def.id]: e.target.value }))
                        }
                      />
                    )}
                    {def.type === 'date' && (
                      <input
                        className="input"
                        type="date"
                        value={value}
                        onChange={(e) =>
                          setFieldDraft((prev) => ({ ...prev, [def.id]: e.target.value }))
                        }
                      />
                    )}
                    {def.type === 'select' && (
                      <select
                        className="select"
                        value={value}
                        onChange={(e) =>
                          setFieldDraft((prev) => ({ ...prev, [def.id]: e.target.value }))
                        }
                      >
                        <option value="">— 请选择 —</option>
                        {(def.options ?? []).map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    )}
                    {err && (
                      <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>
                        {err}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </form>
      </Modal>
    </div>
  );
}