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
  { key: 'delivery',    label: '정상출고',       icon: '🚗' },
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

// 구분 라벨 — 출고·반납 페이지 전용
const GUBUN_LABEL = {
  delivery: '정상출고',
  return:   '정상반납',
  force:    '강제회수',
  transfer: '차량이동',
  product:  '상품화',
  maint:    '정비',
  repair:   '사고수리',
  accident: '사고접수',
  penalty:  '과태료',
  contact:  '고객응대',
  collect:  '미수관리',
  key:      '차키관리',
  insurance:'보험',
  wash:     '세차',
  fuel:     '연료',
};

// URL 별 프리셋 — 좌측 유형 리스트 & 기본 선택
const URL_PRESETS = {
  '/operation/delivery': { types: ['delivery', 'return', 'force', 'transfer', 'product'], active: 'all' },
  '/operation/maint':    { types: ['maint', 'repair'], active: 'all' },
  '/operation/accident': { types: ['accident', 'repair', 'penalty'], active: 'all' },
  '/operation/contact':  { types: ['contact', 'collect'], active: 'all' },
  '/operation/wash':     { types: ['wash'], active: 'wash' },
  '/operation/fuel':     { types: ['fuel'], active: 'fuel' },
};

function currentPreset() {
  const p = (typeof location !== 'undefined') ? location.pathname : '';
  return URL_PRESETS[p] || null;
}

function visibleTypes() {
  const p = currentPreset();
  return p ? TYPES.filter((t) => t.key === 'all' || p.types.includes(t.key)) : TYPES;
}

function scopeFilter() {
  const p = currentPreset();
  return p ? p.types : OP_TYPES;
}

let allEvents = [];
let activeType = 'all';
let gridApi = null;

function renderList() {
  const host = $('#opViewList');
  const scope = scopeFilter();
  const list = visibleTypes();
  host.innerHTML = list.map(t => {
    const count = t.key === 'all'
      ? allEvents.filter(e => scope.includes(e.type)).length
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
  const scope = scopeFilter();
  if (activeType === 'all') return allEvents.filter(e => scope.includes(e.type));
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
      { headerName: '구분', field: 'type', width: 90,
        valueFormatter: p => GUBUN_LABEL[p.value] || EVENT_TYPES[p.value] || p.value || '-' },
      { headerName: '차량번호', field: 'car_number', width: 90 },
      { headerName: '회사', field: 'company_name', width: 110 },
      { headerName: '모델', field: 'detail_model', width: 90 },
      { headerName: '📷', field: 'photos', width: 50,
        valueGetter: p => Array.isArray(p.data?.photos) ? p.data.photos.length : 0,
        cellStyle: { textAlign: 'center' },
        valueFormatter: p => p.value ? String(p.value) : '' },
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
    onGridReady: (p) => { p.api.autoSizeAllColumns(); p.api.gridOptionsService?.eGridDiv && (p.api.gridOptionsService.eGridDiv._agApi = p.api); },
    onRowClicked: (e) => {
      if (e.data) showDetail(e.data);
    },
  });
}

