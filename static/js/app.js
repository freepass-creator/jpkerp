/**
 * app.js — JPK ERP 부트스트랩 (SPA 모드)
 *
 * 사이드바 링크 클릭 시 전체 새로고침 없이 우측 콘텐츠만 교체.
 */
import { renderMenu, MENU } from './core/menu.js';
import { initToast } from './core/toast.js';
import { initPanelResize } from './widgets/panel-resize.js';

if (document.getElementById('shell')) bootstrap();

async function bootstrap() {
  const menuEl = document.getElementById('sidebarMenu');
  if (menuEl) renderMenu(menuEl, MENU);

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

  // 초기 페이지 로드
  await loadPage(window.location.pathname);

  // SPA 네비게이션 — 사이드바 링크 인터셉트
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a.sidebar-link');
    if (!link) return;
    const href = link.getAttribute('href');
    if (!href || href.startsWith('http') || href.startsWith('#')) return;
    e.preventDefault();
    if (href === window.location.pathname) return;
    navigateTo(href);
  });

  // 브라우저 뒤로/앞으로
  window.addEventListener('popstate', () => {
    loadPage(window.location.pathname);
    updateActiveMenu();
  });
}

async function navigateTo(pathname) {
  history.pushState(null, '', pathname);
  updateActiveMenu();
  await loadPage(pathname);
}

function updateActiveMenu() {
  const fullUrl = window.location.pathname;
  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.classList.toggle('is-active', link.getAttribute('href') === fullUrl);
  });
  // 해당 그룹 열기
  document.querySelectorAll('.sidebar-group').forEach(group => {
    const hasActive = group.querySelector('.sidebar-link.is-active');
    if (hasActive && !group.classList.contains('is-open')) {
      group.classList.add('is-open');
    }
  });
}

async function loadPage(pathname) {
  const slug = pathname.replace(/^\//, '').replace(/\//g, '-') || 'home';

  // 서버에서 HTML 가져오기
  try {
    const res = await fetch(pathname);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    // 파싱해서 topbar + workspace 추출
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // topbar 교체
    const newTopbar = doc.querySelector('.topbar');
    const curTopbar = document.querySelector('.topbar');
    if (newTopbar && curTopbar) {
      curTopbar.innerHTML = newTopbar.innerHTML;
    }

    // workspace 교체
    const newWorkspace = doc.querySelector('.workspace');
    const curWorkspace = document.querySelector('.workspace');
    if (newWorkspace && curWorkspace) {
      curWorkspace.className = newWorkspace.className;
      curWorkspace.innerHTML = newWorkspace.innerHTML;
    }

    // 타이틀
    const newTitle = doc.querySelector('title');
    if (newTitle) document.title = newTitle.textContent;

  } catch (e) {
    console.warn(`[spa fetch] ${pathname}`, e);
  }

  // 패널 리사이즈 재초기화
  document.querySelectorAll('.workspace').forEach(ws => { delete ws.dataset.resizeInit; });
  initPanelResize();

  // 페이지 모듈 로드
  try {
    const mod = await import(`/static/js/pages/${slug}.js?v=${Date.now()}`);
    if (mod?.mount) await mod.mount();
  } catch (e) { console.warn(`[page ${slug}]`, e); }
}
