import type { Milestone, MilestoneStatus } from '../types/contracts';

const STATUS_LABEL: Record<MilestoneStatus, string> = {
  pending: '待开始',
  in_progress: '进行中',
  done: '已完成',
  blocked: '阻塞',
};

export interface MilestoneTimelineProps {
  milestones: Milestone[];
  onEdit?: (m: Milestone) => void;
  emptyState?: React.ReactNode;
}

/**
 * Vertical milestone timeline. Reuses `.timeline` / `.timeline-item` /
 * `.timeline-dot` from global.css and adds status colour-coding.
 */
export default function MilestoneTimeline({ milestones, onEdit, emptyState }: MilestoneTimelineProps) {
  if (milestones.length === 0) {
    return <>{emptyState ?? <p style={{ color: 'var(--text-muted)' }}>暂无里程碑</p>}</>;
  }

  const sorted = [...milestones].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return (
    <ul className="timeline" style={{ listStyle: 'none', margin: 0, padding: '0 0 0 24px' }}>
      {sorted.map((m) => (
        <li key={m.id} className="timeline-item">
          <span className={`timeline-dot ${m.status}`} />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>{m.name}</div>
              <div className="timeline-time">
                {m.phase} · 截止 {m.due_date}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className={`tag tag-${statusTag(m.status)}`}>{STATUS_LABEL[m.status]}</span>
              {onEdit && (
                <button className="btn btn-sm btn-ghost" onClick={() => onEdit(m)}>
                  编辑
                </button>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function statusTag(s: MilestoneStatus): 'success' | 'danger' | 'warning' | 'info' | 'neutral' {
  switch (s) {
    case 'done':
      return 'success';
    case 'blocked':
      return 'danger';
    case 'in_progress':
      return 'warning';
    case 'pending':
    default:
      return 'neutral';
  }
}
