'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';

function LoginInner() {
  const { user, loading, signIn } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) {
      router.replace(redirect);
    }
  }, [loading, user, redirect, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      const msg = (err as Error).message;
      setError(
        msg.includes('invalid')
          ? '이메일 또는 비밀번호가 잘못되었습니다'
          : msg.includes('user-not-found')
            ? '등록되지 않은 계정입니다'
            : msg,
      );
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-brand"><span className="auth-brand__base">team</span><span className="auth-brand__main">jpk</span> <span className="auth-brand__erp">ERP</span></div>
      <section className="auth-card" aria-label="로그인">
        <header className="auth-card__head">
          <h2 className="auth-card__title">로그인</h2>
          <p className="auth-card__sub">이메일과 비밀번호를 입력해주세요.</p>
        </header>
        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="auth-field">
            <label htmlFor="login-email">이메일</label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              placeholder="name@company.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="auth-field">
            <label htmlFor="login-password">비밀번호</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              placeholder="비밀번호 입력"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <p className="auth-message" role="alert">{error}</p>
          )}
          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? <><i className="ph ph-spinner spin" /> 접속 중...</> : '로그인'}
          </button>
        </form>
        <p className="auth-guide">기존 jpkerp 계정으로 로그인</p>
      </section>
      <div className="auth-copyright">&copy; 2026 teamjpk. All Rights Reserved.</div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
