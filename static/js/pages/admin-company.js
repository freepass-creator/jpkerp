/**
 * pages/admin-company.js — 회사정보
 */
export async function mount() {
  document.getElementById('adminTitle').textContent = '회사정보';
  document.getElementById('adminGrid').innerHTML = '<div style="padding:48px;text-align:center;color:var(--c-text-muted)">회사정보 준비 중</div>';
}
