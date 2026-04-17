/**
 * pages/status-idle.js — 휴차 현황 (목록 + 이력관리/상품등록)
 * 컬럼: 회사 · 차량 · 세부모델 · 현재위치 · 작업구분 · 작업상태 · 상품등록 · 휴차사유 · 휴차기간
 */
import { watchAssets } from '../firebase/assets.js';
import { watchContracts } from '../firebase/contracts.js';
import { watchEvents } from '../firebase/events.js';
import { watchProducts, findProductByCarNumber, saveProductToFreepass } from '../firebase/freepass-db.js';
import { showContextMenu } from '../core/context-menu.js';

const $ = (s) => document.querySelector(s);
const fmtDate = (s) => {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1].slice(2)}.${m[2]}.${m[3]}` : s;
};
const fmtComma = (v) => {
  const n = Number(String(v || '').replace(/,/g, ''));
  return isNaN(n) || !n ? '' : n.toLocaleString();
};

function normalizeDate(s) {
  if (!s) return '';
  let v = String(s).trim().replace(/[./]/g, '-');
  const m = v.match(/^(\d{2})-(\d{1,2})-(\d{1,2})$/);
  if (m) v = `${Number(m[1]) < 50 ? 2000 + Number(m[1]) : 1900 + Number(m[1])}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return v;
}

