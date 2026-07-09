import { test, expect } from '@playwright/test';
import {
  PAGE_PERMISSIONS,
  canCreateOpportunity,
  canHandoverOpportunity,
  canEditProject,
  canAssignTask,
  canCompleteTask,
  canSyncITHub,
  canViewAdminDashboard,
  canManageUsers,
  canManageCustomFields,
  can,
} from '../src/utils/rbac';
import { ROLES, type Role } from '../src/types/contracts';

/**
 * Pure-Node RBAC validation — the matrix from docs/ROLES.md checked against
 * the helpers and the page-permission map.
 *
 * Keeping this as `*.spec.ts` (under e2e/) per the project structure, even
 * though no browser/page is exercised. Playwright will still discover and
 * run it; we just don't use the page fixture.
 */

const ROLE_GRID: Record<Role, Record<string, boolean>> = {
  presales: {
    createOpportunity: true,
    handoverOpportunity: true,
    viewProject: true,
    uploadArtifact: true,
    comment: true,
  },
  pm: {
    editProject: true,
    viewProject: true,
    editMilestone: true,
    assignTask: true,
    completeTask: true,
    uploadArtifact: true,
    comment: true,
    viewTicket: true,
  },
  delivery: {
    viewProject: true,
    assignTask: true,
    completeTask: true,
    uploadArtifact: true,
    comment: true,
  },
  postsales: {
    viewProject: true,
    comment: true,
    viewTicket: true,
    syncITHub: true,
  },
  admin: {
    createOpportunity: true,
    handoverOpportunity: true,
    editProject: true,
    viewProject: true,
    editMilestone: true,
    assignTask: true,
    completeTask: true,
    uploadArtifact: true,
    comment: true,
    viewTicket: true,
    syncITHub: true,
    viewAdminDashboard: true,
  },
};

const ACTION_HELPER: Record<string, (r: Role) => boolean> = {
  createOpportunity: canCreateOpportunity,
  handoverOpportunity: canHandoverOpportunity,
  editProject: canEditProject,
  viewProject: (r) => can(r, ['presales', 'pm', 'delivery', 'postsales', 'admin']),
  editMilestone: canEditProject, // same matrix cell
  assignTask: canAssignTask,
  completeTask: canCompleteTask,
  uploadArtifact: (r) => can(r, ['presales', 'pm', 'delivery', 'admin']),
  comment: (r) => can(r, ['presales', 'pm', 'delivery', 'postsales', 'admin']),
  viewTicket: (r) => can(r, ['pm', 'postsales', 'admin']),
  syncITHub: canSyncITHub,
  viewAdminDashboard: canViewAdminDashboard,
};

test.describe('rbac matrix (docs/ROLES.md source of truth)', () => {
  test('PAGE_PERMISSIONS exposes the 5 implemented pages', () => {
    expect(Object.keys(PAGE_PERMISSIONS).sort()).toEqual(
      ['admin', 'home', 'opportunities', 'projects', 'tickets'],
    );
  });

  test('every role × action cell agrees with helpers', () => {
    for (const role of ROLES) {
      const actions = ROLE_GRID[role];
      for (const action of Object.keys(actions)) {
        const expected = actions[action];
        const helper = ACTION_HELPER[action];
        expect(helper, `missing helper mapping for action=${action}`).toBeDefined();
        expect(
          helper!(role),
          `${role} × ${action} should be ${expected}`,
        ).toBe(expected);
      }
    }
  });

  test('admin is universal bypass', () => {
    expect(can('admin', [])).toBe(true);
    expect(can('admin', ['only-pm'])).toBe(true);
  });

  test('non-admin roles do NOT bypass', () => {
    expect(can('pm', [])).toBe(false);
    expect(can('presales', ['admin'])).toBe(false); // presales is not in {admin}
  });

  test('admin page is admin-only', () => {
    for (const role of ROLES) {
      expect(can(role, PAGE_PERMISSIONS.admin)).toBe(role === 'admin');
    }
  });

  // ── v0.2 (Phase D additions) ──────────────────────────────────────────
  // Sources of truth:
  //   - docs/ROLES.md (invite / update-role / delete = admin only)
  //   - docs/ROLES.md (custom-field create/edit/delete = admin only)
  // These mirror tests in src/utils/rbac.test.ts; running both is intentional
  // so the matrix coverage stays consistent across the Vitest + Playwright
  // executors (and any future refactor that splits test ownership).
  test('canManageUsers is admin-only (every role × cell)', () => {
    for (const role of ROLES) {
      expect(canManageUsers(role), `canManageUsers(${role})`).toBe(role === 'admin');
    }
  });

  test('canManageCustomFields is admin-only (every role × cell)', () => {
    for (const role of ROLES) {
      expect(canManageCustomFields(role), `canManageCustomFields(${role})`).toBe(
        role === 'admin',
      );
    }
  });

  test('admin bypass: canManageUsers + canManageCustomFields return true for admin regardless of input list', () => {
    // Sanity check — admin should always pass both helpers.
    expect(canManageUsers('admin')).toBe(true);
    expect(canManageCustomFields('admin')).toBe(true);
    // And non-admins never do.
    expect(canManageUsers('pm')).toBe(false);
    expect(canManageCustomFields('pm')).toBe(false);
  });
});
