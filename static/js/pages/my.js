/**
 * pages/my.js — 내 정보 (프로필/비밀번호/로그아웃)
 */
import { showToast } from '../core/toast.js';

export async function mount() {
  const { auth, db } = await import('../firebase/config.js');
  const { onAuthStateChanged, updatePassword, updateProfile } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js');
  const { ref, get, update } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
  const { signOut } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js');

  onAuthStateChanged(auth, async (user) => {
    if (!user) { location.href = '/login'; return; }

    // 프로필 표시
    document.getElementById('myName').textContent = user.displayName || '-';
    document.getElementById('myEmail').textContent = user.email;
    document.getElementById('myNameInput').value = user.displayName || '';
    document.getElementById('myEmailInput').value = user.email;

    // DB에서 role 가져오기
    try {
      const snap = await get(ref(db, 'users/' + user.uid));
      const data = snap.val() || {};
      document.getElementById('myRole').value = data.role === 'admin' ? '관리자' : data.role === 'staff' ? '직원' : data.role || '-';
      document.getElementById('myPhone').value = data.phone || '';
    } catch {}
  });

  // 이름 저장
  document.getElementById('myUpdate')?.addEventListener('click', async () => {
    const user = auth.currentUser;
    if (!user) return;
    const name = document.getElementById('myNameInput').value.trim();
    if (!name) { showToast('이름을 입력해주세요', 'error'); return; }
    try {
      await updateProfile(user, { displayName: name });
      const { ref: dbRef, update: dbUpdate } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
      const phone = document.getElementById('myPhone').value.trim();
      await dbUpdate(dbRef(db, 'users/' + user.uid), { name, phone });
      document.getElementById('myName').textContent = name;
      document.getElementById('profileName').textContent = name;
      showToast('저장 완료', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  });

  // 비밀번호 변경
  document.getElementById('myChangePw')?.addEventListener('click', async () => {
    const user = auth.currentUser;
    if (!user) return;
    const pw = document.getElementById('myNewPw').value;
    const pwc = document.getElementById('myNewPwConfirm').value;
    if (!pw) { showToast('새 비밀번호를 입력해주세요', 'error'); return; }
    if (pw !== pwc) { showToast('비밀번호가 일치하지 않습니다', 'error'); return; }
    if (pw.length < 6) { showToast('6자 이상 입력해주세요', 'error'); return; }
    try {
      await updatePassword(user, pw);
      document.getElementById('myNewPw').value = '';
      document.getElementById('myNewPwConfirm').value = '';
      showToast('비밀번호 변경 완료', 'success');
    } catch (e) {
      if (e.code === 'auth/requires-recent-login') showToast('보안을 위해 다시 로그인 후 시도해주세요', 'error');
      else showToast(e.message, 'error');
    }
  });

  // 로그아웃
  document.getElementById('myLogout')?.addEventListener('click', async () => {
    await signOut(auth);
    location.href = '/login';
  });
}
