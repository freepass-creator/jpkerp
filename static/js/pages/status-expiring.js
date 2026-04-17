/**
 * pages/status-expiring.js — 만기도래 현황
 * 패널헤드에서 1~6개월 범위 선택, 목록 + 이력관리
 */
import { watchAssets } from '../firebase/assets.js';
import { watchContracts } from '../firebase/contracts.js';
import { watchEvents } from '../firebase/events.js';
import { showContextMenu } from '../core/context-menu.js';

const $ = (s) => document.querySelector(s);
const fmtDate = (s) => {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1].slice(2)}.${m[2]}.${m[3]}` : s;
};

function normalizeDate(s) {
  if (!s) return '';
  let v = String(s).trim().replace(/[./]/g, '-');
  const m = v.match(/^(\d{2})-(\d{1,2})-(\d{1,2})$/);
  if (m) v = `${Number(m[1]) < 50 ? 2000 + Number(m[1]) : 1900 + Number(m[1])}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return v;
}

function computeEnd(c) {
  if (c.end_date) return normalizeDate(c.end_date);
  const s = normalizeDate(c.start_date);
  if (!s || !c.rent_months) return '';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  d.setMonth(d.getMonth() + Number(c.rent_months));
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const EVENT_LABEL = {
  delivery: '출고', return: '반납', force: '강제회수', transfer: '이동',
  maint: '정비', repair: '사고수리', product: '상품화', wash: '세차',
  accident: '사고', contact: '고객센터', insurance: '보험',
};
const EVENT_META = {
  delivery: { icon: 'ph-truck', color: '#10b981' },
  return:   { icon: 'ph-arrow-u-down-left', color: '#059669' },
  force:    { icon: 'ph-warning-octagon', color: '#dc2626' },
  transfer: { icon: 'ph-arrows-left-right', color: '#14b8a6' },
  maint:    { icon: 'ph-wrench', color: '#f97316' },
  repair:   { icon: 'ph-hammer', color: '#ea580c' },
  product:  { icon: 'ph-sparkle', color: '#8b5cf6' },
  wash:     { icon: 'ph-drop', color: '#a855f7' },
  accident: { icon: 'ph-car-profile', color: '#ef4444' },
  contact:  { icon: 'ph-phone', color: '#3b82f6' },
  insurance:{ icon: 'ph-shield-check', color: '#7c3aed' },
};

let gridApi, assets = [], contracts = [], events = [];
let selectedCar = null;
let rangeMonths = 3; // 기본 3개월

function computeExpiring() {
  const today = new Date().toISOString().slice(0, 10);
  const todayDate = new Date(today);
  const limit = new Date(todayDate);
  limit.setMonth(limit.getMonth() + rangeMonths);
  const limitStr = limit.toISOString().slice(0, 10);

  return contracts
    .filter(c => {
      if (c.status === 'deleted') return false;
      if (!c.contractor_name?.trim()) return false;
      const end = computeEnd(c);
      return end && end >= today && end <= limitStr;
    })
    .map(c => {
      const end = computeEnd(c);
      const dDay = Math.floor((new Date(end) - todayDate) / 86400000);
      const asset = assets.find(a => a.car_number === c.car_number);
      return {
        contractor_name: c.contractor_name || '-',
        contractor_phone: c.contractor_phone || '',
        car_number: c.car_number || '-',
        detail_model: asset?.detail_model || asset?.car_model || c.car_model || '',
        partner_code: c.partner_code || asset?.partner_code || '-',
        start_date: normalizeDate(c.start_date),
        end_date: end,
        rent_months: c.rent_months || '',
        d_day: dDay,
        contract_code: c.contract_code || '',
        contract_status: c.contract_status || '',
      };
    })
    .sort((a, b) => a.d_day - b.d_day);
}

function refresh() {
  if (!gridApi) return;
  const rows = computeExpiring();
  gridApi.setGridOption('rowData', rows);
  const cnt = $('#expiringCount');
  if (cnt) cnt.textContent = `${rows.length}건`;
  if (selectedCar) renderHistory(selectedCar);
}

function renderHistory(carNumber) {
  const host = $('#expHistory');
  const titleEl = $('#expHistoryTitle');
  const subEl = $('#expHistorySub');
  const asset = assets.find(a => a.car_number === carNumber);

  if (!asset && !carNumber) {
    titleEl.textContent = '이력관리';
    subEl.textContent = '좌측에서 계약을 선택하세요';
    host.innerHTML = '<div class="form-section" style="text-align:center;color:var(--c-text-muted)">선택 안됨</div>';
    return;
  }

  titleEl.textContent = carNumber;
  subEl.textContent = `${asset?.detail_model || asset?.car_model || ''} · ${asset?.partner_code || ''}`;

  // 해당 차량 계약 이력
  const carContracts = contracts
    .filter(c => c.car_number === carNumber && c.status !== 'deleted')
    .sort((a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')));

  const carEvents = events
    .filter(e => e.car_number === carNumber && e.status !== 'deleted')
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, 20);

  const contractsHtml = carContracts.length ? carContracts.map(c => {
    const end = computeEnd(c);
    return `<div class="dash-todo">
      <div class="dash-todo-body">
        <div class="dash-todo-label">${c.contractor_name || '-'}</div>
        <div class="dash-todo-item-sub">${c.contract_code || ''} · ${c.contract_status || ''} · ${c.rent_months || ''}개월</div>
      </div>
      <span style="font-size:var(--font-size-xs);color:var(--c-text-muted)">${fmtDate(c.start_date)} ~ ${fmtDate(end)}</span>
    </div>`;
  }).join('') : '<div class="form-section" style="color:var(--c-text-muted)">계약 이력 없음</div>';

  const eventsHtml = carEvents.length ? carEvents.map(e => {
    const m = EVENT_META[e.type] || { icon: 'ph-circle', color: 'var(--c-text-muted)' };
    const label = EVENT_LABEL[e.type] || e.type || '-';
    return `<div class="dash-todo">
      <i class="ph ${m.icon}" style="color:${m.color};flex-shrink:0"></i>
      <div class="dash-todo-body">
        <div class="dash-todo-label">${label}</div>
        <div class="dash-todo-item-sub">${e.title || ''}${e.from_location || e.to_location ? ` · ${e.from_location || ''} → ${e.to_location || ''}` : ''}</div>
      </div>
      <span style="font-size:var(--font-size-xs);color:var(--c-text-muted)">${fmtDate(e.date)}</span>
    </div>`;
  }).join('') : '<div class="form-section" style="color:var(--c-text-muted)">운영이력 없음</div>';

  host.innerHTML = `
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-file-text"></i>계약 이력</div>
    </div>
    ${contractsHtml}
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-clock-counter-clockwise"></i>운영 이력</div>
    </div>
    ${eventsHtml}
  `;
}

export async function mount() {
  const el = $('#expiringGrid');
  if (!el) return;

  gridApi = agGrid.createGrid(el, {
    columnDefs: [
      { headerName: '#', valueGetter: 'node.rowIndex+1', width: 45, cellStyle: { color: 'var(--c-text-muted)' } },
      { headerName: '회사코드', field: 'partner_code', width: 80 },
      { headerName: '계약자', field: 'contractor_name', width: 80 },
      { headerName: '연락처', field: 'contractor_phone', width: 100 },
      { headerName: '차량번호', field: 'car_number', width: 95 },
      { headerName: '세부모델', field: 'detail_model', flex: 1, minWidth: 120 },
      { headerName: '계약기간', field: 'rent_months', width: 70, filter: false, valueFormatter: p => p.value ? `${p.value}개월` : '-' },
      { headerName: '시작일', field: 'start_date', width: 85, valueFormatter: p => fmtDate(p.value) },
      { headerName: '종료일', field: 'end_date', width: 85, valueFormatter: p => fmtDate(p.value) },
      { headerName: 'D-day', field: 'd_day', width: 70, sort: 'asc', filter: false,
        valueFormatter: p => `D-${p.value}`,
        cellStyle: p => ({
          fontWeight: 'var(--fw-bold)',
          color: p.value <= 7 ? 'var(--c-danger)' : p.value <= 30 ? 'var(--c-warn)' : 'var(--c-text-sub)',
        }) },
    ],
    rowData: [],
    defaultColDef: { resizable: true, sortable: true, filter: 'agTextColumnFilter', editable: false, minWidth: 50 },
    rowHeight: 28,
    headerHeight: 28,
    animateRows: false,
    rowSelection: 'single',
    onRowClicked: (e) => {
      selectedCar = e.data?.car_number;
      if (selectedCar) renderHistory(selectedCar);
    },
    onGridReady: (p) => p.api.autoSizeAllColumns(),
  });
  el._agApi = gridApi;

  // 패널헤드 기간 선택 버튼 바인딩
  document.querySelectorAll('[data-exp-month]').forEach(btn => {
    btn.addEventListener('click', () => {
      rangeMonths = Number(btn.dataset.expMonth);
      document.querySelectorAll('[data-exp-month]').forEach(b => b.classList.toggle('is-active', b === btn));
      refresh();
    });
  });
  // 기본 3개월 활성화
  document.querySelector('[data-exp-month="3"]')?.classList.add('is-active');

  // 우클릭 — 반납/연장 처리
  el.addEventListener('contextmenu', (e) => {
    const rowEl = e.target.closest('.ag-row');
    if (!rowEl) return;
    e.preventDefault();
    const rowIndex = Number(rowEl.getAttribute('row-index'));
    const node = gridApi.getDisplayedRowAtIndex(rowIndex);
    const row = node?.data;
    if (!row) return;
    selectedCar = row.car_number;
    node.setSelected(true);
    renderHistory(row.car_number);
    showContextMenu(e, [
      { label: '반납 입력하러 가기', icon: '📥', action: () => { location.href = '/input/operation'; } },
      { label: '연장 계약 입력하러 가기', icon: '📝', action: () => { location.href = '/contract'; } },
      'sep',
      { label: '이력 보기', icon: '📋', action: () => renderHistory(row.car_number) },
    ]);
  });

  watchAssets((items) => { assets = items; refresh(); });
  watchContracts((items) => { contracts = items; refresh(); });
  watchEvents((items) => { events = items; refresh(); });
}
