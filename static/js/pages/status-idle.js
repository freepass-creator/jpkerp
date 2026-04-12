/**
 * pages/status-idle.js — 휴차현황
 */
export async function mount() {
  // TODO: 휴차 AG Grid
  document.getElementById('idleGrid').innerHTML = '<div style="padding:48px;text-align:center;color:var(--c-text-muted)">휴차현황 준비 중</div>';
}
