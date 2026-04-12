/**
 * pages/operation.js — 운영관리
 *
 * 좌: 유형 버튼 (전체/정비/사고/과태료/출고/반납/이동/키)
 * 우: 선택 유형의 이벤트 목록 AG Grid (read-only)
 */
import { watchEvents, EVENT_TYPES } from '../firebase/events.js';

const $ = (s) => document.querySelector(s);
const fmt = (v) => Number(v || 0).toLocaleString('ko-KR');
const fmtDate = (s) => {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1].slice(2)}.${m[2]}.${m[3]}` : s;
};

const TYPES = [
  { key: 'all',         label: '전체',           icon: '📋' },
  { key: 'contact',     label: '고객응대',       icon: '📞' },
  { key: 'delivery',    label: '출고(인도)',     icon: '🚗' },
  { key: 'return',      label: '정상반납',       icon: '🔙' },
  { key: 'force',       label: '강제회수',       icon: '🚨' },
  { key: 'transfer',    label: '차량이동',       icon: '🔄' },
  { key: 'key',         label: '차키관리',       icon: '🔑' },
  { key: 'maint',       label: '정비',           icon: '🔧' },
  { key: 'product',     label: '상품화',         icon: '✨' },
  { key: 'accident',    label: '사고접수/처리',  icon: '💥' },
  { key: 'repair',      label: '사고수리',       icon: '🔨' },
  { key: 'penalty',     label: '과태료',         icon: '🚫' },
  { key: 'collect',     label: '미수관리',       icon: '📨' },
  { key: 'insurance',   label: '보험관리',       icon: '🛡' },
  { key: 'wash',        label: '세차',           icon: '🧼' },
  { key: 'fuel',        label: '연료보충',       icon: '⛽' },
];

const OP_TYPES = ['contact', 'delivery', 'return', 'force', 'transfer', 'key', 'maint', 'product', 'accident', 'repair', 'penalty', 'collect', 'insurance', 'wash', 'fuel'];

let allEvents = [];
let activeType = 'all';
let gridApi = null;

function renderList() {
  const host = $('#opViewList');
  host.innerHTML = TYPES.map(t => {
    const count = t.key === 'all'
      ? allEvents.filter(e => OP_TYPES.includes(e.type)).length
      : allEvents.filter(e => e.type === t.key).length;
    return `<div class="op-type${activeType === t.key ? ' is-active' : ''}" data-type="${t.key}">
      <span class="op-type__icon">${t.icon}</span>
      <span class="op-type__label">${t.label}</span>
      <span class="op-type__sub">${count}건</span>
    </div>`;
  }).join('');

  host.querySelectorAll('.op-type').forEach(el => {
    el.addEventListener('click', () => {
      activeType = el.dataset.type;
      renderList();
      refreshGrid();
    });
  });
}

function getFilteredEvents() {
  if (activeType === 'all') return allEvents.filter(e => OP_TYPES.includes(e.type));
  return allEvents.filter(e => e.type === activeType);
}

function refreshGrid() {
  const items = getFilteredEvents()
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  const t = TYPES.find(x => x.key === activeType);
  $('#opViewTitle').textContent = `${t?.icon || ''} ${t?.label || '전체'}`;
  $('#opViewCount').textContent = `${items.length}건`;

  if (gridApi) gridApi.destroy();
  gridApi = agGrid.createGrid($('#opViewGrid'), {
    columnDefs: [
      { headerName: '일자', field: 'date', width: 85, valueFormatter: p => fmtDate(p.value) },
      { headerName: '유형', field: 'type', width: 75,
        valueFormatter: p => EVENT_TYPES[p.value] || p.value || '-' },
      { headerName: '차량번호', field: 'car_number', width: 90 },
      { headerName: '제목', field: 'title', width: 180 },
      { headerName: '금액', field: 'amount', width: 100, type: 'numericColumn',
        valueFormatter: p => p.value ? fmt(p.value) : '-' },
      { headerName: '업체/장소', field: 'vendor', width: 120 },
      { headerName: '보험사', field: 'insurance_company', width: 90 },
      { headerName: '보험접수번호', field: 'insurance_no', width: 100 },
      { headerName: '키구분', field: 'key_action', width: 65 },
      { headerName: '키종류', field: 'key_type', width: 65 },
      { headerName: '키번호/위치', field: 'key_info', width: 100 },
      { headerName: '고객명', field: 'customer_name', width: 80 },
      { headerName: '연락처', field: 'customer_phone', width: 100 },
      { headerName: '응대유형', field: 'contact_type', width: 80 },
      { headerName: '메모', field: 'note', flex: 1 },
    ],
    rowData: items,
    defaultColDef: { resizable: true, sortable: true, editable: false, minWidth: 50 },
    rowHeight: 28,
    headerHeight: 28,
    animateRows: false,
    suppressContextMenu: true,
    onGridReady: (p) => p.api.autoSizeAllColumns(),
  });
}

export async function mount() {
  watchEvents((items) => {
    allEvents = items;
    renderList();
    refreshGrid();
  });
}
