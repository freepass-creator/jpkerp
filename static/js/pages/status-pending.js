/**
 * pages/status-pending.js — 미결업무 통합 현황
 * 카테고리: 사고진행 / 차량케어 / 미출고 / 보험만기 / 시동제어
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
const fmtComma = (v) => { const n = Number(v || 0); return n ? n.toLocaleString() : '-'; };

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

const CAT_META = {
  accident:   { label: '사고진행', icon: 'ph-car-profile', color: '#ef4444' },
  care:       { label: '차량케어', icon: 'ph-wrench', color: '#f97316' },
  nodelivery: { label: '미출고',   icon: 'ph-truck', color: '#8b5cf6' },
  insurance:  { label: '보험만기', icon: 'ph-shield-check', color: '#7c3aed' },
};

let gridApi, assets = [], contracts = [], events = [];
let allRows = [];
let selectedRow = null;
let currentCat = 'all';

function collectPending() {
  const today = new Date().toISOString().slice(0, 10);
  const todayDate = new Date(today);
  const rows = [];

  // 1) 사고진행 — accident 이벤트 중 accident_status != '종결'
  events.filter(e =>
    e.type === 'accident' && e.status !== 'deleted' &&
    e.accident_status && e.accident_status !== '종결'
  ).forEach(e => {
    const asset = assets.find(a => a.car_number === e.car_number);
    const days = e.date ? Math.floor((todayDate - new Date(e.date)) / 86400000) : 0;
    rows.push({
      cat: 'accident',
      car_number: e.car_number || '-',
      detail_model: asset?.detail_model || asset?.car_model || '',
      partner_code: asset?.partner_code || '-',
      summary: `${e.accident_status || '접수'} · ${e.acc_type || ''}`,
      status: e.accident_status || '접수',
      elapsed: Math.max(0, days),
      date: e.date || '',
      _ref: e,
    });
  });

  // 2) 차량케어 — maint/repair/product/wash 중 work_status != '완료'
  events.filter(e =>
    ['maint', 'repair', 'product', 'wash'].includes(e.type) && e.status !== 'deleted' &&
    (!e.work_status || e.work_status !== '완료')
  ).forEach(e => {
    const asset = assets.find(a => a.car_number === e.car_number);
    const label = { maint: '정비', repair: '사고수리', product: '상품화', wash: '세차' }[e.type];
    const days = e.date ? Math.floor((todayDate - new Date(e.date)) / 86400000) : 0;
    rows.push({
      cat: 'care',
      car_number: e.car_number || '-',
      detail_model: asset?.detail_model || asset?.car_model || '',
      partner_code: asset?.partner_code || '-',
      summary: `${label} · ${e.work_status || '입고'}`,
      status: e.work_status || '입고',
      elapsed: Math.max(0, days),
      date: e.date || '',
      _ref: e,
    });
  });

  // 3) 미출고 — 계약 시작됐는데 delivery 이벤트 없는 건
  const deliveredCars = new Set(
    events.filter(e => e.type === 'delivery' && e.status !== 'deleted').map(e => e.car_number)
  );
  contracts.filter(c => {
    if (c.status === 'deleted') return false;
    if (!c.contractor_name?.trim()) return false;
    const s = normalizeDate(c.start_date);
    if (!s || s > today) return false;
    const e = computeEnd(c);
    if (e && e < today) return false;
    return !deliveredCars.has(c.car_number);
  }).forEach(c => {
    const asset = assets.find(a => a.car_number === c.car_number);
    const s = normalizeDate(c.start_date);
    const days = s ? Math.floor((todayDate - new Date(s)) / 86400000) : 0;
    rows.push({
      cat: 'nodelivery',
      car_number: c.car_number || '-',
      detail_model: asset?.detail_model || asset?.car_model || '',
      partner_code: c.partner_code || asset?.partner_code || '-',
      summary: `${c.contractor_name} · 계약후 미출고`,
      status: '미출고',
      elapsed: Math.max(0, days),
      date: s,
      _ref: c,
    });
  });

  // 4) 보험만기 — 자산의 보험만기일이 3개월 이내
  const m3 = new Date(todayDate);
  m3.setMonth(m3.getMonth() + 3);
  const m3s = m3.toISOString().slice(0, 10);
  assets.filter(a => {
    if (a.status === 'deleted') return false;
    const exp = normalizeDate(a.insurance_expiry || a.vehicle_age_expiry_date);
    return exp && exp >= today && exp <= m3s;
  }).forEach(a => {
    const exp = normalizeDate(a.insurance_expiry || a.vehicle_age_expiry_date);
    const days = Math.floor((new Date(exp) - todayDate) / 86400000);
    rows.push({
      cat: 'insurance',
      car_number: a.car_number || '-',
      detail_model: a.detail_model || a.car_model || '',
      partner_code: a.partner_code || '-',
      summary: `보험만기 D-${days}`,
      status: days <= 7 ? '긴급' : days <= 30 ? '임박' : '예정',
      elapsed: days,
      date: exp,
      _ref: a,
    });
  });


  return rows.sort((a, b) => b.elapsed - a.elapsed);
}

function refresh() {
  if (!gridApi) return;
  allRows = collectPending();
  const filtered = currentCat === 'all' ? allRows : allRows.filter(r => r.cat === currentCat);
  gridApi.setGridOption('rowData', filtered);

  // 건수 표시
  const cnt = $('#pendingCount');
  if (cnt) cnt.textContent = `${filtered.length}건`;

  // 카테고리별 뱃지 업데이트
  const counts = {};
  allRows.forEach(r => { counts[r.cat] = (counts[r.cat] || 0) + 1; });
  document.querySelectorAll('#pendingFilter .btn-opt').forEach(btn => {
    const cat = btn.dataset.cat;
    if (cat === 'all') {
      btn.textContent = `전체 ${allRows.length}`;
    } else {
      const meta = CAT_META[cat];
      btn.textContent = `${meta?.label || cat} ${counts[cat] || 0}`;
    }
  });

  if (selectedRow) renderDetail(selectedRow);
}

function renderDetail(row) {
  const host = $('#pendingDetail');
  const titleEl = $('#pendingDetailTitle');
  const subEl = $('#pendingDetailSub');
  const meta = CAT_META[row.cat];

  titleEl.textContent = row.car_number;
  subEl.textContent = `${meta?.label || ''} · ${row.detail_model}`;

  const r = row._ref;
  const asset = assets.find(a => a.car_number === row.car_number);

  // 공통 차량정보
  const carInfo = asset ? `
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-car"></i>차량 정보</div>
      <div class="ioc-car-info">
        <div class="ioc-car-col">
          <div class="ioc-car-row"><span class="k">차량번호</span><span class="v">${asset.car_number || '-'}</span></div>
          <div class="ioc-car-row"><span class="k">세부모델</span><span class="v">${asset.detail_model || asset.car_model || '-'}</span></div>
          <div class="ioc-car-row"><span class="k">회사코드</span><span class="v">${asset.partner_code || '-'}</span></div>
        </div>
        <div class="ioc-car-col">
          <div class="ioc-car-row"><span class="k">��식</span><span class="v">${asset.year || '-'}</span></div>
          <div class="ioc-car-row"><span class="k">연료</span><span class="v">${asset.fuel_type || '-'}</span></div>
          <div class="ioc-car-row"><span class="k">외장색</span><span class="v">${asset.ext_color || '-'}</span></div>
        </div>
      </div>
    </div>` : '';

  // 카테고리별 상세
  let detailHtml = '';

  if (row.cat === 'accident') {
    detailHtml = `
      <div class="form-section">
        <div class="form-section-title"><i class="ph ${meta.icon}" style="color:${meta.color}"></i>사고 정보</div>
        <div class="ioc-car-info">
          <div class="ioc-car-col">
            <div class="ioc-car-row"><span class="k">접수일</span><span class="v">${fmtDate(r.date)}</span></div>
            <div class="ioc-car-row"><span class="k">사고유형</span><span class="v">${r.acc_type || '-'}</span></div>
            <div class="ioc-car-row"><span class="k">처리상태</span><span class="v" style="color:${meta.color};font-weight:var(--fw-bold)">${r.accident_status || '-'}</span></div>
          </div>
          <div class="ioc-car-col">
            <div class="ioc-car-row"><span class="k">과실비율</span><span class="v">${r.fault_pct || '-'}</span></div>
            <div class="ioc-car-row"><span class="k">수리업체</span><span class="v">${r.repair_shop || r.vendor || '-'}</span></div>
            <div class="ioc-car-row"><span class="k">경과일</span><span class="v" style="color:var(--c-danger);font-weight:var(--fw-bold)">${row.elapsed}일</span></div>
          </div>
        </div>
      </div>`;
  } else if (row.cat === 'care') {
    const label = { maint: '정비', repair: '사고수리', product: '상품화', wash: '세차' }[r.type] || r.type;
    detailHtml = `
      <div class="form-section">
        <div class="form-section-title"><i class="ph ${meta.icon}" style="color:${meta.color}"></i>${label} 정보</div>
        <div class="ioc-car-info">
          <div class="ioc-car-col">
            <div class="ioc-car-row"><span class="k">입고일</span><span class="v">${fmtDate(r.date)}</span></div>
            <div class="ioc-car-row"><span class="k">업체</span><span class="v">${r.vendor || '-'}</span></div>
            <div class="ioc-car-row"><span class="k">작업상태</span><span class="v" style="color:${meta.color};font-weight:var(--fw-bold)">${r.work_status || '입고'}</span></div>
          </div>
          <div class="ioc-car-col">
            <div class="ioc-car-row"><span class="k">예상완료</span><span class="v">${fmtDate(r.expected_delivery)}</span></div>
            <div class="ioc-car-row"><span class="k">금액</span><span class="v">${fmtComma(r.amount)}</span></div>
            <div class="ioc-car-row"><span class="k">경과일</span><span class="v" style="color:var(--c-warn);font-weight:var(--fw-bold)">${row.elapsed}일</span></div>
          </div>
        </div>
      </div>`;
  } else if (row.cat === 'nodelivery') {
    detailHtml = `
      <div class="form-section">
        <div class="form-section-title"><i class="ph ${meta.icon}" style="color:${meta.color}"></i>미출고 계약</div>
        <div class="ioc-car-info">
          <div class="ioc-car-col">
            <div class="ioc-car-row"><span class="k">계약자</span><span class="v">${r.contractor_name || '-'}</span></div>
            <div class="ioc-car-row"><span class="k">연락처</span><span class="v">${r.contractor_phone || '-'}</span></div>
            <div class="ioc-car-row"><span class="k">계약코드</span><span class="v">${r.contract_code || '-'}</span></div>
          </div>
          <div class="ioc-car-col">
            <div class="ioc-car-row"><span class="k">시작일</span><span class="v">${fmtDate(normalizeDate(r.start_date))}</span></div>
            <div class="ioc-car-row"><span class="k">계약기간</span><span class="v">${r.rent_months || '-'}개월</span></div>
            <div class="ioc-car-row"><span class="k">지연일</span><span class="v" style="color:var(--c-danger);font-weight:var(--fw-bold)">${row.elapsed}일</span></div>
          </div>
        </div>
      </div>`;
  } else if (row.cat === 'insurance') {
    detailHtml = `
      <div class="form-section">
        <div class="form-section-title"><i class="ph ${meta.icon}" style="color:${meta.color}"></i>보험 정보</div>
        <div class="ioc-car-info">
          <div class="ioc-car-col">
            <div class="ioc-car-row"><span class="k">보험만기</span><span class="v" style="color:${row.elapsed <= 7 ? 'var(--c-danger)' : 'var(--c-warn)'};font-weight:var(--fw-bold)">${fmtDate(row.date)}</span></div>
            <div class="ioc-car-row"><span class="k">D-day</span><span class="v">D-${row.elapsed}</span></div>
          </div>
          <div class="ioc-car-col">
            <div class="ioc-car-row"><span class="k">보험사</span><span class="v">${r.insurance_company || '-'}</span></div>
            <div class="ioc-car-row"><span class="k">보험번호</span><span class="v">${r.insurance_no || '-'}</span></div>
          </div>
        </div>
      </div>`;
  }

  // 해당 차량 최근 이벤트
  const carEvents = events
    .filter(e => e.car_number === row.car_number && e.status !== 'deleted')
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, 10);

  const EVENT_ICON = {
    delivery: { icon: 'ph-truck', color: '#10b981' },
    return: { icon: 'ph-arrow-u-down-left', color: '#059669' },
    force: { icon: 'ph-warning-octagon', color: '#dc2626' },
    transfer: { icon: 'ph-arrows-left-right', color: '#14b8a6' },
    maint: { icon: 'ph-wrench', color: '#f97316' },
    repair: { icon: 'ph-hammer', color: '#ea580c' },
    product: { icon: 'ph-sparkle', color: '#8b5cf6' },
    wash: { icon: 'ph-drop', color: '#a855f7' },
    accident: { icon: 'ph-car-profile', color: '#ef4444' },
    contact: { icon: 'ph-phone', color: '#3b82f6' },
    insurance: { icon: 'ph-shield-check', color: '#7c3aed' },
  };
  const EVENT_LABEL = {
    delivery: '출고', return: '반납', force: '강제회수', transfer: '이동',
    maint: '정비', repair: '사고수리', product: '상품화', wash: '세차',
    accident: '사고', contact: '고객센터', insurance: '보험',
  };
  const eventsHtml = carEvents.length ? carEvents.map(e => {
    const em = EVENT_ICON[e.type] || { icon: 'ph-circle', color: 'var(--c-text-muted)' };
    return `<div class="dash-todo">
      <i class="ph ${em.icon}" style="color:${em.color};flex-shrink:0"></i>
      <div class="dash-todo-body">
        <div class="dash-todo-label">${EVENT_LABEL[e.type] || e.type}</div>
        <div class="dash-todo-item-sub">${e.title || ''}</div>
      </div>
      <span style="font-size:var(--font-size-xs);color:var(--c-text-muted)">${fmtDate(e.date)}</span>
    </div>`;
  }).join('') : '<div class="form-section" style="color:var(--c-text-muted)">이력 없음</div>';

  host.innerHTML = `
    ${carInfo}
    ${detailHtml}
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-clock-counter-clockwise"></i>���근 이력</div>
    </div>
    ${eventsHtml}
  `;
}

export async function mount() {
  const el = $('#pendingGrid');
  if (!el) return;

  gridApi = agGrid.createGrid(el, {
    columnDefs: [
      { headerName: '#', valueGetter: 'node.rowIndex+1', width: 45, cellStyle: { color: 'var(--c-text-muted)' } },
      { headerName: '업무구분', field: 'cat', width: 85,
        valueFormatter: p => CAT_META[p.value]?.label || p.value,
        cellStyle: p => ({ color: CAT_META[p.value]?.color || 'var(--c-text)', fontWeight: 'var(--fw-bold)' }) },
      { headerName: '회사코드', field: 'partner_code', width: 75 },
      { headerName: '차량번호', field: 'car_number', width: 95 },
      { headerName: '세부모델', field: 'detail_model', flex: 1, minWidth: 120 },
      { headerName: '내용', field: 'summary', width: 160 },
      { headerName: '상태', field: 'status', width: 75,
        cellStyle: p => ({ fontWeight: 'var(--fw-bold)' }) },
      { headerName: '경과', field: 'elapsed', width: 65, sort: 'desc', filter: false,
        valueFormatter: p => p.value !== undefined ? `${p.value}일` : '-',
        cellStyle: p => ({
          fontWeight: 'var(--fw-bold)',
          color: p.value >= 30 ? 'var(--c-danger)' : p.value >= 7 ? 'var(--c-warn)' : 'var(--c-text-sub)',
        }) },
      { headerName: '일자', field: 'date', width: 80, valueFormatter: p => fmtDate(p.value) },
    ],
    rowData: [],
    defaultColDef: { resizable: true, sortable: true, filter: 'agTextColumnFilter', editable: false, minWidth: 50 },
    rowHeight: 28,
    headerHeight: 28,
    animateRows: false,
    rowSelection: 'single',
    onRowClicked: (e) => {
      selectedRow = e.data;
      if (selectedRow) renderDetail(selectedRow);
    },
    onGridReady: (p) => p.api.autoSizeAllColumns(),
  });
  el._agApi = gridApi;

  // 카테고리 필터
  document.querySelectorAll('#pendingFilter .btn-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      currentCat = btn.dataset.cat;
      document.querySelectorAll('#pendingFilter .btn-opt').forEach(b => b.classList.toggle('is-active', b === btn));
      const filtered = currentCat === 'all' ? allRows : allRows.filter(r => r.cat === currentCat);
      gridApi.setGridOption('rowData', filtered);
      const cnt = $('#pendingCount');
      if (cnt) cnt.textContent = `${filtered.length}건`;
    });
  });

  // 우클릭 컨텍스트 메뉴 — 미결 처리
  el.addEventListener('contextmenu', (e) => {
    const rowEl = e.target.closest('.ag-row');
    if (!rowEl) return;
    e.preventDefault();
    const rowIndex = Number(rowEl.getAttribute('row-index'));
    const node = gridApi.getDisplayedRowAtIndex(rowIndex);
    const row = node?.data;
    if (!row) return;
    selectedRow = row;
    node.setSelected(true);
    renderDetail(row);

    const items = [];
    if (row.cat === 'accident') {
      items.push({ label: '종결 처리', icon: '✅', action: () => resolveItem(row, { accident_status: '종결' }) });
      items.push({ label: '수리중으로 변경', icon: '🔧', action: () => resolveItem(row, { accident_status: '수리중' }) });
    } else if (row.cat === 'care') {
      items.push({ label: '완료 처리', icon: '✅', action: () => resolveItem(row, { work_status: '완료' }) });
      items.push({ label: '진행중으로 변경', icon: '🔄', action: () => resolveItem(row, { work_status: '진행중' }) });
    } else if (row.cat === 'nodelivery') {
      items.push({ label: '출고 입력하러 가기', icon: '🚗', action: () => { location.href = '/input/operation'; } });
    } else if (row.cat === 'insurance') {
      items.push({ label: '보험 갱신 입력하러 가기', icon: '🛡', action: () => { location.href = '/input/operation'; } });
    }
    items.push('sep');
    items.push({ label: '상세 보기', icon: '📋', action: () => renderDetail(row) });
    showContextMenu(e, items);
  });

  watchAssets((items) => { assets = items; refresh(); });
  watchContracts((items) => { contracts = items; refresh(); });
  watchEvents((items) => { events = items; refresh(); });
}

async function resolveItem(row, updates) {
  try {
    const r = row._ref;
    if (!r._key) throw new Error('이벤트 키를 찾을 수 없습니다');
    const { updateRecord } = await import('../firebase/db.js');
    await updateRecord(`events/${r._key}`, updates);
    showToast('처리 완료', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function showToast(msg, type) {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}
