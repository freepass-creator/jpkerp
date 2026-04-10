/**
 * toast.js — 작은 알림
 * showToast(message, type) — type: 'success' | 'error' | 'warn' | undefined
 */

let host = null;
export function initToast() {
  host = document.getElementById('toastHost');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toast-host';
    document.body.appendChild(host);
  }
}

export function showToast(message, type = '') {
  if (!host) initToast();
  const el = document.createElement('div');
  el.className = `toast ${type ? 'is-' + type : ''}`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 200ms';
    setTimeout(() => el.remove(), 220);
  }, 2400);
}
