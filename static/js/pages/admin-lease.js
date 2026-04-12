/**
 * pages/admin-lease.js — 임대관리
 */
export async function mount() {
  document.getElementById('adminTitle').textContent = '임대관리';
  document.getElementById('adminGrid').innerHTML = '<div style="padding:48px;text-align:center;color:var(--c-text-muted)">임대관리 준비 중</div>';
}
