import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Database } from '../api/supabase';
import { supabase } from '../api/supabase';
import { asTypedClient } from '../hooks/useSupabaseClient';
import { useRealtime } from '../hooks/useRealtime';
import { useRole } from '../hooks/useRole';
import { useToast } from '../hooks/useToast';
import { canHandoverOpportunity, canManageTagDefinitions, canUpdateOpportunity } from '../utils/rbac';
import type {
  AuditLog,
  Comment,
  FieldDefinition,
  FieldValue,
  Opportunity,
  OpportunityStage,
  OpportunityTag,
  OpportunityTagDefinition,
  Profile,
} from '../types/contracts';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import CommentEditor from '../components/CommentEditor';

const HandoverSchema = z.object({
  pm_id: z.string().uuid('请选择有效的 PM'),
  // v0.4 Phase C: delivery engineer is now part of handover — the whole
  // point of the new `delivery_id` column is to capture it explicitly.
  delivery_id: z.string().uuid('请选择交付工程师'),
});
type HandoverInput = z.input<typeof HandoverSchema>;

const REQUIRED_ARTIFACTS = ['HT-JL-01', 'HT-JL-02', 'HT-JL-03-1', 'SOW', 'CONTRACT'] as const;
const ARTIFACT_LABEL: Record<string, string> = {
  'HT-JL-01': 'HT-JL-01 技术方案',
  'HT-JL-02': 'HT-JL-02 网络拓扑',
  'HT-JL-03-1': 'HT-JL-03-1 实施计划',
  SOW: 'SOW 工作说明书',
  CONTRACT: 'CONTRACT 合同',
};
const STAGE_LABEL: Record<string, string> = {
  lead: '线索',
  qualified: '已验证',
  proposal: '方案中',
  negotiation: '谈判中',
  won: '成交',
  lost: '丢单',
};

// ─── Timeline (v0.3 Phase B) ────────────────────────────────────────────────
// Unified view of free-text comments + automatic audit events for this
// opportunity. Comments come from `comments` (target_type='opportunity');
// audit entries come from `audit_log` (entity='opportunities'). Each row in
// the merged timeline carries its `at` time + a `kind` discriminator so the
// renderer can switch between comment / audit presentation.

type CommentTimelineEvent = { kind: 'comment'; at: string; comment: Comment };
type AuditTimelineEvent = { kind: 'audit'; at: string; entry: AuditLog };
type TimelineEvent = CommentTimelineEvent | AuditTimelineEvent;

function buildTimeline(comments: Comment[], auditEntries: AuditLog[]): TimelineEvent[] {
  const events: TimelineEvent[] = [
    ...comments.map(
      (c): CommentTimelineEvent => ({ kind: 'comment', at: c.created_at, comment: c }),
    ),
    ...auditEntries.map(
      (a): AuditTimelineEvent => ({ kind: 'audit', at: a.at, entry: a }),
    ),
  ];
  // Newest first — matches activity-feed convention.
  return events.sort((a, b) => b.at.localeCompare(a.at));
}

function formatAuthorId(id: string): string {
  return `${id.slice(0, 6)}…`;
}

function formatAbsolute(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return iso;
  }
}

function formatRelative(iso: string): string {
  try {
    const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diffSec < 60) return '刚刚';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分钟前`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} 小时前`;
    if (diffSec < 7 * 86400) return `${Math.floor(diffSec / 86400)} 天前`;
    return new Date(iso).toLocaleDateString('zh-CN');
  } catch {
    return iso;
  }
}

/**
 * Local cast for the two new tables. Database type stub in api/supabase.ts
 * does not yet include `opportunity_field_definitions` / `opportunity_field_values`
 * — the cast stays here at this single callsite.
 */
type FieldClient = {
  from: (table: string) => {
    select: (cols?: string) => {
      eq: (col: string, val: unknown) => Promise<{
        data: unknown;
        error: { message: string } | null;
      }>;
    };
  };
};
const fieldClient = asTypedClient(supabase) as unknown as FieldClient | null;

function hydrateTagValues(
  values: OpportunityTag[],
  defs: OpportunityTagDefinition[],
): OpportunityTag[] {
  const defById = new Map(defs.map((d) => [d.id, d]));
  return values.map((v) => {
    const def = defById.get(v.tag_id);
    return {
      ...v,
      tag: def?.tag,
      label: def?.label,
      color: def?.color,
    };
  });
}

