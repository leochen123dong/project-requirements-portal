import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ithubTicketUrl, syncITHubTickets } from './ithub';

/**
 * ithubTicketUrl is a pure helper — no network required.
 * We use vi.stubEnv to override VITE_ITHUB_PORTAL_BASE per-test.
 *
 * syncITHubTickets falls through to mock data when supabase is null (which
 * it is in this repo's dev/CI environment when no Supabase env is set).
 * The mock-data shape and timing-relative assertions are validated here.
 */

describe('ithubTicketUrl() — pure URL helper', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to demo.logicalisservice.com when env not set', () => {
    // Don't stub → env var is absent in test process.
    expect(ithubTicketUrl('T-1001')).toBe('https://demo.logicalisservice.com/tickets/T-1001');
  });

  it('honors VITE_ITHUB_PORTAL_BASE override', () => {
    vi.stubEnv('VITE_ITHUB_PORTAL_BASE', 'https://ithub.example.com');
    expect(ithubTicketUrl('T-1001')).toBe('https://ithub.example.com/tickets/T-1001');
  });

  it('URL-encodes special characters in the ticket id', () => {
    // Slash → %2F, space → %20, hash → %23
    const url = ithubTicketUrl('T 1001/abc#x');
    expect(url).toContain('T%201001%2Fabc%23x');
    // The base itself must NOT be encoded.
    expect(url.startsWith('https://demo.logicalisservice.com/tickets/')).toBe(true);
  });

  it('handles empty-string ticket id without crashing', () => {
    const url = ithubTicketUrl('');
    expect(url).toBe('https://demo.logicalisservice.com/tickets/');
  });
});

describe('syncITHubTickets() — mock-data fallback when supabase is null', () => {
  it('returns 3 mock tickets when supabase is not configured', async () => {
    // `supabase` is null in this repo's default test env (no .env loaded
    // and no env vars injected). The helper falls through to the mock
    // branch — no network is touched.
    const res = await syncITHubTickets();
    expect(res.tickets).toHaveLength(3);
    expect(res.pulled).toBe(3);
    expect(res.errors).toEqual([]);
    expect(typeof res.ran_at).toBe('string');
  });

  it('mock tickets have the expected ids + statuses + at least one with sla_breach_at', async () => {
    const res = await syncITHubTickets();
    const ids = res.tickets.map((t) => t.ithub_id).sort();
    expect(ids).toEqual(['T-0998', 'T-1001', 'T-1002']);

    const subjects = res.tickets.map((t) => t.subject);
    for (const s of subjects) {
      expect(s.startsWith('【示例】')).toBe(true);
    }

    // T-1001 is +4h, T-1002 is +28h (open), T-0998 is closed (null).
    const open = res.tickets.find((t) => t.ithub_id === 'T-1001');
    const closed = res.tickets.find((t) => t.ithub_id === 'T-0998');
    expect(open?.sla_breach_at).not.toBeNull();
    expect(closed?.sla_breach_at).toBeNull();
    expect(closed?.status).toBe('closed');
  });

  it('passes projectId through to all mock tickets', async () => {
    const projectId = 'deadbeef-dead-beef-dead-beefdeadbeef';
    const res = await syncITHubTickets(projectId);
    for (const t of res.tickets) {
      expect(t.project_id).toBe(projectId);
    }
  });
});
