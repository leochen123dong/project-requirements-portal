/**
 * ITHub HTTP client.
 *
 * Wraps the small slice of the ITHub ServiceDesk API that the portal needs:
 *   - GET /api/ServiceDesk/Tickets/CheckPoint                (Unix ms checkpoint)
 *   - GET /api/ServiceDesk/Customers/{tag}/Tickets?checkpoint={ms}
 *   - GET /api/ServiceDesk/Tickets/{id}/TicketJournals
 *   - POST /api/ServiceDesk/Tickets/{id}/Status              (best-effort)
 *
 * Authentication uses a single API Key header — `Authorization: ApiKey <key>` —
 * which matches the ITHub auth model (see
 * `小助理的大别墅/ITHub-API-分析/ITHub_API_AI_Native_Platform_Analysis.md`).
 *
 * The base URL and key are read from environment variables set on the Supabase
 * project (or in `supabase/functions/.env` for local dev). Missing config is a
 * hard error — callers should fall back to mock mode instead.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Shape of a raw ticket as returned by ITHub's Customer Tickets endpoint.
 * Field names follow ITHub's PascalCase convention. We map to snake_case
 * (the Postgres column names) at the boundary in `ithub-sync/index.ts`.
 *
 * Keep this interface permissive: ITHub's actual response may include
 * additional fields (e.g. priority, customerTag, assignee), and the portal
 * only cares about a subset.
 */
export interface ITHubRawTicket {
  /** ITHub's ticket identifier (e.g. "T-1001"). */
  id: string;
  /** Short human-readable title. */
  subject: string;
  /** Free-form status string from ITHub (open / in_progress / closed / ...). */
  status: string;
  /** SLA breach deadline (ISO 8601 string). Null when no SLA applies. */
  sla_breach_at: string | null;
  /** Last update timestamp from ITHub (ISO 8601 string). */
  updated_at: string;
  /** Tenant tag this ticket belongs to (e.g. "default"). */
  customer_tag: string;
}

/**
 * A single entry in a ticket's journal (timeline of events). Used for richer
 * ticket detail views in the future — currently exposed via getTicketJournals()
 * but not persisted by the sync.
 */
export interface ITHubJournal {
  id: string;
  ticket_id: string;
  author: string;
  body: string;
  created_at: string;
}

// ─── Client ─────────────────────────────────────────────────────────────────

export class ITHubClient {
  private readonly base: string;
  private readonly apiKey: string;
  private readonly customerTag: string;

  constructor(env: { apiBase?: string; apiKey?: string; customerTag?: string } = {}) {
    const apiBase = env.apiBase ?? Deno.env.get('ITHUB_API_BASE');
    const apiKey = env.apiKey ?? Deno.env.get('ITHUB_API_KEY');
    const customerTag = env.customerTag ?? Deno.env.get('ITHUB_CUSTOMER_TAG');

    if (!apiBase) {
      throw new Error(
        'ITHUB_API_BASE is not set. Configure it as a Supabase Edge Function secret ' +
          'or set ITHUB_MOCK=true to use mock data.',
      );
    }
    if (!apiKey) {
      throw new Error(
        'ITHUB_API_KEY is not set. Configure it as a Supabase Edge Function secret ' +
          'or set ITHUB_MOCK=true to use mock data.',
      );
    }

    // Strip trailing slashes so concatenation is predictable.
    this.base = apiBase.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.customerTag = customerTag ?? 'default';
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Fetch the global checkpoint — a Unix millisecond timestamp that callers can
   * use as a "since" cursor for incremental sync (see
   * ITHub_API_AI_Native_Platform_Analysis.md §2.1).
   */
  async getCheckpoint(): Promise<number> {
    const res = await this.request('GET', '/api/ServiceDesk/Tickets/CheckPoint');
    if (typeof res !== 'number') {
      // ITHub returns the timestamp as a plain JSON number. Anything else is
      // a contract change we don't know how to interpret.
      throw new Error(
        `Unexpected CheckPoint response shape: expected number, got ${typeof res}`,
      );
    }
    return res;
  }

  /**
   * List tickets for the configured tenant, optionally filtered to those
   * updated after `sinceCheckpoint` (Unix ms).
   */
  async listTickets(sinceCheckpoint?: number): Promise<ITHubRawTicket[]> {
    const qs = sinceCheckpoint !== undefined
      ? `?checkpoint=${encodeURIComponent(String(sinceCheckpoint))}`
      : '';
    const path = `/api/ServiceDesk/Customers/${
      encodeURIComponent(this.customerTag)
    }/Tickets${qs}`;
    const data = await this.request('GET', path);
    if (!Array.isArray(data)) {
      throw new Error(
        `Unexpected listTickets response shape: expected array, got ${typeof data}`,
      );
    }
    return data as ITHubRawTicket[];
  }

  /** Fetch the journal (timeline) for a single ticket. */
  async getTicketJournals(ithubId: string): Promise<ITHubJournal[]> {
    if (!ithubId) throw new Error('getTicketJournals: ithubId is required');
    const path = `/api/ServiceDesk/Tickets/${
      encodeURIComponent(ithubId)
    }/TicketJournals`;
    const data = await this.request('GET', path);
    if (!Array.isArray(data)) {
      throw new Error(
        `Unexpected getTicketJournals response shape: expected array, got ${typeof data}`,
      );
    }
    return data as ITHubJournal[];
  }

  /**
   * Push a status update back to ITHub. Best-effort: the ITHub status-update
   * endpoint shape isn't formally documented in the analysis report, so we
   * send a generic JSON body and let the server side decide. Errors are
   * surfaced to the caller via thrown exceptions.
   */
  async pushStatus(ithubId: string, status: string, note: string): Promise<void> {
    if (!ithubId) throw new Error('pushStatus: ithubId is required');
    if (!status) throw new Error('pushStatus: status is required');
    const path = `/api/ServiceDesk/Tickets/${encodeURIComponent(ithubId)}/Status`;
    await this.request('POST', path, { status, note });
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  /**
   * Authenticated JSON request. Throws on non-2xx with a message containing
   * the endpoint and status, so callers can surface useful errors to the UI
   * without leaking the API key.
   */
  private async request(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const url = `${this.base}${path}`;
    const headers: Record<string, string> = {
      Authorization: `ApiKey ${this.apiKey}`,
      Accept: 'application/json',
    };
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (e) {
      // Network error (DNS, TCP, TLS) — wrap so callers see a useful message.
      throw new Error(
        `ITHub request failed (${method} ${path}): ${(e as Error).message}`,
      );
    }

    if (!res.ok) {
      // Try to extract ITHub's error message; fall back to the status text.
      const text = await res.text().catch(() => '');
      throw new Error(
        `ITHub request failed (${method} ${path}): ${res.status} ${res.statusText}` +
          (text ? ` — ${text.slice(0, 200)}` : ''),
      );
    }

    // Some endpoints (CheckPoint) return a bare number, not a JSON object.
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      return await res.json();
    }
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
}