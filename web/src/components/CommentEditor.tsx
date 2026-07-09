import { useState } from 'react';
import type { CommentTargetType } from '../types/contracts';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../api/supabase';
import { useToast } from '../hooks/useToast';
import { asTypedClient } from '../hooks/useSupabaseClient';

export interface CommentEditorProps {
  targetType: CommentTargetType;
  targetId: string;
  onPosted?: () => void;
}

/**
 * Single-line editor that inserts a row into `comments`. The parent page
 * subscribes to realtime changes on the same target_id and refetches.
 */
export default function CommentEditor({ targetType, targetId, onPosted }: CommentEditorProps) {
  const userId = useAuthStore((s) => s.profile?.id ?? null);
  const toast = useToast();
  const client = asTypedClient(supabase);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    if (!userId) {
      toast.error('请先登录后再发表评论');
      return;
    }
    if (!client) {
      toast.error('Supabase 未配置,无法发表评论');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await client.from('comments').insert({
        target_type: targetType,
        target_id: targetId,
        author_id: userId,
        body: trimmed,
      });
      if (error) throw error;
      setBody('');
      onPosted?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '发表评论失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <textarea
        className="textarea"
        placeholder="发表评论..."
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            void submit();
          }
        }}
        rows={3}
      />
      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Cmd/Ctrl + Enter 发送</span>
        <button className="btn btn-primary btn-sm" disabled={submitting || !body.trim()} onClick={submit}>
          {submitting ? '发送中...' : '发送'}
        </button>
      </div>
    </div>
  );
}
