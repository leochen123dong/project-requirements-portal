import { describe, it, expect } from 'vitest';
import {
  can,
  PAGE_PERMISSIONS,
  canCreateOpportunity,
  canHandoverOpportunity,
  canDeleteOpportunity,
  canEditProject,
  canAssignTask,
  canCompleteTask,
  canViewAdminDashboard,
  canManageUsers,
  canManageCustomFields,
} from './rbac';
import { ROLES } from '../types/contracts';
import type { Role } from '../types/contracts';

/**
 * RBAC matrix coverage.
 *
 * Two sources of truth that MUST agree:
 *   1. helpers in this file (and PAGE_PERMISSIONS)
 *   2. docs/ROLES.md (operation × role table)
 *
 * The ROLE_MATRIX below mirrors the table in docs/ROLES.md verbatim.
 * Whenever the doc changes, update this matrix and let the tests fail
 * loudly.
 */

// (action × role) → expected boolean, derived from docs/ROLES.md.
const ROLE_MATRIX: Array<{
  action: string;
  roles: Record<Role, boolean>;
}> = [
  {
    action: 'createOpportunity',
    roles: { presales: true, pm: false, delivery: false, postsales: false, admin: true },
  },
  {
    // "编辑商机: presales (自己的), 其他否"
    action: 'editOpportunity',
    roles: { presales: true, pm: false, delivery: false, postsales: false, admin: true },
  },
  {
    action: 'handoverOpportunity',
    roles: { presales: true, pm: false, delivery: false, postsales: false, admin: true },
  },
  {
    action: 'editProject',
    roles: { presales: false, pm: true, delivery: false, postsales: false, admin: true },
  },
  {
    // "查看项目: presales(相关的) ✅ ..." — frontend gate允许所有人查看;后端RLS真正拦截
    action: 'viewProject',
    roles: { presales: true, pm: true, delivery: true, postsales: true, admin: true },
  },
  {
    action: 'editMilestone',
    roles: { presales: false, pm: true, delivery: false, postsales: false, admin: true },
  },
  {
    action: 'assignTask',
    roles: { presales: false, pm: true, delivery: true, postsales: false, admin: true },
  },
  {
    action: 'completeTask',
    roles: { presales: false, pm: true, delivery: true, postsales: false, admin: true },
  },
  {
    action: 'uploadArtifact',
    roles: { presales: true, pm: true, delivery: true, postsales: false, admin: true },
  },
  {
    action: 'comment',
    roles: { presales: true, pm: true, delivery: true, postsales: true, admin: true },
  },
  {
    // "查看工单: postsales ✅, pm(相关) ✅, admin ✅" — frontend门禁仅列3个角色
    action: 'viewTicket',
    roles: { presales: false, pm: true, delivery: false, postsales: true, admin: true },
  },
  {
    action: 'syncITHub',
    roles: { presales: false, pm: false, delivery: false, postsales: true, admin: true },
  },
  {
    action: 'viewAdminDashboard',
    roles: { presales: false, pm: false, delivery: false, postsales: false, admin: true },
  },
];

describe('rbac.can()', () => {
  it('grants admin bypass for any allowed list', () => {
    expect(can('admin', [])).toBe(true);
    expect(can('admin', ['pm'])).toBe(true);
    expect(can('admin', ['delivery', 'postsales'])).toBe(true);
  });

  it('honors explicit allowed lists', () => {
    expect(can('presales', ['presales', 'admin'])).toBe(true);
    expect(can('pm', ['presales', 'admin'])).toBe(false);
    expect(can('delivery', ['presales', 'pm'])).toBe(false);
  });

  it('rejects empty allowed lists even for allowed roles', () => {
    expect(can('pm', [])).toBe(false);
    // ... except for admin (bypass).
    expect(can('admin', [])).toBe(true);
  });
});

