/**
 * app.js — JPK ERP 부트스트랩 (SPA 모드)
 *
 * 사이드바 링크 클릭 시 전체 새로고침 없이 우측 콘텐츠만 교체.
 */
import { renderMenu, MENU } from './core/menu.js';
import { initToast } from './core/toast.js';
import { initPanelResize } from './widgets/panel-resize.js';
import { initGridFilter } from './widgets/grid-filter.js';

if (document.getElementById('shell')) bootstrap();

async function bootstrap() {
  const menuEl = document.getElementById('sidebarMenu');
  if (menuEl) renderMenu(menuEl, MENU);

  initToast();
  initPanelResize();
  initSidebarResize();

  // command palette — 통합 검색
  const cpHost = document.getElementById('cpHost');
  const cpInput = document.getElementById('cpInput');
  const cpResults = document.getElementById('cpResults');
  let searchData = { assets: [], contracts: [], customers: [], events: [] };

  // 데이터 로드 (lazy)
  async function loadSearchData() {
    try {
      const { watchAssets } = await import('./firebase/assets.js');
      const { watchContracts } = await import('./firebase/contracts.js');
      const { watchCustomers } = await import('./firebase/customers.js');
      const { watchEvents } = await import('./firebase/events.js');
      watchAssets(items => { searchData.assets = items; });
      watchContracts(items => { searchData.contracts = items; });
      watchCustomers(items => { searchData.customers = items; });
      watchEvents(items => { searchData.events = items; });
    } catch {}
  }

  document.getElementById('cpTrigger')?.addEventListener('click', () => {
    cpHost.hidden = false; cpInput?.focus(); cpInput.value = ''; cpResults.innerHTML = '';
    if (!searchData.assets.length) loadSearchData();
  });
  cpHost?.addEventListener('click', e => { if (e.target === cpHost) cpHost.hidden = true; });
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault(); cpHost.hidden = false; cpInput?.focus(); cpInput.value = ''; cpResults.innerHTML = '';
      if (!searchData.assets.length) loadSearchData();
    }
    if (e.key === 'Escape' && cpHost && !cpHost.hidden) cpHost.hidden = true;
  });

  cpInput?.addEventListener('input', () => {
    const q = cpInput.value.trim().toLowerCase();
    if (!q) { cpResults.innerHTML = ''; return; }
    const results = [];
    const norm = (s) => String(s || '').toLowerCase();

    // 자산
    searchData.assets.filter(a =>
      norm(a.car_number).includes(q) || norm(a.car_model).includes(q) || norm(a.manufacturer).includes(q) || norm(a.vin).includes(q)
    ).slice(0, 3).forEach(a => {
      results.push({ icon: '🚗', label: a.car_number, sub: [a.manufacturer, a.car_model, a.ext_color].filter(Boolean).join(' '), href: '/asset', cat: '자산' });
    });

    // 계약
    searchData.contracts.filter(c =>
      norm(c.car_number).includes(q) || norm(c.contractor_name).includes(q) || norm(c.contract_code).includes(q) || norm(c.contractor_phone).includes(q)
    ).slice(0, 3).forEach(c => {
      results.push({ icon: '📋', label: c.contractor_name || c.contract_code, sub: `${c.car_number || ''} · ${c.start_date || ''}`, href: '/contract', cat: '계약' });
    });

    // 고객
    searchData.customers.filter(c =>
      norm(c.code_name).includes(q) || norm(c.phone).includes(q) || norm(c.customer_reg_no).includes(q)
    ).slice(0, 3).forEach(c => {
      results.push({ icon: '👤', label: c.code_name, sub: c.phone || '', href: '/customer', cat: '고객' });
    });

    // 운영
    searchData.events.filter(e =>
      norm(e.car_number).includes(q) || norm(e.title).includes(q) || norm(e.vendor).includes(q) || norm(e.customer_name).includes(q)
    ).slice(0, 3).forEach(e => {
      results.push({ icon: '📝', label: e.title || e.type, sub: `${e.car_number || ''} · ${e.date || ''}`, href: '/operation', cat: '운영' });
    });

    if (!results.length) {
      cpResults.innerHTML = '<div style="padding:16px;text-align:center;color:var(--c-text-muted);font-size:var(--font-size-sm)">검색 결과 없음</div>';
      return;
    }

    let lastCat = '';
    cpResults.innerHTML = results.map(r => {
      const catHeader = r.cat !== lastCat ? `<div style="padding:6px 16px;font-size:var(--font-size-xs);color:var(--c-text-muted);font-weight:600;background:var(--c-bg-sub)">${r.cat}</div>` : '';
      lastCat = r.cat;
      return catHeader + `<a href="${r.href}" class="cp-item" style="display:flex;align-items:center;gap:10px;padding:8px 16px;cursor:pointer;text-decoration:none;color:var(--c-text)">
        <span style="font-size:16px">${r.icon}</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.label}</div>
          <div style="font-size:var(--font-size-xs);color:var(--c-text-muted)">${r.sub}</div>
        </div>
      </a>`;
    }).join('');
  });

  // 검색 결과 클릭 → 페이지 이동 + 닫기
  cpResults?.addEventListener('click', (e) => {
    const item = e.target.closest('.cp-item');
    if (!item) return;
    e.preventDefault();
    cpHost.hidden = true;
    const href = item.getAttribute('href');
    if (href) navigateTo(href);
  });

  // 로그아웃
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    const { auth } = await import('./firebase/config.js');
    const { signOut } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js');
    await signOut(auth);
    location.href = '/login';
  });

  // 로그아웃 아래, 초기 페이지 로드 위

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

  // AG Grid 필터 — 페이지 모듈에서 gridApi export하면 자동 연결
  if (typeof window._jpkGridApi !== 'undefined' && window._jpkGridEl) {
    initGridFilter(window._jpkGridApi, window._jpkGridEl);
  }
}

function initSidebarResize() {
  const sidebar = document.querySelector('.sidebar');
  const shell = document.getElementById('shell');
  if (!sidebar || !shell) return;

  const handle = document.createElement('div');
  handle.className = 'sidebar-resize';
  sidebar.appendChild(handle);

  // 저장된 너비 복원
  const savedW = localStorage.getItem('jpk.sidebar.w');
  if (savedW) {
    sidebar.style.width = savedW + 'px';
    shell.style.gridTemplateColumns = savedW + 'px minmax(0,1fr)';
  }

  let dragging = false;
  let startX = 0;
  let startW = 0;

  handle.addEventListener('mousedown', (e) => {
    dragging = true;
    startX = e.clientX;
    startW = sidebar.getBoundingClientRect().width;
    handle.classList.add('is-dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const w = Math.max(180, Math.min(400, startW + e.clientX - startX));
    sidebar.style.width = w + 'px';
    shell.style.gridTemplateColumns = w + 'px minmax(0,1fr)';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('is-dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    localStorage.setItem('jpk.sidebar.w', Math.round(sidebar.getBoundingClientRect().width));
  });

  // 더블클릭 → 기본 너비 복원
  handle.addEventListener('dblclick', () => {
    sidebar.style.width = '';
    shell.style.gridTemplateColumns = 'var(--sidebar-w) minmax(0,1fr)';
    localStorage.removeItem('jpk.sidebar.w');
  });
}
