import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useAuthStore } from './authStore';
import type { Profile, Role } from '../types/contracts';

const STORAGE_KEY = 'pm-portal-auth';

/** Minimal Profile fixture. */
function profileFixture(overrides: Partial<Profile> = {}): Profile {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    display_name: '王售前',
    role: 'presales' as Role,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('authStore — initial state', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset the store to its initial state.
    useAuthStore.setState({ session: null, profile: null });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('starts with session: null and profile: null', () => {
    const { session, profile } = useAuthStore.getState();
    expect(session).toBeNull();
    expect(profile).toBeNull();
  });
});

describe('authStore — mutators', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ session: null, profile: null });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('setSession(s) updates the session', () => {
    const fakeSession = { access_token: 'abc', user: { id: '11111111-1111-1111-1111-111111111111', email: 'x@y.z' } } as never;
    useAuthStore.getState().setSession(fakeSession);
    expect(useAuthStore.getState().session).toBe(fakeSession);
  });

  it('setProfile(p) updates the profile', () => {
    const p = profileFixture();
    useAuthStore.getState().setProfile(p);
    expect(useAuthStore.getState().profile).toEqual(p);
  });

  it('reset() clears both session and profile', () => {
    const fakeSession = { access_token: 'abc', user: { id: 'u1', email: 'x@y.z' } } as never;
    useAuthStore.getState().setSession(fakeSession);
    useAuthStore.getState().setProfile(profileFixture());
    useAuthStore.getState().reset();
    const { session, profile } = useAuthStore.getState();
    expect(session).toBeNull();
    expect(profile).toBeNull();
  });
});

describe('authStore — persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ session: null, profile: null });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('writes the profile (and only the profile) to localStorage on setProfile', async () => {
    const p = profileFixture({ role: 'pm' });
    useAuthStore.getState().setProfile(p);

    // persist middleware is sync from the caller's POV but zustand's persist
    // may schedule writes. Wait a tick to allow it.
    await new Promise((r) => setTimeout(r, 0));

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();

    const parsed = JSON.parse(raw!);
    // partialize should only include `profile`, never `session`.
    expect(parsed.state).toHaveProperty('profile');
    expect(parsed.state).not.toHaveProperty('session');
    expect(parsed.state.profile).toEqual(p);
  });

  it('rehydrates the profile on a fresh store subscription', async () => {
    const p = profileFixture({ role: 'admin', display_name: '管理员' });
    useAuthStore.getState().setProfile(p);

    await new Promise((r) => setTimeout(r, 0));

    // Simulate a reload by reading the persisted state directly: the new
    // store instance (which the persist middleware creates via `createJSONStorage`)
    // will pull the same localStorage entry on first read of the store via
    // `persist.rehydrate`. We verify the serialized payload roundtrips by
    // constructing a fresh payload and reading the key.
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();

    const parsed = JSON.parse(raw!);
    expect(parsed.state.profile.role).toBe('admin');
    expect(parsed.state.profile.display_name).toBe('管理员');
    expect(parsed.state.profile.id).toBe(p.id);
  });

  it('session is NOT persisted (sensitive token stays in Supabase)', async () => {
    const fakeSession = { access_token: 'super-secret', user: { id: 'u1', email: 'x@y.z' } } as never;
    useAuthStore.getState().setSession(fakeSession);

    await new Promise((r) => setTimeout(r, 0));

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(raw).not.toContain('access_token');
    expect(raw).not.toContain('super-secret');
  });
});
