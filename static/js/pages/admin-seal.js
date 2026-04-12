/**
 * pages/admin-seal.js — 인감/도장
 */
export async function mount() {
  document.getElementById('adminTitle').textContent = '인감/도장';
  document.getElementById('adminGrid').innerHTML = '<div style="padding:48px;text-align:center;color:var(--c-text-muted)">인감/도장 준비 중</div>';
}
