import { describe, it, expect, vi, beforeEach } from 'vitest';

// `vi.hoisted` lets us share mock refs between the vi.mock factory and
// individual tests — needed because vi.mock factories are hoisted to the
// top of the file, BEFORE any `let`/`const` declarations.
const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock('./supabase', () => ({
  supabase: {
    functions: {
      invoke: mocks.invoke,
    },
  },
}));

// Import AFTER vi.mock so it picks up the hoisted mock.
import { AdminError, callAdmin } from './admin';

describe('AdminError class', () => {
  it('is an Error subclass and exposes message + name', () => {
    const err = new AdminError('boom');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AdminError);
    expect(err.message).toBe('boom');
    expect(err.name).toBe('AdminError');
  });

  it('exposes the code when provided', () => {
    const err = new AdminError('forbidden', 'FORBIDDEN');
    expect(err.message).toBe('forbidden');
    expect(err.code).toBe('FORBIDDEN');
  });

  it('leaves code undefined when omitted', () => {
    const err = new AdminError('boom');
    expect(err.code).toBeUndefined();
  });
});

describe('callAdmin() — happy path', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
  });

  it('returns the ok envelope when the Edge Function reports success', async () => {
    const payload = [{ id: '1', email: 'a@b.co', display_name: 'X', role: 'pm', created_at: '2026-01-01T00:00:00.000Z' }];
    mocks.invoke.mockResolvedValueOnce({
      data: { ok: true, data: payload },
      error: null,
    });

    const res = await callAdmin<{ id: string }[]>({ action: 'list' });

    expect(res.ok).toBe(true);
    expect(res.data).toEqual(payload);
    expect(res.error).toBeUndefined();
    // Verify the call was made against the right Edge Function name + action.
    expect(mocks.invoke).toHaveBeenCalledWith(
      'admin-users',
      expect.objectContaining({ body: expect.objectContaining({ action: 'list' }) }),
    );
  });

  it('passes the action body through to functions.invoke verbatim', async () => {
    mocks.invoke.mockResolvedValueOnce({
      data: { ok: true, data: { id: 'u1' } },
      error: null,
    });

    await callAdmin({
      action: 'update-role',
      user_id: '11111111-1111-1111-1111-111111111111',
      role: 'pm',
    });

    expect(mocks.invoke).toHaveBeenCalledWith('admin-users', {
      body: {
        action: 'update-role',
        user_id: '11111111-1111-1111-1111-111111111111',
        role: 'pm',
      },
    });
  });
});

describe('callAdmin() — error envelopes', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
  });

  it('throws AdminError when envelope.ok is false (Edge Function rejects)', async () => {
    mocks.invoke.mockResolvedValue({
      data: { ok: false, error: '权限不足' },
      error: null,
    });

    const promise = callAdmin({ action: 'list' });
    await expect(promise).rejects.toBeInstanceOf(AdminError);
    await expect(promise).rejects.toThrow('权限不足');
  });

  it('throws AdminError when functions.invoke returns a transport error', async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: { message: 'Edge Function down' },
    });

    const promise = callAdmin({ action: 'list' });
    await expect(promise).rejects.toBeInstanceOf(AdminError);
    await expect(promise).rejects.toThrow('Edge Function down');
  });

  it('throws AdminError when the response body is empty (default error message)', async () => {
    // `data` and `error` both falsy — admin.ts falls back to a default msg.
    mocks.invoke.mockResolvedValue({ data: null, error: null });

    const promise = callAdmin({ action: 'list' });
    await expect(promise).rejects.toBeInstanceOf(AdminError);
    await expect(promise).rejects.toThrow(/空响应|操作失败/);
  });
});

describe('callAdmin() — supabase not configured (env unset)', () => {
  // This block uses `vi.resetModules` + `vi.doMock` to re-import `admin`
  // with `supabase === null` — a runtime mock that overrides the hoisted
  // factory above for the duration of one test.

  beforeEach(() => {
    mocks.invoke.mockReset();
  });

  it('throws an AdminError explaining the env is missing', async () => {
    vi.resetModules();
    vi.doMock('./supabase', () => ({ supabase: null }));
    const adminModule = await import('./admin');
    const { callAdmin: callAdminUnconfigured, AdminError: AdminErrorFresh } = adminModule;

    const promise = callAdminUnconfigured({ action: 'list' });
    // Use the AdminError from the freshly-imported module — `instanceof`
    // is tied to class identity, which differs across module instances.
    await expect(promise).rejects.toBeInstanceOf(AdminErrorFresh);
    await expect(promise).rejects.toThrow(/未配置/);
    // The early-return branch fires before any network call.
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