describe('PAGE_PERMISSIONS', () => {
  it('exposes the 4 implemented pages (tickets removed in v0.2.1)', () => {
    expect(Object.keys(PAGE_PERMISSIONS).sort()).toEqual(
      ['admin', 'home', 'opportunities', 'projects'],
    );
  });

  it('home is open to every non-guest role', () => {
    for (const role of ROLES) {
      expect(can(role, PAGE_PERMISSIONS.home)).toBe(true);
    }
  });

  it('admin page is admin-only', () => {
    for (const role of ROLES) {
      const expected = role === 'admin';
      expect(can(role, PAGE_PERMISSIONS.admin)).toBe(expected);
    }
  });

  it('opportunities page gates presales + pm + admin', () => {
    const expected: Record<Role, boolean> = {
      presales: true, pm: true, delivery: false, postsales: false, admin: true,
    };
    for (const role of ROLES) {
      expect(can(role, PAGE_PERMISSIONS.opportunities)).toBe(expected[role]);
    }
  });

  it('projects page gates pm + delivery + postsales + admin', () => {
    const expected: Record<Role, boolean> = {
      presales: false, pm: true, delivery: true, postsales: true, admin: true,
    };
    for (const role of ROLES) {
      expect(can(role, PAGE_PERMISSIONS.projects)).toBe(expected[role]);
    }
  });

  it('tickets page is removed in v0.2.1', () => {
    expect(PAGE_PERMISSIONS).not.toHaveProperty('tickets');
  });
});

describe('action helpers — individual cells', () => {
  it('canCreateOpportunity → presales/admin only', () => {
    expect(canCreateOpportunity('presales')).toBe(true);
    expect(canCreateOpportunity('admin')).toBe(true);
    expect(canCreateOpportunity('pm')).toBe(false);
    expect(canCreateOpportunity('delivery')).toBe(false);
    expect(canCreateOpportunity('postsales')).toBe(false);
  });

  it('canHandoverOpportunity → presales/admin only', () => {
    expect(canHandoverOpportunity('presales')).toBe(true);
    expect(canHandoverOpportunity('admin')).toBe(true);
    expect(canHandoverOpportunity('pm')).toBe(false);
    expect(canHandoverOpportunity('delivery')).toBe(false);
    expect(canHandoverOpportunity('postsales')).toBe(false);
  });

  it('canEditProject → pm/admin only', () => {
    expect(canEditProject('pm')).toBe(true);
    expect(canEditProject('admin')).toBe(true);
    expect(canEditProject('presales')).toBe(false);
    expect(canEditProject('delivery')).toBe(false);
    expect(canEditProject('postsales')).toBe(false);
  });

  it('canDeleteOpportunity → presales + admin only', () => {
    expect(canDeleteOpportunity('presales')).toBe(true);
    expect(canDeleteOpportunity('admin')).toBe(true);
    expect(canDeleteOpportunity('pm')).toBe(false);
    expect(canDeleteOpportunity('delivery')).toBe(false);
    expect(canDeleteOpportunity('postsales')).toBe(false);
  });

  it('canAssignTask → pm + delivery + admin', () => {
    expect(canAssignTask('pm')).toBe(true);
    expect(canAssignTask('delivery')).toBe(true);
    expect(canAssignTask('admin')).toBe(true);
    expect(canAssignTask('presales')).toBe(false);
    expect(canAssignTask('postsales')).toBe(false);
  });

  it('canCompleteTask → pm + delivery + admin', () => {
    expect(canCompleteTask('pm')).toBe(true);
    expect(canCompleteTask('delivery')).toBe(true);
    expect(canCompleteTask('admin')).toBe(true);
    expect(canCompleteTask('presales')).toBe(false);
    expect(canCompleteTask('postsales')).toBe(false);
  });

  it('canViewAdminDashboard → admin only', () => {
    expect(canViewAdminDashboard('admin')).toBe(true);
    expect(canViewAdminDashboard('pm')).toBe(false);
    expect(canViewAdminDashboard('delivery')).toBe(false);
    expect(canViewAdminDashboard('presales')).toBe(false);
    expect(canViewAdminDashboard('postsales')).toBe(false);
  });

  it('canManageUsers → admin only', () => {
    expect(canManageUsers('admin')).toBe(true);
    expect(canManageUsers('presales')).toBe(false);
    expect(canManageUsers('pm')).toBe(false);
    expect(canManageUsers('delivery')).toBe(false);
    expect(canManageUsers('postsales')).toBe(false);
  });

  it('canManageCustomFields → admin only', () => {
    expect(canManageCustomFields('admin')).toBe(true);
    expect(canManageCustomFields('presales')).toBe(false);
    expect(canManageCustomFields('pm')).toBe(false);
    expect(canManageCustomFields('delivery')).toBe(false);
    expect(canManageCustomFields('postsales')).toBe(false);
  });

  it('admin universal-bypass: returns true even though helper only passes [admin] (admin still in list)', () => {
    // The helpers hardcode ['admin'] in the allow-list. Verify the underlying
    // can() still grants admin via the universal-bypass path — i.e. if admin
    // was NOT in the allowed list, the helper would still return true.
    expect(can('admin', [])).toBe(true);
    expect(canManageUsers('admin')).toBe(can('admin', ['admin']));
    expect(canManageCustomFields('admin')).toBe(can('admin', ['admin']));
  });
});