function computeContractEnd(c) {
  if (c.end_date) return normalizeDate(c.end_date);
  const start = normalizeDate(c.start_date);
  if (!start || !c.rent_months) return '';
  const d = new Date(start);
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

let gridApi, assets = [], contracts = [], events = [];
let selectedCar = null;
let productCache = new Map(); // car_number → product (실시간 동기화)

function computeIdle() {
  const today = new Date().toISOString().slice(0, 10);

  const activeCars = new Set(contracts.filter(c => {
    if (c.status === 'deleted') return false;
    if (!c.contractor_name?.trim()) return false;
    const s = normalizeDate(c.start_date);
    if (!s || s > today) return false;
    const e = computeContractEnd(c);
    return !e || e >= today;
  }).map(c => c.car_number).filter(Boolean));

  const locByCar = new Map();
  const lastEventByCar = new Map();
  const sorted = [...events]
    .filter(e => e.status !== 'deleted')
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  sorted.forEach(e => {
    if (!e.car_number) return;
    if (!locByCar.has(e.car_number)) {
      const loc = e.to_location || e.return_location || e.delivery_location || '';
      if (loc) locByCar.set(e.car_number, loc);
    }
    if (!lastEventByCar.has(e.car_number)) {
      lastEventByCar.set(e.car_number, e);
    }
  });

  const contractsByCar = {};
  contracts.filter(c => c.status !== 'deleted').forEach(c => {
    if (!c.car_number) return;
    if (!contractsByCar[c.car_number]) contractsByCar[c.car_number] = [];
    contractsByCar[c.car_number].push(c);
  });

  return assets
    .filter(a => a.status !== 'deleted' && !activeCars.has(a.car_number))
    .map(a => {
      const cs = (contractsByCar[a.car_number] || [])
        .sort((x, y) => String(y.start_date || '').localeCompare(String(x.start_date || '')));
      let reason = '계약없음';
      let idle_start = '';
      if (cs.length) {
        const latest = cs[0];
        if (!latest.contractor_name?.trim()) {
          reason = '계약자정보누락';
        } else {
          const s = normalizeDate(latest.start_date);
          const e = computeContractEnd(latest);
          if (s && s > today) { reason = '계약대기'; idle_start = today; }
          else if (e && e < today) { reason = '계약만료'; idle_start = e; }
          else { reason = '계약무효'; }
        }
      }

      const cached = productCache.get(a.car_number);
      return {
        partner_code: a.partner_code || '-',
        car_number: a.car_number || '-',
        detail_model: a.detail_model || a.car_model || '',
        current_location: locByCar.get(a.car_number) || '',
        last_work: EVENT_LABEL[(lastEventByCar.get(a.car_number) || {}).type] || '',
        last_work_status: (lastEventByCar.get(a.car_number) || {}).work_status || '',
        product_status: cached ? (cached.vehicle_status || '상품대기') : '',
        idle_reason: reason,
        idle_days: idle_start ? Math.max(0, Math.floor((new Date(today) - new Date(idle_start)) / 86400000)) : '',
        vin: a.vin,
      };
    });
}

function refresh() {
  if (!gridApi) return;
  const rows = computeIdle();
  gridApi.setGridOption('rowData', rows);
  const cnt = $('#idleCount');
  if (cnt) cnt.textContent = rows.length;
  // 패널헤드 상품등록 버튼 상태
  const btn = $('#btnProductReg');
  if (btn) btn.disabled = !selectedCar;
  if (selectedCar) renderHistory(selectedCar);
}


/* ── 우측 패널: 이력관리 ── */
function renderHistory(carNumber) {
  const host = $('#idleHistory');
  const titleEl = $('#idleHistoryTitle');
  const subEl = $('#idleHistorySub');
  const asset = assets.find(a => a.car_number === carNumber);
  if (!asset) {
    titleEl.textContent = '이력관리';
    subEl.textContent = '좌측에서 차량을 선택하세요';
    host.innerHTML = '<div class="form-section" style="text-align:center;color:var(--c-text-muted)">선택 안됨</div>';
    return;
  }
  titleEl.textContent = carNumber;
  subEl.textContent = `${asset.detail_model || asset.car_model || ''} · ${asset.partner_code || ''}`;

  // 상품등록 버튼 텍스트 갱신
  const btn = $('#btnProductReg');
  const prod = productCache.get(carNumber);
  if (btn) {
    btn.disabled = false;
    const label = btn.querySelector('.btn-label');
    if (label) label.textContent = prod ? '상품 정보' : '상품 등록';
  }

  // 상품 정보 섹션
  const productHtml = prod
    ? `<div class="form-section">
        <div class="form-section-title"><i class="ph ph-storefront"></i>상품 등록 정보</div>
        <div class="ioc-car-info">
          <div class="ioc-car-col">
            <div class="ioc-car-row"><span class="k">상품코드</span><span class="v">${prod.product_code || '-'}</span></div>
            <div class="ioc-car-row"><span class="k">상태</span><span class="v" style="color:var(--c-success)">${prod.vehicle_status || '출고가능'}</span></div>
            <div class="ioc-car-row"><span class="k">상품구분</span><span class="v">${prod.product_type || '-'}</span></div>
          </div>
          <div class="ioc-car-col">
            <div class="ioc-car-row"><span class="k">제조사</span><span class="v">${prod.maker || '-'}</span></div>
            <div class="ioc-car-row"><span class="k">모델</span><span class="v">${prod.model_name || '-'}</span></div>
            <div class="ioc-car-row"><span class="k">연식</span><span class="v">${prod.year || '-'}</span></div>
          </div>
        </div>
        ${renderPriceTable(prod.price)}
      </div>` : '';

  // 계약 이력
  const carContracts = contracts
    .filter(c => c.car_number === carNumber && c.status !== 'deleted')
    .sort((a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')));
  const carEvents = events
    .filter(e => e.car_number === carNumber && e.status !== 'deleted')
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, 20);

  const contractsHtml = carContracts.length ? carContracts.map(c => `
    <div class="dash-todo">
      <div class="dash-todo-body">
        <div class="dash-todo-label">${c.contractor_name || '-'}</div>
        <div class="dash-todo-item-sub">${c.contract_code || ''} · ${c.contract_status || ''}</div>
      </div>
      <span style="font-size:var(--font-size-xs);color:var(--c-text-muted)">${fmtDate(c.start_date)} ~ ${fmtDate(computeContractEnd(c))}</span>
    </div>`).join('') : '<div class="form-section" style="color:var(--c-text-muted)">계약 이력 없음</div>';

  const EVENT_META = {
    delivery: { icon: 'ph-truck', color: '#10b981', label: '출고' },
    return:   { icon: 'ph-arrow-u-down-left', color: '#059669', label: '반납' },
    force:    { icon: 'ph-warning-octagon', color: '#dc2626', label: '강제회수' },
    transfer: { icon: 'ph-arrows-left-right', color: '#14b8a6', label: '이동' },
    maint:    { icon: 'ph-wrench', color: '#f97316', label: '���비' },
    repair:   { icon: 'ph-hammer', color: '#ea580c', label: '사고수리' },
    product:  { icon: 'ph-sparkle', color: '#8b5cf6', label: '상품화' },
    wash:     { icon: 'ph-drop', color: '#a855f7', label: '세차' },
    accident: { icon: 'ph-car-profile', color: '#ef4444', label: '사고' },
    contact:  { icon: 'ph-phone', color: '#3b82f6', label: '고객센터' },
    insurance:{ icon: 'ph-shield-check', color: '#7c3aed', label: '보험' },
  };
  const eventsHtml = carEvents.length ? carEvents.map(e => {
    const m = EVENT_META[e.type] || { icon: 'ph-circle', color: 'var(--c-text-muted)', label: e.type || '-' };
    return `<div class="dash-todo">
      <i class="ph ${m.icon}" style="color:${m.color};flex-shrink:0"></i>
      <div class="dash-todo-body">
        <div class="dash-todo-label">${m.label}</div>
        <div class="dash-todo-item-sub">${e.title || ''}${e.from_location || e.to_location ? ` · ${e.from_location || ''} → ${e.to_location || ''}` : ''}</div>
      </div>
      <span style="font-size:var(--font-size-xs);color:var(--c-text-muted)">${fmtDate(e.date)}</span>
    </div>`;
  }).join('') : '<div class="form-section" style="color:var(--c-text-muted)">운영이력 없음</div>';

  host.innerHTML = `
    ${productHtml}
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

function renderPriceTable(price) {
  if (!price) return '<div style="padding:8px 12px;color:var(--c-text-muted);font-size:var(--font-size-xs)">가격 미설정</div>';
  const periods = ['12','24','36','48','60'];
  const rows = periods.filter(p => price[p]?.rent).map(p => {
    const r = price[p];
    return `<tr><td class="k">${p}개월</td><td class="is-num">${fmtComma(r.rent)}</td><td class="is-num">${fmtComma(r.deposit)}</td></tr>`;
  });
  if (!rows.length) return '<div style="padding:8px 12px;color:var(--c-text-muted);font-size:var(--font-size-xs)">가격 미설정</div>';
  return `<table class="grid-table" style="margin-top:var(--sp-3)">
    <thead><tr><th>기간</th><th class="is-num">월렌트료</th><th class="is-num">보증금</th></tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table>`;
}

/* ── 상품 등록 폼 ── */
function renderProductForm(carNumber) {
  const host = $('#idleHistory');
  const titleEl = $('#idleHistoryTitle');
  const subEl = $('#idleHistorySub');
  const asset = assets.find(a => a.car_number === carNumber);
  if (!asset) return;

  titleEl.textContent = '상품 등록';
  subEl.textContent = `${carNumber} · ${asset.detail_model || asset.car_model || ''}`;

  const periods = ['12','24','36','48','60'];

  host.innerHTML = `
    <div style="overflow:auto;flex:1">
      <div class="form-section">
        <div class="form-section-title"><i class="ph ph-car"></i>차량 정보</div>
        <div class="form-grid">
          <div class="field"><label>차량번호</label><input type="text" value="${asset.car_number || ''}" readonly></div>
          <div class="field"><label>회사코드</label><input type="text" value="${asset.partner_code || ''}" readonly></div>
          <div class="field"><label>제조사</label><input type="text" name="fp_maker" value="${asset.maker || ''}" placeholder="현대/기아/..."></div>
          <div class="field"><label>모델명</label><input type="text" name="fp_model" value="${asset.car_model || ''}" placeholder="모델"></div>
          <div class="field"><label>세부모델</label><input type="text" name="fp_sub_model" value="${asset.detail_model || ''}" placeholder="세부모델"></div>
          <div class="field"><label>��식</label><input type="text" name="fp_year" value="${asset.year || ''}" placeholder="2024"></div>
          <div class="field"><label>연료</label><input type="text" name="fp_fuel" value="${asset.fuel_type || ''}" placeholder="가솔린/디젤/전기"></div>
          <div class="field"><label>외장색</label><input type="text" name="fp_ext_color" value="${asset.ext_color || ''}" placeholder="흰색"></div>
          <div class="field"><label>차량가격</label><input type="text" name="fp_price" value="${fmtComma(asset.vehicle_price)}" inputmode="numeric" placeholder="0"></div>
          <div class="field"><label>주행거리</label><input type="text" name="fp_mileage" value="${fmtComma(asset.mileage)}" inputmode="numeric" placeholder="0"></div>
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-title"><i class="ph ph-currency-krw"></i>기간별 렌트료</div>
        <table class="grid-table">
          <thead><tr><th>기��</th><th class="is-num">월렌트료</th><th class="is-num">보증금</th></tr></thead>
          <tbody>
            ${periods.map(p => `<tr>
              <td style="font-weight:var(--fw-bold)">${p}개월</td>
              <td><input type="text" name="fp_rent_${p}" inputmode="numeric" placeholder="0" style="text-align:right"></td>
              <td><input type="text" name="fp_dep_${p}" inputmode="numeric" placeholder="0" style="text-align:right"></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <div class="form-section">
        <div class="form-section-title"><i class="ph ph-note-pencil"></i>기타</div>
        <div class="form-grid">
          <div class="field"><label>상품구분</label>
            <select name="fp_type">
              <option value="중고렌트">중���렌트</option>
              <option value="신차렌트">신차렌트</option>
              <option value="중고구독">중고구독</option>
              <option value="신차구독">신차구독</option>
            </select>
          </div>
          <div class="field"><label>메모</label><textarea name="fp_note" rows="2" placeholder="특이사항"></textarea></div>
        </div>
      </div>

      <div class="panel-foot">
        <button id="btnCancelProduct" class="btn"><i class="ph ph-clock-counter-clockwise"></i>이력보기</button>
        <button id="btnSaveProduct" class="btn btn-primary"><i class="ph ph-storefront"></i>프리패스 등록</button>
      </div>
    </div>
  `;

  // 천단위 콤마 자동
  host.querySelectorAll('input[inputmode="numeric"]').forEach(inp => {
    inp.addEventListener('input', () => {
      const raw = inp.value.replace(/[^\d]/g, '');
      inp.value = raw ? Number(raw).toLocaleString() : '';
    });
  });

  $('#btnCancelProduct')?.addEventListener('click', () => renderHistory(carNumber));
  $('#btnSaveProduct')?.addEventListener('click', () => submitProduct(carNumber));
}

async function submitProduct(carNumber) {
  const host = $('#idleHistory');
  const asset = assets.find(a => a.car_number === carNumber);
  if (!asset) return;

  const val = (name) => host.querySelector(`[name="${name}"]`)?.value?.trim() || '';
  const num = (name) => Number(val(name).replace(/,/g, '')) || 0;

  const price = {};
  ['12','24','36','48','60'].forEach(p => {
    const rent = num(`fp_rent_${p}`);
    const deposit = num(`fp_dep_${p}`);
    if (rent || deposit) price[p] = { rent, deposit };
  });

  const btn = $('#btnSaveProduct');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ph ph-spinner"></i>등록 ���...'; }

  try {
    const result = await saveProductToFreepass({
      car_number: asset.car_number,
      partner_code: asset.partner_code || '',
      maker: val('fp_maker'),
      model_name: val('fp_model'),
      sub_model: val('fp_sub_model'),
      year: val('fp_year'),
      fuel_type: val('fp_fuel'),
      ext_color: val('fp_ext_color'),
      vehicle_price: num('fp_price'),
      mileage: num('fp_mileage'),
      product_type: val('fp_type') || '중고렌트',
      note: val('fp_note'),
      price,
      first_registration_date: asset.first_registration_date || '',
      vehicle_age_expiry_date: asset.vehicle_age_expiry_date || '',
    });

    // watchProducts가 실시간으로 갱신해줌 — 약간의 딜레이 후 렌더
    setTimeout(() => renderHistory(carNumber), 500);
    showToast(`상품 등록 완료 (${result.productCode})`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ph ph-storefront"></i>프리패�� 등록'; }
  }
}

function showToast(msg, type) {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

/* ── mount ── */
export async function mount() {
  const el = $('#idleGrid');
  if (!el) return;

  const REASON_COLOR = {
    '계약없음':       'var(--c-text-muted)',
    '계약만료':       '#c08a2b',
    '계약대기':       'var(--c-primary)',
    '계약자정보누락': 'var(--c-danger)',
    '계약무효':       'var(--c-danger)',
  };

  gridApi = agGrid.createGrid(el, {
    columnDefs: [
      { headerName: '#', valueGetter: 'node.rowIndex+1', width: 45, cellStyle: { color: 'var(--c-text-muted)' } },
      { headerName: '회사코드', field: 'partner_code', width: 80 },
      { headerName: '차량번호', field: 'car_number', width: 95 },
      { headerName: '세부모델', field: 'detail_model', flex: 1, minWidth: 140 },
      { headerName: '현재위치', field: 'current_location', width: 130,
        cellStyle: p => ({ color: p.value ? 'var(--c-text)' : 'var(--c-text-muted)' }),
        valueFormatter: p => p.value || '-' },
      { headerName: '작업구���', field: 'last_work', width: 90,
        valueFormatter: p => p.value || '-' },
      { headerName: '작업상태', field: 'last_work_status', width: 90,
        valueFormatter: p => p.value || '-' },
      { headerName: '상품등록', field: 'product_status', width: 85,
        cellStyle: p => {
          const v = p.value;
          if (!v) return { color: 'var(--c-text-muted)' };
          if (v === '출고가능') return { color: 'var(--c-success)', fontWeight: 'var(--fw-bold)' };
          if (v === '출고불가') return { color: 'var(--c-danger)', fontWeight: 'var(--fw-bold)' };
          return { color: 'var(--c-primary)', fontWeight: 'var(--fw-bold)' };
        },
        valueFormatter: p => p.value || '미등록' },
      { headerName: '휴차사유', field: 'idle_reason', width: 110,
        cellStyle: p => ({ color: REASON_COLOR[p.value] || 'var(--c-text)', fontWeight: 'var(--fw-bold)' }) },
      { headerName: '휴차기간', field: 'idle_days', width: 85,
        valueFormatter: p => p.value !== '' ? `${p.value}일` : '-',
        cellStyle: p => {
          if (p.value === '' || p.value < 7) return {};
          const w = Math.floor(p.value / 7);
          if (p.value >= 60) return { color: 'var(--c-danger)', fontWeight: 'var(--fw-bold)' };
          const colors = ['#d4a848','#c89b3a','#bc8e2c','#b0811e','#a47410','#986702','#8c5a00','#805000'];
          return { color: colors[Math.min(w - 1, 7)], fontWeight: 'var(--fw-bold)' };
        } },
    ],
    rowData: [],
    defaultColDef: { resizable: true, sortable: true, filter: true, editable: false, minWidth: 50 },
    rowHeight: 28,
    headerHeight: 28,
    animateRows: false,
    suppressContextMenu: true,
    rowSelection: 'single',
    onRowClicked: (e) => {
      selectedCar = e.data?.car_number;
      if (selectedCar) renderHistory(selectedCar);
    },
    onGridReady: (p) => p.api.autoSizeAllColumns(),
  });
  el._agApi = gridApi;

  // 우클릭 컨텍스트 메뉴
  el.addEventListener('contextmenu', (e) => {
    const rowEl = e.target.closest('.ag-row');
    if (!rowEl) return;
    e.preventDefault();
    const rowIndex = Number(rowEl.getAttribute('row-index'));
    const node = gridApi.getDisplayedRowAtIndex(rowIndex);
    const car = node?.data?.car_number;
    if (!car) return;
    selectedCar = car;
    node.setSelected(true);
    const prod = productCache.get(car);
    showContextMenu(e, [
      { label: prod ? '상품 정보 보기' : '상품 등록하기', icon: '🏪', action: () => { prod ? renderHistory(car) : renderProductForm(car); } },
      'sep',
      { label: '이력 보기', icon: '🕐', action: () => renderHistory(car) },
    ]);
  });

  // 패널헤드 상품등록 버튼
  const btn = $('#btnProductReg');
  if (btn) {
    btn.addEventListener('click', () => {
      if (!selectedCar) return;
      const prod = productCache.get(selectedCar);
      if (prod) renderHistory(selectedCar);
      else renderProductForm(selectedCar);
    });
  }

  watchAssets((items) => { assets = items; refresh(); });
  watchContracts((items) => { contracts = items; refresh(); });
  watchEvents((items) => { events = items; refresh(); });
  watchProducts((map) => { productCache = map; refresh(); });

  $('#idleSearch')?.addEventListener('input', (e) => {
    gridApi?.setGridOption('quickFilterText', e.target.value);
  });
}
