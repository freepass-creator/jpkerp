/**
 * pages/status-product.js — 상품대기 현황
 * freepasserp products 실시간 연동 — 등록된 상품 중 출고 전 대기 상태 목록
 */
import { watchAssets } from '../firebase/assets.js';
import { watchContracts } from '../firebase/contracts.js';
import { watchProducts } from '../firebase/freepass-db.js';

const $ = (s) => document.querySelector(s);
const fmtComma = (v) => {
  const n = Number(String(v || '').replace(/,/g, ''));
  return isNaN(n) || !n ? '' : n.toLocaleString();
};
const fmtDate = (s) => {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1].slice(2)}.${m[2]}.${m[3]}` : s;
};

let gridApi, assets = [], contracts = [];
let productMap = new Map(); // car_number → product
let selectedCar = null;

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
  const d = new Date(s); if (isNaN(d.getTime())) return '';
  d.setMonth(d.getMonth() + Number(c.rent_months)); d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function buildRows() {
  const today = new Date().toISOString().slice(0, 10);
  // 활성 계약 차량 (출고 중) 제외
  const activeCars = new Set(contracts.filter(c => {
    if (c.status === 'deleted') return false;
    if (!c.contractor_name?.trim()) return false;
    const s = normalizeDate(c.start_date);
    if (!s || s > today) return false;
    const e = computeEnd(c);
    return !e || e >= today;
  }).map(c => c.car_number).filter(Boolean));

  const rows = [];
  for (const [cn, p] of productMap) {
    // 출고 중인 차량 제외
    if (activeCars.has(cn)) continue;
    const asset = assets.find(a => a.car_number === cn);
    rows.push({
      car_number: cn,
      partner_code: p.partner_code || p.provider_company_code || '-',
      model_name: p.model_name || asset?.car_model || '',
      sub_model: p.sub_model || asset?.detail_model || '',
      vehicle_status: p.vehicle_status || '출고가능',
      product_type: p.product_type || '-',
      rent_48: p.price?.['48']?.rent || p.rental_price_48 || 0,
      deposit_48: p.price?.['48']?.deposit || p.deposit_48 || 0,
      year: p.year || '',
      mileage: p.mileage || 0,
      source: p.source === 'jpkerp4' ? 'ERP' : '프리패스',
      created_at: p.created_at || 0,
    });
  }
  return rows;
}

function refresh() {
  if (!gridApi) return;
  const rows = buildRows();
  gridApi.setGridOption('rowData', rows);
  const cnt = $('#productCount');
  if (cnt) cnt.textContent = rows.length;
  if (selectedCar) renderDetail(selectedCar);
}

function renderDetail(carNumber) {
  const host = $('#prodDetail');
  const titleEl = $('#prodDetailTitle');
  const subEl = $('#prodDetailSub');
  const p = productMap.get(carNumber);
  if (!p) {
    titleEl.textContent = '상품 상세';
    subEl.textContent = '좌측에서 상품을 선택하세요';
    host.innerHTML = '<div class="form-section" style="text-align:center;color:var(--c-text-muted)">선택 안됨</div>';
    return;
  }

  titleEl.textContent = carNumber;
  subEl.textContent = `${p.sub_model || p.model_name || ''} · ${p.partner_code || ''}`;

  const info = [
    ['상품코드', p.product_code || '-'],
    ['차량상태', p.vehicle_status || '-'],
    ['상품구분', p.product_type || '-'],
    ['제조사', p.maker || '-'],
    ['모델', p.model_name || '-'],
    ['세부모델', p.sub_model || '-'],
    ['연식', p.year || '-'],
    ['연료', p.fuel_type || '-'],
    ['외장색', p.ext_color || '-'],
    ['차량가격', fmtComma(p.vehicle_price)],
    ['주행거리', p.mileage ? `${fmtComma(p.mileage)}km` : '-'],
    ['등록일', new Date(p.created_at).toLocaleDateString()],
    ['출처', p.source === 'jpkerp4' ? 'ERP 등록' : '프리패스 등록'],
  ];

  const infoHtml = `<div class="ioc-car-info">
    <div class="ioc-car-col">
      ${info.slice(0, 7).map(([k, v]) => `<div class="ioc-car-row"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('')}
    </div>
    <div class="ioc-car-col">
      ${info.slice(7).map(([k, v]) => `<div class="ioc-car-row"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('')}
    </div>
  </div>`;

  const priceHtml = renderPriceTable(p.price);
  const noteHtml = p.note || p.partner_memo
    ? `<div class="form-section"><div class="form-section-title"><i class="ph ph-note-pencil"></i>메모</div><div style="padding:0 4px;font-size:var(--font-size-sm);color:var(--c-text-sub)">${p.note || p.partner_memo}</div></div>`
    : '';

  host.innerHTML = `
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-car"></i>상품 정보</div>
      ${infoHtml}
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-currency-krw"></i>기간별 렌트료</div>
      ${priceHtml}
    </div>
    ${noteHtml}
  `;
}

function renderPriceTable(price) {
  if (!price) return '<div style="padding:0 4px;color:var(--c-text-muted);font-size:var(--font-size-xs)">가격 미설정</div>';
  const periods = ['12','24','36','48','60'];
  const rows = periods.filter(p => price[p]?.rent).map(p => {
    const r = price[p];
    return `<tr><td style="font-weight:var(--fw-bold)">${p}개월</td><td class="is-num">${fmtComma(r.rent)}</td><td class="is-num">${fmtComma(r.deposit)}</td></tr>`;
  });
  if (!rows.length) return '<div style="padding:0 4px;color:var(--c-text-muted);font-size:var(--font-size-xs)">가격 미설정</div>';
  return `<table class="grid-table">
    <thead><tr><th>기간</th><th class="is-num">월렌트료</th><th class="is-num">보증금</th></tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table>`;
}

export async function mount() {
  const el = $('#productGrid');
  if (!el) return;

  const STATUS_COLOR = {
    '출고가능': 'var(--c-success)',
    '출고협의': 'var(--c-primary)',
    '계약대기': 'var(--c-primary)',
    '출고불가': 'var(--c-danger)',
    '계약완료': 'var(--c-text-muted)',
  };

  gridApi = agGrid.createGrid(el, {
    columnDefs: [
      { headerName: '#', valueGetter: 'node.rowIndex+1', width: 45, cellStyle: { color: 'var(--c-text-muted)' } },
      { headerName: '회사코드', field: 'partner_code', width: 80 },
      { headerName: '차량번호', field: 'car_number', width: 95 },
      { headerName: '모델', field: 'model_name', width: 100 },
      { headerName: '세부모델', field: 'sub_model', flex: 1, minWidth: 120 },
      { headerName: '차량상태', field: 'vehicle_status', width: 85,
        cellStyle: p => ({ color: STATUS_COLOR[p.value] || 'var(--c-text)', fontWeight: 'var(--fw-bold)' }) },
      { headerName: '상품구분', field: 'product_type', width: 85 },
      { headerName: '48월렌트', field: 'rent_48', width: 90, filter: false,
        valueFormatter: p => fmtComma(p.value),
        cellStyle: { textAlign: 'right' } },
      { headerName: '보증금', field: 'deposit_48', width: 90, filter: false,
        valueFormatter: p => fmtComma(p.value),
        cellStyle: { textAlign: 'right' } },
      { headerName: '출처', field: 'source', width: 70 },
    ],
    rowData: [],
    defaultColDef: { resizable: true, sortable: true, filter: 'agTextColumnFilter', editable: false, minWidth: 50 },
    rowHeight: 28,
    headerHeight: 28,
    animateRows: false,
    rowSelection: 'single',
    onRowClicked: (e) => {
      selectedCar = e.data?.car_number;
      if (selectedCar) renderDetail(selectedCar);
    },
    onGridReady: (p) => p.api.autoSizeAllColumns(),
  });
  el._agApi = gridApi;

  watchAssets((items) => { assets = items; refresh(); });
  watchContracts((items) => { contracts = items; refresh(); });
  watchProducts((map) => { productMap = map; refresh(); });

  $('#productSearch')?.addEventListener('input', (e) => {
    gridApi?.setGridOption('quickFilterText', e.target.value);
  });
}
