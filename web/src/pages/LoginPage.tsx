import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  signInWithMagicLink,
  signInWithPassword,
  supabase,
} from '../api/supabase';
import { useAuthStore } from '../store/authStore';
import { useToast } from '../hooks/useToast';

type Mode = 'magic' | 'password';

const MagicSchema = z.object({
  email: z.string().email('请输入有效的邮箱'),
});
type MagicValues = z.infer<typeof MagicSchema>;

const PasswordSchema = z.object({
  email: z.string().email('请输入有效的邮箱'),
  password: z.string().min(6, '密码至少 6 位'),
});
type PasswordValues = z.infer<typeof PasswordSchema>;

/**
 * Login page with two modes:
 *   - magic: email one-time link (default; convenient but rate-limited on
 *     Supabase free tier to ~4 emails/hour per project)
 *   - password: classic email + password (no rate limit; use this in
 *     production / heavy testing)
 *
 * Mode toggle is at the top of the card. Both modes use react-hook-form
 * + zod for validation.
 */
export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('password');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const toast = useToast();

  const magicForm = useForm<MagicValues>({
    resolver: zodResolver(MagicSchema),
    defaultValues: { email: '' },
  });
  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(PasswordSchema),
    defaultValues: { email: '', password: '' },
  });

  const onMagicSubmit = async (values: MagicValues) => {
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

  const onPasswordSubmit = async (values: PasswordValues) => {
    if (!supabase) {
      toast.error('Supabase 未配置');
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await signInWithPassword(
        values.email,
        values.password,
      );
      if (error) throw error;
      if (data.session) setSession(data.session);
      toast.success('登录成功');
      navigate('/home');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '登录失败';
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
          {supabase
            ? mode === 'password'
              ? '输入邮箱与密码登录'
              : '输入邮箱,系统将发送一次性登录链接'
            : '请先配置 Supabase 后再登录'}
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

        {/* Mode toggle */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            marginBottom: 16,
            background: 'var(--surface-2)',
            borderRadius: 'var(--radius)',
            padding: 4,
          }}
        >
          <button
            type="button"
            className={`btn btn-sm ${mode === 'password' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ flex: 1 }}
            onClick={() => {
              setMode('password');
              setSent(false);
            }}
          >
            密码登录
          </button>
          <button
            type="button"
            className={`btn btn-sm ${mode === 'magic' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ flex: 1 }}
            onClick={() => {
              setMode('magic');
              setSent(false);
            }}
          >
            邮箱链接
          </button>
        </div>

        {mode === 'password' ? (
          <form
            onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}
            noValidate
          >
            <div className="field">
              <label className="field-label" htmlFor="email-pw">
                邮箱
              </label>
              <input
                id="email-pw"
                type="email"
                className="input"
                autoComplete="email"
                {...passwordForm.register('email')}
              />
              {passwordForm.formState.errors.email && (
                <p
                  style={{
                    color: 'var(--danger)',
                    fontSize: 12,
                    marginTop: 4,
                  }}
                >
                  {passwordForm.formState.errors.email.message}
                </p>
              )}
            </div>
            <div className="field">
              <label className="field-label" htmlFor="password">
                密码
              </label>
              <input
                id="password"
                type="password"
                className="input"
                autoComplete="current-password"
                {...passwordForm.register('password')}
              />
              {passwordForm.formState.errors.password && (
                <p
                  style={{
                    color: 'var(--danger)',
                    fontSize: 12,
                    marginTop: 4,
                  }}
                >
                  {passwordForm.formState.errors.password.message}
                </p>
              )}
            </div>
            <button
              type="submit"
              className="btn btn-primary btn-lg"
              style={{ width: '100%' }}
              disabled={submitting || !supabase}
            >
              {submitting ? '登录中...' : '登录'}
            </button>
          </form>
        ) : sent ? (
          <div className="empty">
            <div className="empty-title">已发送 ✓</div>
            <p>请前往邮箱点击登录链接;链接有效期为 1 小时。</p>
            <p
              style={{
                fontSize: 12,
                color: 'var(--text-muted)',
                marginTop: 8,
              }}
            >
              Supabase 免费版每小时限 ~4 封,测试用建议改"密码登录"。
            </p>
            <button
              className="btn btn-secondary btn-sm"
              style={{ marginTop: 16 }}
              onClick={() => setSent(false)}
            >
              换个邮箱
            </button>
          </div>
        ) : (
          <form onSubmit={magicForm.handleSubmit(onMagicSubmit)} noValidate>
            <div className="field">
              <label className="field-label" htmlFor="email-magic">
                邮箱
              </label>
              <input
                id="email-magic"
                type="email"
                className="input"
                autoComplete="email"
                {...magicForm.register('email')}
              />
              {magicForm.formState.errors.email && (
                <p
                  style={{
                    color: 'var(--danger)',
                    fontSize: 12,
                    marginTop: 4,
                  }}
                >
                  {magicForm.formState.errors.email.message}
                </p>
              )}
            </div>
            <button
              type="submit"
              className="btn btn-primary btn-lg"
              style={{ width: '100%' }}
              disabled={submitting || !supabase}
            >
              {submitting ? '发送中...' : '发送登录链接'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}