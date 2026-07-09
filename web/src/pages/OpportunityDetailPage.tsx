import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Database } from '../api/supabase';
import { supabase } from '../api/supabase';
import { asTypedClient } from '../hooks/useSupabaseClient';
import { useRole } from '../hooks/useRole';
import { useToast } from '../hooks/useToast';
import { canHandoverOpportunity } from '../utils/rbac';
import type { Opportunity, Profile } from '../types/contracts';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

const HandoverSchema = z.object({
  pm_id: z.string().uuid('请选择有效的 PM'),
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
  const [showHandover, setShowHandover] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [handoverValues, setHandoverValues] = useState<HandoverInput | null>(null);
  const [handovering, setHandoverering] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<HandoverInput>({
    resolver: zodResolver(HandoverSchema),
    defaultValues: { pm_id: '' },
  });

  useEffect(() => {
    if (!id || !client) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [oppRes, pmsRes] = await Promise.all([
          client.from('opportunities').select('*').eq('id', id).maybeSingle(),
          client.from('profiles').select('*').eq('role', 'pm'),
        ]);
        if (oppRes.error) throw oppRes.error;
        if (pmsRes.error) throw pmsRes.error;
        if (cancelled) return;
        setOpp((oppRes.data ?? null) as unknown as Opportunity | null);
        setPms((pmsRes.data ?? []) as unknown as Profile[]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '加载失败');
      } finally {
        !cancelled && setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const onHandoverSubmit = (values: HandoverInput) => {
    setHandoverValues(values);
    setShowHandover(false);
    setShowConfirm(true);
  };

  const performHandover = async () => {
    if (!client || !opp || !handoverValues) return;
    setHandoverering(true);
    try {
      const insert: Database['public']['Tables']['projects']['Insert'] = {
        opportunity_id: opp.id,
        name: opp.name,
        pm_id: handoverValues.pm_id,
        status: 'initiated',
      };
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

  const canHandover = canHandoverOpportunity(role);

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
            <dt style={{ color: 'var(--text-muted)' }}>创建于</dt>
            <dd style={{ margin: 0 }}>{new Date(opp.created_at).toLocaleString('zh-CN')}</dd>
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
    </div>
  );
}
