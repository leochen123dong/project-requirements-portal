import { useRef, useState } from 'react';
import type { Artifact, ArtifactType } from '../types/contracts';
import { supabase } from '../api/supabase';
import { useAuthStore } from '../store/authStore';
import { useToast } from '../hooks/useToast';
import { asTypedClient } from '../hooks/useSupabaseClient';

const ARTIFACT_LABEL: Record<string, string> = {
  'HT-JL-01': 'HT-JL-01 技术方案',
  'HT-JL-02': 'HT-JL-02 网络拓扑',
  'HT-JL-03-1': 'HT-JL-03-1 实施计划',
  SOW: 'SOW 工作说明书',
  CONTRACT: 'CONTRACT 合同',
};

export interface ArtifactUploaderProps {
  projectId: string;
  /** Already-uploaded artifacts (one per type, typically). */
  artifacts: Artifact[];
  onChange?: () => void;
  /** Hide the remove button (used by viewers that shouldn't delete). */
  readOnly?: boolean;
}

interface UploadState {
  status: 'idle' | 'uploading' | 'error';
  progress: number;
  error?: string;
}

/**
 * 5 required artifact slots (HT-JL-01/02/03-1, SOW, CONTRACT) backed by
 * Supabase Storage bucket `artifacts`. Tracks each slot's upload progress.
 */
export default function ArtifactUploader({
  projectId,
  artifacts,
  onChange,
  readOnly = false,
}: ArtifactUploaderProps) {
  const userId = useAuthStore((s) => s.profile?.id ?? null);
  const toast = useToast();
  const client = asTypedClient(supabase);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [state, setState] = useState<Record<string, UploadState>>({});

  const latestByType = new Map<string, Artifact>();
  for (const a of artifacts) {
    const cur = latestByType.get(a.type);
    if (!cur || cur.created_at < a.created_at) latestByType.set(a.type, a);
  }

  const required: ArtifactType[] = ['HT-JL-01', 'HT-JL-02', 'HT-JL-03-1', 'SOW', 'CONTRACT'];
  const completed = required.filter((t) => latestByType.has(t)).length;

  const handleFile = async (type: ArtifactType, file: File) => {
    if (!supabase) {
      toast.error('Supabase 未配置,无法上传');
      return;
    }
    if (!client) return;
    if (!userId) {
      toast.error('请先登录后再上传');
      return;
    }
    setState((s) => ({ ...s, [type]: { status: 'uploading', progress: 0 } }));
    try {
      const safe = file.name.replace(/[^\w.\-]/g, '_');
      const path = `${projectId}/${type}-${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage
        .from('artifacts')
        .upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { error: dbErr } = await client.from('artifacts').insert({
        project_id: projectId,
        type,
        storage_path: path,
        uploaded_by: userId,
      });
      if (dbErr) throw dbErr;
      setState((s) => ({ ...s, [type]: { status: 'idle', progress: 1 } }));
      toast.success(`${ARTIFACT_LABEL[type]} 上传成功`);
      onChange?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '上传失败';
      setState((s) => ({ ...s, [type]: { status: 'error', progress: 0, error: msg } }));
      toast.error(msg);
    }
  };

  const handleRemove = async (a: Artifact) => {
    if (!supabase) return;
    if (!client) return;
    if (!confirm(`确定移除 ${ARTIFACT_LABEL[a.type] ?? a.type}?`)) return;
    try {
      await supabase.storage.from('artifacts').remove([a.storage_path]);
      const { error } = await client.from('artifacts').delete().eq('id', a.id);
      if (error) throw error;
      toast.success('已移除');
      onChange?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '移除失败');
    }
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <strong>交付物 ({completed}/{required.length})</strong>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          进度 {Math.round((completed / required.length) * 100)}%
        </span>
      </div>
      <div
        style={{
          height: 6,
          background: 'var(--surface-2)',
          borderRadius: 4,
          overflow: 'hidden',
          marginBottom: 16,
        }}
      >
        <div
          style={{
            width: `${(completed / required.length) * 100}%`,
            height: '100%',
            background: 'var(--brand-primary)',
            transition: 'width .2s ease',
          }}
        />
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {required.map((t) => {
          const existing = latestByType.get(t);
          const st = state[t] ?? { status: 'idle' as const, progress: 0 };
          return (
            <li
              key={t}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 0',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <span
                className={`tag ${existing ? 'tag-success' : 'tag-neutral'}`}
                style={{ minWidth: 100, textAlign: 'center' }}
              >
                {t}
              </span>
              <span style={{ flex: 1, color: existing ? 'var(--text)' : 'var(--text-muted)' }}>
                {ARTIFACT_LABEL[t] ?? t}
              </span>
              {st.status === 'uploading' && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>上传中...</span>
              )}
              {st.status === 'error' && (
                <span style={{ fontSize: 12, color: 'var(--danger)' }}>{st.error}</span>
              )}
              {existing && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {existing.storage_path.split('/').pop()}
                </span>
              )}
              <input
                ref={(el) => {
                  inputRefs.current[t] = el;
                }}
                type="file"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(t, f);
                  e.target.value = '';
                }}
              />
              {!readOnly && (
                <>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => inputRefs.current[t]?.click()}
                    disabled={st.status === 'uploading'}
                  >
                    {existing ? '替换' : '上传'}
                  </button>
                  {existing && (
                    <button className="btn btn-sm btn-danger" onClick={() => handleRemove(existing)}>
                      移除
                    </button>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
