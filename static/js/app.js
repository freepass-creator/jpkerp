/**
 * app.js — JPK ERP 부트스트랩
 */
import { renderMenu, MENU } from './core/menu.js';
import { initToast } from './core/toast.js';
import { initPanelResize } from './widgets/panel-resize.js';

if (document.getElementById('shell')) bootstrap();

async function bootstrap() {
  const menuEl = document.getElementById('sidebarMenu');
  if (menuEl) renderMenu(menuEl, MENU, window.location.pathname);

  initToast();
  initPanelResize();

  // command palette
  const cpHost = document.getElementById('cpHost');
  const cpInput = document.getElementById('cpInput');
  document.getElementById('cpTrigger')?.addEventListener('click', () => { cpHost.hidden = false; cpInput?.focus(); });
  cpHost?.addEventListener('click', e => { if (e.target === cpHost) cpHost.hidden = true; });
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); cpHost.hidden = false; cpInput?.focus(); }
    if (e.key === 'Escape' && cpHost && !cpHost.hidden) cpHost.hidden = true;
  });

  // 로그아웃
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    const { auth } = await import('./firebase/config.js');
    const { signOut } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js');
    await signOut(auth);
    location.href = '/login';
  });

  await loadPageModule(window.location.pathname);
}

async function loadPageModule(pathname) {
  const slug = pathname.replace(/^\//, '').replace(/\//g, '-') || 'home';
  try {
    const mod = await import(`/static/js/pages/${slug}.js?v=${window.APP_VER || '1'}`);
    if (mod?.mount) await mod.mount();
  } catch (e) { console.warn(`[page ${slug}]`, e); }
}
