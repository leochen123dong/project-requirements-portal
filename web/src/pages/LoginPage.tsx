// Phase 0 stub — Phase 2a frontend-dev will replace with email magic link form.
export default function LoginPage() {
  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">项目需求管理门户</h1>
        <p className="login-subtitle">Phase 0 脚手架已就位,Phase 2a 将实现邮箱魔法链接登录。</p>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          配置 <code>VITE_SUPABASE_URL</code> 与 <code>VITE_SUPABASE_ANON_KEY</code> 后即可启用真实登录。
        </p>
      </div>
    </div>
  );
}