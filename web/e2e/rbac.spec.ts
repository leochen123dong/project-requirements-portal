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
});
