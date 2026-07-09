import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../api/supabase';
import { can, type Role } from '../utils/rbac';
import ToastContainer from './ToastContainer';
import RoleChip from './RoleChip';

/**
 * Top-level authenticated layout.
 * Phase 0 stub — Phase 2a will:
 *  - add user-avatar + role chip
 *  - add dropdown menu (登出 / 个人设置)
 *  - gate nav items by role via can()
 */
export default function Layout() {
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const navigate = useNavigate();

  // Phase 2a will hydrate profile from `profiles` table on session change.

  const role = (profile?.role ?? 'guest') as Role;
  const tabs = [
    { to: '/home', label: '首页', roles: ['presales', 'pm', 'delivery', 'postsales', 'admin'] as Role[] },
    { to: '/opportunities', label: '商机', roles: ['presales', 'pm', 'admin'] as Role[] },
    { to: '/projects', label: '项目', roles: ['pm', 'delivery', 'admin'] as Role[] },
    { to: '/tickets', label: '工单', roles: ['postsales', 'pm', 'admin'] as Role[] },
    { to: '/admin', label: '仪表盘', roles: ['admin'] as Role[] },
  ];

  async function handleSignOut() {
    if (supabase) await supabase.auth.signOut();
    navigate('/login');
  }

  return (
    <div className="app">
      <nav className="topnav topnav-dark">
        <div className="topnav-logo">
          <span className="topnav-logo-icon topnav-logo-icon-dark">P</span>
          <span>项目需求管理门户</span>
        </div>
        <div className="topnav-tabs">
          {tabs.filter((t) => can(role, t.roles)).map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) => 'topnav-tab' + (isActive ? ' active' : '')}
            >
              {t.label}
            </NavLink>
          ))}
        </div>
        <div className="topnav-user">
          {session ? (
            <>
              <span className="topnav-username">
                {profile?.display_name ?? session.user.email}
              </span>
              {profile ? <RoleChip role={profile.role} /> : null}
              <button className="btn btn-sm btn-ghost" onClick={handleSignOut}>
                登出
              </button>
            </>
          ) : (
            <span className="topnav-username">未登录</span>
          )}
        </div>
      </nav>
      <main>
        <Outlet />
      </main>
      <ToastContainer />
    </div>
  );
}