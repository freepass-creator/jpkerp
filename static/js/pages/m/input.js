/**
 * m-input.js — 모바일 운영업무 입력 (placeholder)
 * 차량번호 선택 후 업무 아이콘 탭 → (향후) 간단 입력폼
 */
const $ = (s) => document.querySelector(s);
const RECENT_KEY = 'jpk.op.recent_cars';

const OP_TYPES = [
  { key: 'contact',   label: '고객응대',   icon: 'ph-phone',             color: '#3b82f6' },
  { key: 'delivery',  label: '출고',       icon: 'ph-truck',             color: '#10b981' },
  { key: 'return',    label: '정상반납',   icon: 'ph-arrow-u-down-left', color: '#059669' },
  { key: 'force',     label: '강제회수',   icon: 'ph-warning-octagon',   color: '#dc2626' },
  { key: 'transfer',  label: '차량이동',   icon: 'ph-arrows-left-right', color: '#14b8a6' },
  { key: 'key',       label: '차키전달',   icon: 'ph-key',               color: '#f59e0b' },
  { key: 'maint',     label: '정비',       icon: 'ph-wrench',            color: '#f97316' },
  { key: 'product',   label: '상품화',     icon: 'ph-sparkle',           color: '#8b5cf6' },
  { key: 'accident',  label: '사고접수',   icon: 'ph-car-profile',       color: '#ef4444' },
  { key: 'repair',    label: '사고수리',   icon: 'ph-hammer',            color: '#ea580c' },
  { key: 'penalty',   label: '과태료',     icon: 'ph-prohibit',          color: '#b91c1c' },
  { key: 'collect',   label: '미수관리',   icon: 'ph-envelope',          color: '#2563eb' },
  { key: 'insurance', label: '보험',       icon: 'ph-shield-check',      color: '#7c3aed' },
  { key: 'wash',      label: '세차',       icon: 'ph-drop',              color: '#a855f7' },
  { key: 'fuel',      label: '연료',       icon: 'ph-gas-pump',          color: '#c026d3' },
];

let currentCar = '';

function loadRecent() { try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; } }

function renderRecent() {
  const host = $('#recentCars');
  const r = loadRecent();
  host.innerHTML = r.map((c) => `<button class="m-chip ${c === currentCar ? 'is-active' : ''}" data-car="${c}">${c}</button>`).join('');
  host.querySelectorAll('.m-chip').forEach((el) => {
    el.addEventListener('click', () => { $('#carInput').value = el.dataset.car; setCar(el.dataset.car); });
  });
}

function setCar(c) {
  currentCar = (c || '').trim();
  renderRecent();
  document.querySelectorAll('.m-op-btn').forEach((b) => { b.disabled = !currentCar; });
}

function renderGrid() {
  const host = $('#opGrid');
  // 3열 아이콘 그리드로 렌더
  host.style.gridTemplateColumns = 'repeat(3, 1fr)';
  host.innerHTML = OP_TYPES.map((t) => `
    <button class="m-cat-btn m-op-btn" data-type="${t.key}" disabled
            style="flex-direction:column;padding:16px 8px;gap:8px">
      <div class="m-cat-icon" style="background:${t.color};width:44px;height:44px">
        <i class="ph ${t.icon}"></i>
      </div>
      <div style="font-size:12px;font-weight:600;color:var(--c-text)">${t.label}</div>
    </button>
  `).join('');
  host.querySelectorAll('.m-op-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!currentCar) return;
      const t = btn.dataset.type;
      alert(`[${currentCar}] ${OP_TYPES.find((x) => x.key === t).label}\n\n이 업무 입력폼은 곧 추가됩니다.`);
    });
  });
}

function wireCarInput() {
  const inp = $('#carInput');
  let t;
  inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => setCar(inp.value), 150); });
  inp.addEventListener('blur', () => setCar(inp.value));
}

document.addEventListener('DOMContentLoaded', () => {
  renderGrid();
  renderRecent();
  wireCarInput();
});
