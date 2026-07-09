import type { ITHubTicket } from '../types/contracts';
import { ithubTicketUrl } from '../api/ithub';

export interface ITHubTicketCardProps {
  ticket: ITHubTicket;
  /** Show subject as a hyperlink to the ticket detail page. */
  showLink?: boolean;
}

const STATUS_TAG: Record<string, string> = {
  open: 'tag-warning',
  in_progress: 'tag-info',
  resolved: 'tag-success',
  closed: 'tag-neutral',
};

const STATUS_LABEL: Record<string, string> = {
  open: '待处理',
  in_progress: '处理中',
  resolved: '已解决',
  closed: '已关闭',
};

/**
 * Single ITHub ticket card: subject, status, SLA countdown and external link.
 * Colour-codes SLA using `.sla-countdown.ok` / `.warn` / `.breached`.
 */
export default function ITHubTicketCard({ ticket, showLink = true }: ITHubTicketCardProps) {
  const sla = formatSla(ticket.sla_breach_at, ticket.status);
  const statusTag = STATUS_TAG[ticket.status] ?? 'tag-neutral';
  const statusLabel = STATUS_LABEL[ticket.status] ?? ticket.status;

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{ticket.ithub_id}</span>
            <span className={`tag ${statusTag}`}>{statusLabel}</span>
          </div>
          <div
            style={{
              fontWeight: 600,
              fontSize: 15,
              marginBottom: 8,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={ticket.subject}
          >
            {showLink ? (
              <a href={ithubTicketUrl(ticket.ithub_id)} target="_blank" rel="noopener noreferrer">
                {ticket.subject}
              </a>
            ) : (
              ticket.subject
            )}
          </div>
          {sla && (
            <div className={`sla-countdown ${sla.tone}`} style={{ fontSize: 13 }}>
              <span aria-hidden>●</span>
              <span>{sla.label}</span>
            </div>
          )}
        </div>
        {showLink && (
          <a
            className="btn btn-sm btn-secondary"
            href={ithubTicketUrl(ticket.ithub_id)}
            target="_blank"
            rel="noopener noreferrer"
          >
            在 ITHub 中打开 ↗
          </a>
        )}
      </div>
    </div>
  );
}

interface SlaView {
  tone: 'breached' | 'warn' | 'ok';
  label: string;
}

function formatSla(iso: string | null, status: string): SlaView | null {
  if (status === 'closed' || status === 'resolved' || !iso) return null;
  const target = Date.parse(iso);
  if (Number.isNaN(target)) return null;
  const deltaMs = target - Date.now();
  if (deltaMs <= 0) {
    const past = Math.abs(deltaMs);
    return {
      tone: 'breached',
      label: `SLA 已超时 ${formatDuration(past)}`,
    };
  }
  if (deltaMs < 4 * 3600 * 1000) {
    return { tone: 'breached', label: `SLA 即将超时 ${formatDuration(deltaMs)}` };
  }
  if (deltaMs < 24 * 3600 * 1000) {
    return { tone: 'warn', label: `剩余 ${formatDuration(deltaMs)}` };
  }
  return { tone: 'ok', label: `剩余 ${formatDuration(deltaMs)}` };
}

function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const minutes = totalMin % 60;
  if (days > 0) return `${days}天${hours ? `${hours}小时` : ''}`;
  if (hours > 0) return `${hours}小时${minutes ? `${minutes}分` : ''}`;
  return `${minutes}分钟`;
}
