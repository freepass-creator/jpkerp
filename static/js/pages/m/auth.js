/**
 * m/auth.js — 모바일 페이지 공통 인증 가드
 * 미로그인 시 /login 으로 리다이렉트 + 현재 사용자 정보 expose
 */
import { auth, db } from '../../firebase/config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { ref, get } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js';

window.__mUser = null;
window.__mUserReady = new Promise((resolve) => {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      // 로그인 페이지로 보내면서 돌아올 경로 전달
      const next = encodeURIComponent(location.pathname + location.search);
      location.href = `/m/login?next=${next}`;
      return;
    }
    // 사용자 프로필 로드
    let profile = {};
    try {
      const snap = await get(ref(db, 'users/' + user.uid));
      profile = snap.val() || {};
    } catch {}
    window.__mUser = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || profile.name || '',
      name: profile.name || user.displayName || user.email,
      role: profile.role || 'staff',
    };
    resolve(window.__mUser);
  });
});
