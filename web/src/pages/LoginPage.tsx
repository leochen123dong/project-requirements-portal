import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { signInWithMagicLink, supabase } from '../api/supabase';
import { useAuthStore } from '../store/authStore';
import { useToast } from '../hooks/useToast';

const Schema = z.object({
  email: z.string().email('请输入有效的邮箱'),
});
type FormValues = z.infer<typeof Schema>;

/**
 * Email magic-link login. After submit, shows a "check your email" toast and
 * navigates back to /home (where RequireAuth will keep them on /login if the
 * magic-link callback hasn't returned yet — Supabase handles the redirect).
 */
export default function LoginPage() {
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const toast = useToast();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (values: FormValues) => {
    if (!supabase) {
      toast.error('Supabase 未配置 (检查 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await signInWithMagicLink(values.email);
      if (error) throw error;
      setSent(true);
      toast.success(`登录链接已发送至 ${values.email},请检查邮箱`);
      // If the user already has a cached session, send them to home.
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setSession(data.session);
        navigate('/home');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '发送失败';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">项目需求管理门户</h1>
        <p className="login-subtitle">
          {supabase ? '输入邮箱,系统将发送一次性登录链接' : '请先配置 Supabase 后再登录'}
        </p>

        {!supabase && (
          <div
            className="card"
            style={{
              background: 'var(--warning-light)',
              borderColor: 'var(--warning)',
              color: 'var(--warning)',
              padding: 16,
              marginBottom: 16,
              fontSize: 13,
            }}
          >
            ⚠️ Supabase 未配置,请在 <code>.env</code> 中设置:
            <br />
            <code>VITE_SUPABASE_URL</code> 与 <code>VITE_SUPABASE_ANON_KEY</code>
          </div>
        )}

        {sent ? (
          <div className="empty">
            <div className="empty-title">已发送 ✓</div>
            <p>请前往邮箱点击登录链接;链接有效期为 1 小时。</p>
            <button
              className="btn btn-secondary btn-sm"
              style={{ marginTop: 16 }}
              onClick={() => setSent(false)}
            >
              换个邮箱
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="field">
              <label className="field-label">邮箱</label>
              <input
                className="input"
                type="email"
                placeholder="you@company.com"
                autoComplete="email"
                disabled={!supabase || submitting}
                {...register('email')}
              />
              {errors.email && (
                <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>
                  {errors.email.message}
                </p>
              )}
            </div>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={!supabase || submitting}
              style={{ width: '100%' }}
            >
              {submitting ? '发送中...' : '发送登录链接'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
