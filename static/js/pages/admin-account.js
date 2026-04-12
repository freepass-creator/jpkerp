/**
 * pages/admin-account.js — 계좌관리
 */
export async function mount() {
  document.getElementById('adminTitle').textContent = '계좌관리';
  document.getElementById('adminGrid').innerHTML = '<div style="padding:48px;text-align:center;color:var(--c-text-muted)">계좌관리 준비 중</div>';
}