/**
 * Renders a field value according to its definition type:
 *   - text    → plain text
 *   - number  → formatted with thousands separators
 *   - date    → zh-CN locale date
 *   - select  → highlighted tag
 */
function renderFieldValue(def: FieldDefinition, value: string | null): JSX.Element {
  if (value === null || value === '') {
    return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  }
  switch (def.type) {
    case 'number': {
      const n = Number(value);
      if (Number.isNaN(n)) return <>{value}</>;
      return <>{new Intl.NumberFormat('zh-CN').format(n)}</>;
    }
    case 'date': {
      // ISO yyyy-mm-dd → Date, then format in zh-CN
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return <>{value}</>;
      return <>{d.toLocaleDateString('zh-CN')}</>;
    }
    case 'select':
      return <span className="tag tag-info">{value}</span>;
    case 'text':
    default:
      return <>{value}</>;
  }
}

/**
 * Opportunity detail. Shows 5 required artifact slots with upload UI
 * deferred to ProjectDetailPage (post-handover). The "立项交接" button
 * opens a modal to select PM; on confirm, INSERTs into projects and
 * navigates to /projects/:newId.
 */
export default function OpportunityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const role = useRole();
  const toast = useToast();
  const client = asTypedClient(supabase);

  const [loading, setLoading] = useState(true);
  const [opp, setOpp] = useState<Opportunity | null>(null);
  const [pms, setPms] = useState<Profile[]>([]);
  // v0.4 Phase C: presales + delivery staff lists. Used both to resolve
  // display names in the "商机信息" card and to populate dropdowns in the
  // handover modal / inline-edit selects.
  const [presalesList, setPresalesList] = useState<Profile[]>([]);
  const [deliveryList, setDeliveryList] = useState<Profile[]>([]);
  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await client
          .from('profiles')
          .select('*')
          .in('role', ['presales', 'admin', 'delivery']);
        if (cancelled) return;
        if (error) throw error;
        const all = (data ?? []) as unknown as Profile[];
        setPresalesList(all.filter((p) => p.role === 'presales' || p.role === 'admin'));
        setDeliveryList(all.filter((p) => p.role === 'delivery' || p.role === 'admin'));
      } catch {
        // Non-fatal: info card just shows '未指定' for missing names.
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);
  const [showHandover, setShowHandover] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [handoverValues, setHandoverValues] = useState<HandoverInput | null>(null);
  const [handovering, setHandoverering] = useState(false);

  // Stage change flow (v0.3 Phase A).
  const [showStageModal, setShowStageModal] = useState(false);
  const [pendingStage, setPendingStage] = useState<OpportunityStage | null>(null);
  const [showStageConfirm, setShowStageConfirm] = useState(false);
  const [stageChanging, setStageChanging] = useState(false);

  // Custom field values for this opportunity, paired with their definitions.
  const [customValues, setCustomValues] = useState<
    Array<{ def: FieldDefinition; value: string | null }>
  >([]);

  // Phase B: follow-up log (comments + audit events for this opportunity).
  const [comments, setComments] = useState<Comment[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditLog[]>([]);
  const [authorMap, setAuthorMap] = useState<Record<string, string>>({});

  // v0.4 Phase B: admin-managed tag definitions + per-opportunity values.
  const [tagDefs, setTagDefs] = useState<OpportunityTagDefinition[]>([]);
  const [tagValues, setTagValues] = useState<OpportunityTag[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<HandoverInput>({
    resolver: zodResolver(HandoverSchema),
    defaultValues: { pm_id: '', delivery_id: '' },
  });

  // ─── Hooks BEFORE any early-return guards (React rules of hooks) ─────────
  // These MUST be called unconditionally on every render, regardless of
  // whether `client` is set, whether `loading` is true, or whether `opp`
  // is null. Putting them after an early-return causes React error #310
  // ("Rendered more hooks than during the previous render") when state
  // transitions cross the guard.
  const canHandover = canHandoverOpportunity(role);
  const canUpdate = canUpdateOpportunity(role);
  const canManageTags = canManageTagDefinitions(role);

  const selectedTagIds = useMemo(
    () => new Set(tagValues.map((t) => t.tag_id)),
    [tagValues],
  );

  // Phase B: merged timeline (comments + audit entries), newest first.
  const timeline = useMemo(
    () => buildTimeline(comments, auditEntries),
    [comments, auditEntries],
  );
  const resolveAuthor = (id: string) => authorMap[id];

  const loadAll = async (showSpinner: boolean) => {
    if (!id || !client) {
      setLoading(false);
      return;
    }
    if (showSpinner) setLoading(true);
    try {
      // Run independent queries in parallel: opportunity, PM list,
      // active field definitions, stored values, comments for this
      // opportunity, audit entries, and the author profiles needed to
      // resolve display names.
      const [
        oppRes,
        pmsRes,
        defsRes,
        valsRes,
        commentsRes,
        auditRes,
        tagDefsRes,
        tagValuesRes,
      ] = await Promise.all([
        client.from('opportunities').select('*').eq('id', id).maybeSingle(),
        client.from('profiles').select('*').eq('role', 'pm'),
        fieldClient
          ? fieldClient
              .from('opportunity_field_definitions')
              .select('*')
              .eq('is_active', true)
          : Promise.resolve({ data: [], error: null }),
        fieldClient
          ? fieldClient
              .from('opportunity_field_values')
              .select('*')
              .eq('opportunity_id', id)
          : Promise.resolve({ data: [], error: null }),
        client
          .from('comments')
          .select('*')
          .eq('target_type', 'opportunity')
          .eq('target_id', id)
          .order('created_at', { ascending: true }),
        client
          .from('audit_log')
          .select('*')
          .eq('entity', 'opportunities')
          .eq('entity_id', id)
          .order('at', { ascending: false })
          .limit(50),
        client
          .from('opportunity_tag_definitions')
          .select('*')
          .eq('is_active', true)
          .order('display_order', { ascending: true }),
        client
          .from('opportunity_tag_values')
          .select('*')
          .eq('opportunity_id', id),
      ]);
      if (oppRes.error) throw oppRes.error;
      if (pmsRes.error) throw pmsRes.error;
      if (defsRes.error) throw new Error(defsRes.error.message);
      if (valsRes.error) throw new Error(valsRes.error.message);
      if (tagDefsRes.error) throw tagDefsRes.error;
      if (tagValuesRes.error) throw tagValuesRes.error;
      // Comments and audit log are best-effort: failure surfaces as an
      // empty list + a non-fatal toast so the rest of the page still
      // renders. Comments SELECT allows all authenticated; audit_log may
      // RLS-deny for non-presales roles.
      if (commentsRes.error) toast.error('加载评论失败:' + commentsRes.error.message);
      if (auditRes.error) {
        // pm / delivery / postsales won't have the audit_log SELECT policy,
        // so an RLS denial is the expected state for them — log quietly.
        if (auditRes.error.message !== null && !auditRes.error.message.startsWith('permission denied')) {
          toast.error('加载审计日志失败:' + auditRes.error.message);
        }
      }
      setOpp((oppRes.data ?? null) as unknown as Opportunity | null);
      setPms((pmsRes.data ?? []) as unknown as Profile[]);

      // Join: for each active definition, look up the stored value (if any).
      const defs = ((defsRes.data ?? []) as unknown as FieldDefinition[]).sort(
        (a, b) => a.display_order - b.display_order,
      );
      const vals = (valsRes.data ?? []) as unknown as FieldValue[];
      const byId = new Map(vals.map((v) => [v.field_id, v.value]));
      setCustomValues(
        defs.map((d) => ({ def: d, value: byId.get(d.id) ?? null })),
      );

      // Phase B: populate comments, audit entries, and author display-name map.
      const nextComments = (commentsRes.data ?? []) as unknown as Comment[];
      const nextAudit = (auditRes.data ?? []) as unknown as AuditLog[];
      setComments(nextComments);
      setAuditEntries(nextAudit);

      // v0.4 Phase B: active admin-managed definitions + selected values.
      const nextTagDefs = ((tagDefsRes.data ?? []) as unknown as OpportunityTagDefinition[]).sort(
        (a, b) => a.display_order - b.display_order,
      );
      const nextTagValues = (tagValuesRes.data ?? []) as unknown as OpportunityTag[];
      setTagDefs(nextTagDefs);
      setTagValues(hydrateTagValues(nextTagValues, nextTagDefs));

      const authorIds = new Set<string>();
      for (const c of nextComments) authorIds.add(c.author_id);
      for (const a of nextAudit) {
        if (a.actor_id) authorIds.add(a.actor_id);
      }
      if (authorIds.size > 0) {
        const { data: profs, error: profsErr } = await client
          .from('profiles')
          .select('*')
          .in('id', Array.from(authorIds));
        if (profsErr) {
          setAuthorMap({});
        } else {
          const map: Record<string, string> = {};
          for (const p of (profs ?? []) as unknown as Profile[]) {
            map[p.id] = p.display_name;
          }
          setAuthorMap(map);
        }
      } else {
        setAuthorMap({});
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ─── Phase B: refetch comments (called from realtime + CommentEditor) ───
  // Mirror the latest `authorMap` in a ref so the realtime subscriber (whose
  // identity we want to keep stable across profile updates) can read it
  // without taking it as a dependency.
  const authorMapRef = useRef<Record<string, string>>({});
  useEffect(() => {
    authorMapRef.current = authorMap;
  }, [authorMap]);

  const refetchComments = useCallback(async () => {
    if (!client || !id) return;
    const { data, error } = await client
      .from('comments')
      .select('*')
      .eq('target_type', 'opportunity')
      .eq('target_id', id)
      .order('created_at', { ascending: true });
    if (error) {
      toast.error('刷新评论失败:' + error.message);
      return;
    }
    const next = (data ?? []) as unknown as Comment[];
    setComments(next);
    // Lazy-fetch any newly-seen authors so the timeline can show their name.
    const known = new Set(Object.keys(authorMapRef.current));
    const fresh = next.map((c) => c.author_id).filter((aid) => !known.has(aid));
    if (fresh.length === 0) return;
    const { data: profs, error: profsErr } = await client
      .from('profiles')
      .select('*')
      .in('id', fresh);
    if (profsErr || !profs) return;
    const additions: Record<string, string> = {};
    for (const p of (profs as unknown as Profile[])) {
      additions[p.id] = p.display_name;
    }
    if (Object.keys(additions).length > 0) {
      setAuthorMap((cur) => ({ ...cur, ...additions }));
    }
  }, [client, id, toast]);

  // ─── v0.4 Phase B: tags refetch + optimistic toggle ──────────────────────
  const refetchTags = useCallback(async () => {
    if (!client || !id) return;
    const [defsRes, valuesRes] = await Promise.all([
      client
        .from('opportunity_tag_definitions')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true }),
      client
        .from('opportunity_tag_values')
        .select('*')
        .eq('opportunity_id', id),
    ]);
    if (defsRes.error) {
      toast.error('刷新标签定义失败:' + defsRes.error.message);
      return;
    }
    if (valuesRes.error) {
      toast.error('刷新标签失败:' + valuesRes.error.message);
      return;
    }
    const nextDefs = ((defsRes.data ?? []) as unknown as OpportunityTagDefinition[]).sort(
      (a, b) => a.display_order - b.display_order,
    );
    const nextValues = (valuesRes.data ?? []) as unknown as OpportunityTag[];
    setTagDefs(nextDefs);
    setTagValues(hydrateTagValues(nextValues, nextDefs));
  }, [client, id, toast]);

  const handleToggleTag = useCallback(
    async (tagDef: OpportunityTagDefinition) => {
      if (!client || !opp || !canUpdate) return;
      const existing = tagValues.find((t) => t.tag_id === tagDef.id);
      const before = tagValues;
      const optimisticValue: OpportunityTag = {
        opportunity_id: opp.id,
        tag_id: tagDef.id,
        tag: tagDef.tag,
        label: tagDef.label,
        color: tagDef.color,
        created_at: new Date().toISOString(),
      };
      setTagValues(
        existing
          ? tagValues.filter((t) => t.tag_id !== tagDef.id)
          : [...tagValues, optimisticValue],
      );
      try {
        const res = existing
          ? await client
              .from('opportunity_tag_values')
              .delete()
              .eq('opportunity_id', opp.id)
              .eq('tag_id', tagDef.id)
          : await client
              .from('opportunity_tag_values')
              .insert({ opportunity_id: opp.id, tag_id: tagDef.id });
        if (res.error) {
          const msg = res.error.message.toLowerCase();
          if (!existing && msg.includes('duplicate')) {
            await refetchTags();
            return;
          }
          throw res.error;
        }
      } catch (e) {
        setTagValues(before);
        toast.error(e instanceof Error ? e.message : '更新标签失败');
        await refetchTags();
      }
    },
    [canUpdate, client, opp, refetchTags, tagValues, toast],
  );

  // Realtime subscription: re-fetch comments on any INSERT/UPDATE/DELETE on
  // the `comments` table for this opportunity. Server-side filter is the
  // primary guard; client-side row check defends DELETE events where `new`
  // is null (we look at `old` instead). `audit_log` is intentionally NOT
  // in the realtime publication — new audit entries show only on page
  // refresh.
  useRealtime(
    'comments',
    useCallback(
      async (payload: {
        eventType: 'INSERT' | 'UPDATE' | 'DELETE';
        new: unknown;
        old: unknown;
      }) => {
        if (!id) return;
        // For INSERT/UPDATE the row is in `new`; for DELETE it's in `old`.
        const sourceRow =
          payload.eventType === 'DELETE'
            ? (payload.old as { target_type?: string; target_id?: string } | null)
            : (payload.new as { target_type?: string; target_id?: string } | null);
        if (
          !sourceRow ||
          sourceRow.target_type !== 'opportunity' ||
          sourceRow.target_id !== id
        ) {
          return;
        }
        await refetchComments();
      },
      [id, refetchComments],
    ),
    id ? `target_id=eq.${id}` : undefined,
  );

  useRealtime(
    'opportunity_tag_values',
    useCallback(
      async (payload: {
        eventType: 'INSERT' | 'UPDATE' | 'DELETE';
        new: unknown;
        old: unknown;
      }) => {
        if (!id) return;
        const sourceRow =
          payload.eventType === 'DELETE'
            ? (payload.old as { opportunity_id?: string } | null)
            : (payload.new as { opportunity_id?: string } | null);
        if (!sourceRow || sourceRow.opportunity_id !== id) return;
        await refetchTags();
      },
      [id, refetchTags],
    ),
    id ? `opportunity_id=eq.${id}` : undefined,
  );

  const onHandoverSubmit = (values: HandoverInput) => {
    setHandoverValues(values);
    setShowHandover(false);
    setShowConfirm(true);
  };

  const performHandover = async () => {
    if (!client || !opp || !handoverValues) return;
    setHandoverering(true);
    try {
      // v0.4 Phase C: include delivery_id so the new project knows who
      // is doing the on-site work. Also backfill the opportunity's
      // delivery_id if it was previously NULL (so future references
      // to the opportunity carry the right engineer).
      const insert: Database['public']['Tables']['projects']['Insert'] = {
        opportunity_id: opp.id,
        name: opp.name,
        pm_id: handoverValues.pm_id,
        delivery_id: handoverValues.delivery_id,
        status: 'initiated',
      };
      if (!opp.delivery_id) {
        await client
          .from('opportunities')
          .update({ delivery_id: handoverValues.delivery_id })
          .eq('id', opp.id);
      }
      const { data: projectData, error: projectErr } = await client
        .from('projects')
        .insert(insert)
        .select('*')
        .maybeSingle();
      if (projectErr) throw projectErr;
      if (!projectData) throw new Error('立项失败:未返回项目');
      const newProjectId = (projectData as unknown as { id: string }).id;
      toast.success('已立项,跳转到项目页');
      setShowConfirm(false);
      navigate(`/projects/${newProjectId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '立项失败');
    } finally {
      setHandoverering(false);
    }
  };

  const performStageChange = async () => {
    if (!client || !opp || !pendingStage) return;
    setStageChanging(true);
    try {
      const update: Database['public']['Tables']['opportunities']['Update'] = {
        stage: pendingStage,
      };
      const { error } = await client
        .from('opportunities')
        .update(update)
        .eq('id', opp.id);
      if (error) throw error;
      toast.success(`阶段已更新为 ${STAGE_LABEL[pendingStage]}`);
      setShowStageConfirm(false);
      setPendingStage(null);
      await loadAll(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '更新阶段失败');
    } finally {
      setStageChanging(false);
    }
  };

  if (!client) {
    return (
      <div className="container">
        <div className="page-header">
          <div>
            <h1 className="page-title">商机详情</h1>
            <p className="page-subtitle">Supabase 未配置</p>
          </div>
        </div>
        <div className="card">
          <EmptyState title="需要先连接 Supabase" />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container">
        <p style={{ color: 'var(--text-muted)' }}>加载中...</p>
      </div>
    );
  }

  if (!opp) {
    return (
      <div className="container">
        <div className="page-header">
          <div>
            <h1 className="page-title">商机详情</h1>
          </div>
        </div>
        <div className="card">
          <EmptyState title="未找到商机" description="该 ID 不存在或已被删除" />
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1 className="page-title">{opp.name}</h1>
          <p className="page-subtitle">
            {opp.customer} ·
            <span className="tag tag-info" style={{ marginLeft: 6 }}>
              {STAGE_LABEL[opp.stage] ?? opp.stage}
            </span>
            {canUpdate && (
              <button
                className="btn btn-secondary btn-sm"
                style={{ marginLeft: 12, verticalAlign: 'middle' }}
                onClick={() => {
                  setPendingStage(opp.stage);
                  setShowStageModal(true);
                }}
              >
                修改阶段
              </button>
            )}
          </p>
        </div>
        {canHandover && (
          <button className="btn btn-accent" onClick={() => setShowHandover(true)}>
            立项交接 →
          </button>
        )}
      </div>

      <div className="grid-cards" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 24 }}>
        <div className="card">
          <h3 className="card-title">商机信息</h3>
          <dl style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, margin: 0 }}>
            <dt style={{ color: 'var(--text-muted)' }}>客户</dt>
            <dd style={{ margin: 0 }}>{opp.customer}</dd>
            <dt style={{ color: 'var(--text-muted)' }}>金额</dt>
            <dd style={{ margin: 0 }}>
              {opp.amount !== null
                ? new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 0 }).format(opp.amount)
                : '—'}
            </dd>
            <dt style={{ color: 'var(--text-muted)' }}>阶段</dt>
            <dd style={{ margin: 0 }}>{STAGE_LABEL[opp.stage] ?? opp.stage}</dd>
            <dt style={{ color: 'var(--text-muted)' }}>售前负责人</dt>
            <dd style={{ margin: 0 }}>
              {presalesList.find((p) => p.id === opp.presales_id)?.display_name
                ?? presalesList.find((p) => p.id === opp.owner_id)?.display_name
                ?? <span style={{ color: 'var(--text-muted)' }}>未指定</span>}
            </dd>
            <dt style={{ color: 'var(--text-muted)' }}>交付负责人</dt>
            <dd style={{ margin: 0 }}>
              {deliveryList.find((p) => p.id === opp.delivery_id)?.display_name
                ?? <span style={{ color: 'var(--text-muted)' }}>未指定</span>}
            </dd>
            <dt style={{ color: 'var(--text-muted)' }}>创建于</dt>
            <dd style={{ margin: 0 }}>{new Date(opp.created_at).toLocaleString('zh-CN')}</dd>
            <dt style={{ color: 'var(--text-muted)' }}>标签</dt>
            <dd style={{ margin: 0 }}>
              {tagDefs.length === 0 ? (
                <span style={{ color: 'var(--text-muted)' }}>
                  暂无标签{canManageTags ? ' · 在 /admin/tags 添加' : ''}
                </span>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {tagDefs.map((tagDef) => {
                    const selected = selectedTagIds.has(tagDef.id);
                    return (
                      <button
                        key={tagDef.id}
                        type="button"
                        className={`tag ${selected ? tagDef.color : 'tag-neutral'}`}
                        aria-pressed={selected}
                        disabled={!canUpdate}
                        onClick={() => handleToggleTag(tagDef)}
                        title={canUpdate ? `切换标签 ${tagDef.label}` : `${tagDef.label} (只读)`}
                        style={{
                          border: selected ? '1px solid transparent' : '1px solid var(--border)',
                          background: selected ? undefined : 'transparent',
                          cursor: canUpdate ? 'pointer' : 'default',
                          opacity: canUpdate ? 1 : 0.85,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        {selected && <span aria-hidden>✓</span>}
                        <span>{tagDef.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </dd>
          </dl>
        </div>

        <div className="card">
          <h3 className="card-title">立项所需交付物</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '0 0 12px' }}>
            立项后,5 份必备交付物将转入项目页上传。
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {REQUIRED_ARTIFACTS.map((t) => (
              <li
                key={t}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '8px 0',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <span className="tag tag-neutral" style={{ minWidth: 90, textAlign: 'center' }}>{t}</span>
                <span>{ARTIFACT_LABEL[t]}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {customValues.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 className="card-title">自定义字段</h3>
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: '160px 1fr',
              gap: 8,
              margin: 0,
            }}
          >
            {customValues.map(({ def, value }) => (
              <div
                key={def.id}
                style={{ display: 'contents' }}
              >
                <dt style={{ color: 'var(--text-muted)' }}>
                  {def.label}
                  {def.required && (
                    <span style={{ color: 'var(--danger)', marginLeft: 4 }}>*</span>
                  )}
                </dt>
                <dd style={{ margin: 0 }}>{renderFieldValue(def, value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/*
        Phase B: 跟进记录 / 日志 — merged timeline of free-text comments and
        automatic audit entries (e.g. stage changes from Phase A). Renders
        client-realtime on comments (re-renders new entries via refetch on
        the realtime channel); new audit entries only show on next page
        refresh because audit_log is not in the realtime publication.
      */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 className="card-title">跟进记录 / 日志</h3>

        {loading ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>加载中...</p>
        ) : timeline.length === 0 ? (
          <EmptyState
            title="暂无跟进记录"
            description="在下方添加第一条评论"
          />
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {timeline.map((event) => {
              if (event.kind === 'comment') {
                const c = event.comment;
                const author = resolveAuthor(c.author_id) ?? formatAuthorId(c.author_id);
                return (
                  <li
                    key={`c-${c.id}`}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      padding: '10px 0',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 13,
                        color: 'var(--text-muted)',
                        marginBottom: 4,
                      }}
                    >
                      <span aria-hidden style={{ fontSize: 14 }}>📝</span>
                      <span
                        className="user-avatar"
                        style={{ width: 24, height: 24, fontSize: 11 }}
                        aria-hidden
                      >
                        {(author || '?').slice(0, 1).toUpperCase()}
                      </span>
                      <span style={{ fontWeight: 600, color: 'var(--text)' }}>{author}</span>
                      <span>{formatRelative(event.at)}</span>
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap', paddingLeft: 32 }}>{c.body}</div>
                  </li>
                );
              }
              const a = event.entry;
              const actorName = a.actor_id
                ? (resolveAuthor(a.actor_id) ?? formatAuthorId(a.actor_id))
                : '系统';
              // v0.4 Phase A: recognise concrete field changes captured in
              // audit_log.payload and render "stage: → 已验证" / "amount → X"
              // instead of the generic "[update] opportunities". We only have
              // the NEW value (the trigger stores to_jsonb(NEW) — see
              // 0008_audit_log_payload.sql), so we render only the arrow target
              // for MVP. The OLD value can be derived from the next-older
              // audit/insert entry in a follow-up. Falls back to the previous
              // generic display for legacy rows (payload === null) or entities
              // we don't yet have field renderers for.
              const payload = a.payload;
              const isOppUpdate = a.action === 'update' && a.entity === 'opportunities' && payload !== null;
              const rawStage = isOppUpdate ? payload.stage : undefined;
              const hasStage = typeof rawStage === 'string';
              const hasAmount = isOppUpdate && payload.amount !== undefined;
              const stageLabel = hasStage
                ? (STAGE_LABEL[rawStage as OpportunityStage] ?? String(rawStage))
                : '';
              return (
                <li
                  key={`a-${a.id}`}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    padding: '10px 0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 13,
                    color: 'var(--text-muted)',
                  }}
                >
                  <span aria-hidden style={{ fontSize: 14 }}>🔧</span>
                  {hasStage ? (
                    <span
                      className="tag tag-info"
                      style={{ fontWeight: 600 }}
                      title="阶段已变更"
                    >
                      <strong>stage</strong> → {stageLabel}
                    </span>
                  ) : hasAmount ? (
                    <strong style={{ color: 'var(--text)' }}>
                      amount → {String(payload.amount)}
                    </strong>
                  ) : (
                    <strong style={{ color: 'var(--text)' }}>
                      [{a.action}] {a.entity}
                    </strong>
                  )}
                  <span>· 由 {actorName} · {formatAbsolute(event.at)}</span>
                </li>
              );
            })}
          </ul>
        )}

        <div style={{ marginTop: 16 }}>
          <CommentEditor
            targetType="opportunity"
            targetId={opp.id}
            onPosted={() => {
              // Optimistic: refetch immediately for snappy UX; the realtime
              // channel will refetch again, which is idempotent.
              void refetchComments();
            }}
          />
        </div>
      </div>

      <Modal
        open={showHandover}
        onClose={() => {
          setShowHandover(false);
          reset({ pm_id: '' });
        }}
        title="立项交接"
        actions={
          <>
            <button className="btn btn-secondary" onClick={() => setShowHandover(false)}>
              取消
            </button>
            <button className="btn btn-primary" form="handover-form" type="submit">
              继续
            </button>
          </>
        }
      >
        <form id="handover-form" onSubmit={handleSubmit(onHandoverSubmit)}>
          <div className="field">
            <label className="field-label">指派 PM</label>
            <select className="select" {...register('pm_id')}>
              <option value="">— 选择 PM —</option>
              {pms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </select>
            {errors.pm_id && (
              <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>
                {errors.pm_id.message}
              </p>
            )}
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            立项后将创建项目 <strong>{opp.name}</strong>,并自动跳转到项目页继续里程碑 / 任务 / 评论管理。
          </p>
        </form>
      </Modal>

      <ConfirmDialog
        open={showConfirm}
        loading={handovering}
        title="确认立项交接"
        message={`将「${opp.name}」立项为项目并指派给 ${
          pms.find((p) => p.id === handoverValues?.pm_id)?.display_name ?? '选中的 PM'
        }?此操作将创建项目记录。`}
        confirmLabel="确认立项"
        onConfirm={performHandover}
        onCancel={() => setShowConfirm(false)}
      />

      <Modal
        open={showStageModal}
        onClose={() => {
          setShowStageModal(false);
          setPendingStage(null);
        }}
        title="修改阶段"
        actions={
          <>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setShowStageModal(false);
                setPendingStage(null);
              }}
            >
              取消
            </button>
            <button
              className="btn btn-primary"
              disabled={pendingStage === null}
              onClick={() => {
                setShowStageModal(false);
                setShowStageConfirm(true);
              }}
            >
              继续
            </button>
          </>
        }
      >
        <div className="field">
          <label className="field-label">当前阶段</label>
          <p style={{ margin: '0 0 12px' }}>{STAGE_LABEL[opp.stage] ?? opp.stage}</p>
        </div>
        <div className="field">
          <label className="field-label">新阶段</label>
          <select
            className="select"
            value={pendingStage ?? opp.stage}
            onChange={(e) => setPendingStage(e.target.value as OpportunityStage)}
          >
            {(['lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost'] as const).map(
              (s) => (
                <option key={s} value={s}>
                  {STAGE_LABEL[s]}
                </option>
              ),
            )}
          </select>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          继续后请确认,阶段变更将记入审计日志。
        </p>
      </Modal>

      <ConfirmDialog
        open={showStageConfirm}
        loading={stageChanging}
        title="确认修改阶段"
        message={`将「${opp.name}」的阶段从「${STAGE_LABEL[opp.stage] ?? opp.stage}」改为「${
          pendingStage ? STAGE_LABEL[pendingStage] : ''
        }」?此变更将记入审计日志。`}
        confirmLabel="确认修改"
        tone="primary"
        onConfirm={performStageChange}
        onCancel={() => {
          setShowStageConfirm(false);
          setPendingStage(null);
        }}
      />
    </div>
  );
}
