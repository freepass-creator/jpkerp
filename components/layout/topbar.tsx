'use client';

/**
 * Topbar — JPK ERP v3 (prototype.html .topbar 구조)
 * - 36px 높이, 흰 배경, 1px 하단 보더
 * - 사이드바 옆 grid column 2 row 1
 * - 통합검색 · 우측 알림 · 사용자 드롭다운
 */

import { useAuth } from '@/lib/auth/context';
import { useCallback, useState } from 'react';

export function Topbar() {
  const { user, signOut } = useAuth();
  const [query, setQuery] = useState('');

  const onSearchKey = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // Phase 1 — 검색 디스패치는 Phase 2 통합검색에서 구현
      // 일단 Cmd/Ctrl+K 팔레트 토글로 임시 매핑
      const ev = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
      window.dispatchEvent(ev);
    }
  }, []);

  const displayName = user?.displayName || user?.email?.split('@')[0] || '사용자';

  return (
    <header className="topbar">
      <div className="search">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onSearchKey}
          placeholder="차량번호 · 계약자 · 계약코드 통합검색"
        />
      </div>
      <div className="actions">
        <button type="button" className="icon-btn" aria-label="알림">
          <i className="ph ph-bell" />
        </button>
        <button
          type="button"
          className="user-drop"
          onClick={() => {
            void signOut();
          }}
          title="클릭 시 로그아웃"
        >
          <span>{displayName}</span>
          <i className="ph ph-caret-down" />
        </button>
      </div>
    </header>
  );
}
