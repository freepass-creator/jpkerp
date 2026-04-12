/**
 * pages/admin-staff.js — 직원관리
 */
export async function mount() {
  document.getElementById('adminTitle').textContent = '직원관리';
  document.getElementById('adminGrid').innerHTML = '<div style="padding:48px;text-align:center;color:var(--c-text-muted)">직원관리 준비 중</div>';
}