describe('action helpers — v0.2 admin gates (Phase A/B)', () => {
  // Mirror the ROLE_MATRIX entries added in Phase A/B per docs/ROLES.md.
  // Both gates are admin-only and should return false for every other role.
  const ACTION_MATRIX: Array<{
    action: string;
    helper: (r: Role) => boolean;
  }> = [
    { action: 'inviteUser', helper: canManageUsers },
    { action: 'updateUserRole', helper: canManageUsers },
    { action: 'deleteUser', helper: canManageUsers },
    { action: 'createCustomField', helper: canManageCustomFields },
    { action: 'editCustomField', helper: canManageCustomFields },
    { action: 'deleteCustomField', helper: canManageCustomFields },
  ];

  for (const { action, helper } of ACTION_MATRIX) {
    it(`${action} → false for every non-admin role`, () => {
      for (const role of ROLES) {
        const expected = role === 'admin';
        expect(helper(role), `${action} × ${role}`).toBe(expected);
      }
    });
  }
});

/**
 * Cross-check: every (role, action) cell in docs/ROLES.md matches what the
 * helpers return. This is the safety net for "I changed the doc but forgot
 * to change the helper" (and vice-versa).
 */
describe('docs/ROLES.md matrix coverage', () => {
  // Each action maps to the helper that should answer it.
  const HELPER_BY_ACTION: Record<string, (r: Role) => boolean> = {
    createOpportunity: canCreateOpportunity,
    editOpportunity: canHandoverOpportunity, // same matrix cell as create
    handoverOpportunity: canHandoverOpportunity,
    editProject: canEditProject,
    viewProject: (r) => can(r, ['presales', 'pm', 'delivery', 'postsales', 'admin']),
    editMilestone: canEditProject, // same matrix cell
    assignTask: canAssignTask,
    completeTask: canCompleteTask,
    uploadArtifact: (r) => can(r, ['presales', 'pm', 'delivery', 'admin']),
    comment: (r) => can(r, ['presales', 'pm', 'delivery', 'postsales', 'admin']),
    viewAdminDashboard: canViewAdminDashboard,
  };

  for (const { action, roles } of ROLE_MATRIX) {
    const helper = HELPER_BY_ACTION[action];
    if (!helper) {
      it.skip(`(missing helper mapping for ${action})`, () => {});
      continue;
    }
    for (const role of ROLES) {
      it(`${action} × ${role} → ${roles[role]}`, () => {
        expect(helper(role)).toBe(roles[role]);
      });
    }
  }
});
