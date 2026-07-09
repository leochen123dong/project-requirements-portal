import type { Comment } from '../types/contracts';

export interface CommentListProps {
  comments: Comment[];
  /** Map author_id -> display name. Falls back to a short id when missing. */
  resolveAuthor?: (id: string) => string | undefined;
}

/**
 * Thread of comments for any target (opportunity / project / milestone / task).
 * Renders newest-at-bottom so the editor below it acts as a natural reply box.
 */
export default function CommentList({ comments, resolveAuthor }: CommentListProps) {
  if (comments.length === 0) {
    return (
      <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
        暂无评论 — 来留下第一条吧
      </p>
    );
  }

  const sorted = [...comments].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {sorted.map((c) => {
        const author = resolveAuthor?.(c.author_id) ?? formatAuthorId(c.author_id);
        return (
          <li
            key={c.id}
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
              <span
                className="user-avatar"
                style={{ width: 24, height: 24, fontSize: 11 }}
                aria-hidden
              >
                {(author || '?').slice(0, 1).toUpperCase()}
              </span>
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>{author}</span>
              <span>{formatTime(c.created_at)}</span>
            </div>
            <div style={{ whiteSpace: 'pre-wrap', paddingLeft: 32 }}>{c.body}</div>
          </li>
        );
      })}
    </ul>
  );
}

function formatAuthorId(id: string): string {
  return `${id.slice(0, 6)}…`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      hour12: false,
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
