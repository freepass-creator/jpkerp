'use client';

/**
 * Topbar — JPK ERP v3 (prototype.html .topbar 구조)
 * - 36px 높이, 흰 배경, 1px 하단 보더
 * - 사이드바 옆 grid column 2 row 1
 * - 통합검색 · 우측 알림 · 사용자 드롭다운
 *
 * Phase: 통합검색 input 클릭/포커스 → CommandPalette 트리거 (Cmd/Ctrl+K)
 *  - 자체 검색 처리 없이 팔레트로 위임 (단일 진입점)
 *  - 우측 단축키 hint 표시
 */

import { useAuth } from '@/lib/auth/context';
import { useCallback } from 'react';

function dispatchPaletteToggle() {
  // CommandPalette 가 listen 하는 keydown 이벤트 디스패치
  const ev = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true });
  window.dispatchEvent(ev);
}

export function Topbar() {
  const { user, signOut } = useAuth();

  const openPalette = useCallback(() => {
    dispatchPaletteToggle();
  }, []);

  // 키보드 사용자: focus 시 즉시 팔레트 오픈 (input 자체에 타이핑하지 않음)
  const onSearchFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    // 클릭으로 들어왔을 때 IME 캐럿이 잡히지 않도록 blur
    e.currentTarget.blur();
    dispatchPaletteToggle();
  }, []);

  const displayName = user?.displayName || user?.email?.split('@')[0] || '사용자';

  return (
    <header className="topbar">
      <div className="search">
        <input
          type="text"
          readOnly
          value=""
          onFocus={onSearchFocus}
          onClick={openPalette}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openPalette();
            }
          }}
          placeholder="차량번호 · 계약자 · 계약코드 통합검색"
          aria-label="통합검색 (Cmd/Ctrl+K)"
        />
        <kbd
          className="kbd"
          style={{
            position: 'absolute',
            right: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
          }}
        >
          ⌘K
        </kbd>
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
