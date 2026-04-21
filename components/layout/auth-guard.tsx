'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      const redirect = pathname === '/' ? '' : `?redirect=${encodeURIComponent(pathname)}`;
      router.replace(`/login${redirect}`);
    }
  }, [loading, user, pathname, router]);

  if (loading) {
    return (
      <div className="auth-loading">
        <div className="auth-loading__brand"><span className="auth-brand__base">team</span><span className="auth-brand__main">jpk</span> <span className="auth-brand__erp">ERP</span></div>
        <i className="ph ph-spinner auth-loading__spinner" />
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