function showDetail(ev) {
  const grid = $('#opViewGrid');
  const detail = $('#opDetailView');
  grid.style.display = 'none';
  detail.hidden = false;
  detail.style.display = 'block';

  const t = TYPES.find(x => x.key === ev.type) || {};
  const fmtAmt = (v) => v ? fmt(v) : '';

  // 기본 필드
  const fields = [
    ['일자', fmtDate(ev.date)],
    ['유형', `${t.icon || ''} ${EVENT_TYPES[ev.type] || ev.type || ''}`],
    ['차량번호', ev.car_number],
    ['제목', ev.title],
    ['금액', fmtAmt(ev.amount)],
    ['업체/장소', ev.vendor],
  ];

  // 유형별 추가 필드
  const extras = [];
  if (ev.insurance_company) extras.push(['보험사', ev.insurance_company]);
  if (ev.insurance_no) extras.push(['접수번호', ev.insurance_no]);
  if (ev.accident_other) extras.push(['상대방', ev.accident_other]);
  if (ev.accident_other_phone) extras.push(['상대방연락처', ev.accident_other_phone]);
  if (ev.fault_pct) extras.push(['과실비율', ev.fault_pct]);
  if (ev.fault_ratio) extras.push(['과실(기타)', ev.fault_ratio]);
  if (ev.accident_status) extras.push(['종결여부', ev.accident_status]);
  if (ev.mileage) extras.push(['주행거리', ev.mileage + ' km']);
  if (ev.fuel_level) extras.push(['연료잔량', ev.fuel_level]);
  if (ev.car_condition) extras.push(['차량상태', ev.car_condition]);
  if (ev.exterior) extras.push(['외관', ev.exterior]);
  if (ev.interior) extras.push(['실내', ev.interior]);
  if (ev.delivery_location) extras.push(['인도장소', ev.delivery_location]);
  if (ev.return_location) extras.push(['반납장소', ev.return_location]);
  if (ev.receiver_name) extras.push(['인수자', ev.receiver_name]);
  if (ev.customer_name) extras.push(['고객명', ev.customer_name]);
  if (ev.customer_phone) extras.push(['연락처', ev.customer_phone]);
  if (ev.contact_type) extras.push(['응대유형', ev.contact_type]);
  if (ev.contact_result) extras.push(['처리결과', ev.contact_result]);
  if (ev.handler) extras.push(['담당자', ev.handler]);
  if (ev.repair_status) extras.push(['수리상태', ev.repair_status]);
  if (ev.key_action) extras.push(['키구분', ev.key_action]);
  if (ev.product_status) extras.push(['진행상태', ev.product_status]);

  // 리스트 데이터 (정비/사고수리/상품화 항목)
  let listHtml = '';
  const renderList = (title, items) => {
    if (!items || !items.length) return '';
    return `<div style="margin-top:12px">
      <div style="font-weight:600;font-size:var(--font-size-sm);margin-bottom:4px">${title}</div>
      <table class="grid-table" style="font-size:var(--font-size-sm)">
        <thead><tr><th>항목</th>${items[0].vendor !== undefined ? '<th>업체</th>' : ''}<th class="is-num">금액</th></tr></thead>
        <tbody>${items.map(r => `<tr><td>${r.item || ''}</td>${r.vendor !== undefined ? `<td>${r.vendor || ''}</td>` : ''}<td class="is-num">${r.cost ? fmt(r.cost) : ''}</td></tr>`).join('')}</tbody>
      </table>
    </div>`;
  };

  if (ev.parts_list) listHtml += renderList('소모품 교체', ev.parts_list);
  if (ev.fix_list) listHtml += renderList('기능수리', ev.fix_list);
  if (ev.repair_list) listHtml += renderList('수리 항목', ev.repair_list);
  if (ev.wash_list) listHtml += renderList('세차/광택', ev.wash_list);
  if (ev.product_sections) {
    const names = { prodAccessory: '부속품', prodWash: '세차/광택', prodBody: '외판수리', prodParts: '소모품', prodFix: '기능수리' };
    Object.entries(ev.product_sections).forEach(([k, v]) => {
      listHtml += renderList(names[k] || k, v);
    });
  }

  // 사진 갤러리 (모바일 업로드 + 연결된 사진)
  const photos = Array.isArray(ev.photos) ? ev.photos : [];
  const photosHtml = photos.length ? `
    <div style="margin-top:16px;background:var(--c-bg);border:1px solid var(--c-border);border-radius:var(--r-md);padding:16px">
      <div style="font-weight:600;font-size:var(--font-size);margin-bottom:10px;display:flex;align-items:center;gap:6px">
        <i class="ph ph-images" style="color:var(--c-text-muted)"></i>
        사진 <span style="color:var(--c-text-muted);font-weight:400">${photos.length}장</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px">
        ${photos.map((p, i) => {
          const url = typeof p === 'string' ? p : p.url;
          const isImg = typeof p === 'string' || (p.content_type || '').startsWith('image/');
          return `<a href="${url}" target="_blank" rel="noopener" style="aspect-ratio:1/1;overflow:hidden;background:var(--c-bg-sub);border-radius:var(--r-sm);display:block">
            ${isImg
              ? `<img src="${url}" alt="photo ${i+1}" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block">`
              : `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:var(--c-text-muted)"><i class="ph ph-file" style="font-size:32px"></i></div>`}
          </a>`;
        }).join('')}
      </div>
    </div>
  ` : '';

  const sourceTag = ev.source === 'mobile'
    ? `<span style="background:var(--c-primary-bg);color:var(--c-primary);padding:2px 8px;border-radius:4px;font-size:var(--font-size-xs);font-weight:500">📱 모바일</span>`
    : '';

  detail.innerHTML = `
    <div style="max-width:800px;margin:0 auto;padding:24px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
        <button class="btn" id="opDetailBack">← 목록</button>
        <span style="font-size:var(--font-size-lg);font-weight:700">${t.icon || ''} ${ev.title || ''}</span>
        ${sourceTag}
      </div>
      <div style="background:var(--c-bg);border:1px solid var(--c-border);border-radius:var(--r-md);padding:20px">
        <table style="width:100%;border-collapse:collapse;font-size:var(--font-size)">
          ${[...fields, ...extras].filter(([,v]) => v).map(([label, value]) => `
            <tr>
              <td style="padding:6px 12px 6px 0;color:var(--c-text-muted);width:120px;vertical-align:top">${label}</td>
              <td style="padding:6px 0;font-weight:500">${value}</td>
            </tr>
          `).join('')}
          ${ev.memo ? `<tr><td style="padding:6px 12px 6px 0;color:var(--c-text-muted);vertical-align:top">메모</td><td style="padding:6px 0;white-space:pre-wrap">${ev.memo}</td></tr>` : ''}
          ${ev.note ? `<tr><td style="padding:6px 12px 6px 0;color:var(--c-text-muted);vertical-align:top">메모</td><td style="padding:6px 0;white-space:pre-wrap">${ev.note}</td></tr>` : ''}
          ${ev.uploader_name ? `<tr><td style="padding:6px 12px 6px 0;color:var(--c-text-muted)">업로더</td><td style="padding:6px 0">${ev.uploader_name}</td></tr>` : ''}
        </table>
        ${listHtml}
      </div>
      ${photosHtml}
      <div style="margin-top:12px;color:var(--c-text-muted);font-size:var(--font-size-xs)">
        등록: ${new Date(ev.created_at).toLocaleString('ko-KR')} · ID: ${ev.event_id || ''}
      </div>
    </div>
  `;

  document.getElementById('opDetailBack')?.addEventListener('click', () => {
    detail.style.display = 'none';
    detail.hidden = true;
    grid.style.display = '';
  });
}

export async function mount() {
  // URL 프리셋 적용 — 기본 선택 세팅
  const p = currentPreset();
  activeType = p?.active || 'all';
  watchEvents((items) => {
    allEvents = items;
    renderList();
    refreshGrid();
  });
}
