/**
 * pages/status-expiring.js — 만기도래
 */
export async function mount() {
  // TODO: 만기도래 AG Grid
  document.getElementById('expiringGrid').innerHTML = '<div style="padding:48px;text-align:center;color:var(--c-text-muted)">만기도래 준비 중</div>';
}
