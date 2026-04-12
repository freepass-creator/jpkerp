/**
 * pages/admin-card.js — 법인카드관리
 */
export async function mount() {
  document.getElementById('adminTitle').textContent = '법인카드관리';
  document.getElementById('adminGrid').innerHTML = '<div style="padding:48px;text-align:center;color:var(--c-text-muted)">법인카드관리 준비 중</div>';
}
