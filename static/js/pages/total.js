/**
 * pages/total.js — 통합관리
 *
 * 자산 + 계약 + 수납 전부 조인해서 차량 한 대당 한 행.
 * 컬럼 옆으로 쭉 — AG Grid 가로 스크롤.
 */
import { watchAssets } from '../firebase/assets.js';
import { watchContracts } from '../firebase/contracts.js';
import { watchBillings, computeTotalDue } from '../firebase/billings.js';
import { watchCustomers } from '../firebase/customers.js';

const $ = (s) => document.querySelector(s);
const fmt = (v) => Number(v || 0).toLocaleString('ko-KR');
const fmtDate = (s) => {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1].slice(2)}.${m[2]}.${m[3]}` : s;
};

function normalizeDate(s) {
  if (!s) return '';
  let v = String(s).trim().replace(/[./]/g, '-');
  const m = v.match(/^(\d{2})-(\d{1,2})-(\d{1,2})$/);
  if (m) v = `${Number(m[1]) < 50 ? 2000 + Number(m[1]) : 1900 + Number(m[1])}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  return v;
}

let assets = [], contracts = [], billings = [], customers = [];
let gridApi = null;

function buildRows() {
  return assets.map(a => {
    const contract = contracts.find(c => c.car_number === a.car_number) || {};
    const customer = customers.find(c => c.customer_code === contract.contractor_code) || {};
    const bills = billings.filter(b => b.contract_code === contract.contract_code);
    const totalDue = bills.reduce((s, b) => s + computeTotalDue(b), 0);
    const totalPaid = bills.reduce((s, b) => s + (Number(b.paid_total) || 0), 0);

    return {
      // 자산
      car_number: a.car_number || '',
      vin: a.vin || '',
      manufacturer: a.manufacturer || '',
      car_model: a.car_model || '',
      car_year: a.car_year || '',
      asset_status: a.asset_status || '',
      fuel_type: a.fuel_type || '',
      ext_color: a.ext_color || '',
      purchase_method: a.purchase_method || '',
      purchase_date: a.purchase_date || '',
      purchase_price: a.purchase_price || '',
      // 할부
      loan_company: a.loan_company || '',
      loan_principal: a.loan_principal || '',
      loan_months: a.loan_months || '',
      loan_rate: a.loan_rate || '',
      loan_method: a.loan_method || '',
      // 계약
      contract_code: contract.contract_code || '',
      contractor_name: contract.contractor_name || '',
      contractor_phone: contract.contractor_phone || customer.phone || '',
      start_date: normalizeDate(contract.start_date) || '',
      rent_months: contract.rent_months || '',
      rent_amount: contract.rent_amount || '',
      deposit_amount: contract.deposit_amount || '',
      auto_debit_day: contract.auto_debit_day || '',
      contract_status: contract.contract_status || '',
      // 수납
      total_due: totalDue,
      total_paid: totalPaid,
      total_unpaid: totalDue - totalPaid,
      billing_count: bills.length,
    };
  });
}

function refresh() {
  const rows = buildRows();
  if (gridApi) gridApi.destroy();

  gridApi = agGrid.createGrid($('#totalGrid'), {
  $('#totalGrid')._agApi = gridApi;
    columnDefs: [
      { headerName: '#', valueGetter: 'node.rowIndex + 1', width: 45, pinned: 'left' },
      // 자산
      { headerName: '차량번호', field: 'car_number', width: 90, pinned: 'left' },
      { headerName: '모델', field: 'car_model', width: 90 },
      { headerName: '연식', field: 'car_year', width: 55 },
      { headerName: '상태', field: 'asset_status', width: 70 },
      { headerName: '색상', field: 'ext_color', width: 65 },
      { headerName: '연료', field: 'fuel_type', width: 65 },
      { headerName: '취득방법', field: 'purchase_method', width: 75 },
      { headerName: '취득일', field: 'purchase_date', width: 80, valueFormatter: p => fmtDate(p.value) },
      { headerName: '취득가', field: 'purchase_price', width: 90, type: 'numericColumn', valueFormatter: p => p.value ? fmt(p.value) : '' },
      // 할부
      { headerName: '금융사', field: 'loan_company', width: 80 },
      { headerName: '할부원금', field: 'loan_principal', width: 90, type: 'numericColumn', valueFormatter: p => p.value ? fmt(p.value) : '' },
      { headerName: '할부기간', field: 'loan_months', width: 65 },
      { headerName: '금리', field: 'loan_rate', width: 50 },
      { headerName: '대출방식', field: 'loan_method', width: 80 },
      // 계약
      { headerName: '계약코드', field: 'contract_code', width: 80 },
      { headerName: '계약자', field: 'contractor_name', width: 80 },
      { headerName: '연락처', field: 'contractor_phone', width: 100 },
      { headerName: '시작일', field: 'start_date', width: 80, valueFormatter: p => fmtDate(p.value) },
      { headerName: '기간', field: 'rent_months', width: 50 },
      { headerName: '월대여료', field: 'rent_amount', width: 85, type: 'numericColumn', valueFormatter: p => p.value ? fmt(p.value) : '' },
      { headerName: '보증금', field: 'deposit_amount', width: 80, type: 'numericColumn', valueFormatter: p => p.value ? fmt(p.value) : '' },
      { headerName: '결제일', field: 'auto_debit_day', width: 55 },
      { headerName: '계약상태', field: 'contract_status', width: 75 },
      // 수납
      { headerName: '총청구', field: 'total_due', width: 90, type: 'numericColumn', valueFormatter: p => fmt(p.value) },
      { headerName: '총납부', field: 'total_paid', width: 90, type: 'numericColumn', valueFormatter: p => fmt(p.value),
        cellStyle: { color: 'var(--c-success)' } },
      { headerName: '미수', field: 'total_unpaid', width: 90, type: 'numericColumn', valueFormatter: p => fmt(p.value),
        cellStyle: p => ({ color: p.value > 0 ? 'var(--c-danger)' : 'var(--c-success)', fontWeight: 500 }) },
      { headerName: '회차수', field: 'billing_count', width: 55 },
    ],
    rowData: rows,
    defaultColDef: { resizable: true, sortable: true, filter: 'agTextColumnFilter', editable: false, minWidth: 45 },
    rowHeight: 28,
    headerHeight: 28,
    animateRows: false,
    suppressContextMenu: true,
    onRowDoubleClicked: (e) => { if(e.data) showTotalDetail(e.data); },
  });
}

const row = (l,v) => v && v!=='-' ? `<tr><td style="padding:6px 12px 6px 0;color:var(--c-text-muted);width:120px">${l}</td><td style="padding:6px 0;font-weight:500">${v}</td></tr>` : '';
function showTotalDetail(d) {
  const grid = $('#totalGrid');
  const detail = $('#totalDetailView');
  grid.style.display='none'; detail.hidden=false; detail.style.display='block';
  detail.innerHTML = `<div style="max-width:800px;margin:0 auto;padding:24px">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
      <button class="btn" id="totalBack">← 목록</button>
      <span style="font-size:var(--font-size-lg);font-weight:700">🚗 ${d.car_number} ${d.car_model||''}</span>
    </div>
    <div style="background:var(--c-bg);border:1px solid var(--c-border);border-radius:var(--r-md);padding:20px">
      <div style="font-weight:600;margin-bottom:8px">자산</div>
      <table style="width:100%;border-collapse:collapse;font-size:var(--font-size)">
        ${row('차량번호',d.car_number)}${row('모델',d.car_model)}${row('연식',d.car_year)}
        ${row('상태',d.asset_status)}${row('색상',d.ext_color)}${row('연료',d.fuel_type)}
        ${row('취득방법',d.purchase_method)}${row('취득가',d.purchase_price?fmt(d.purchase_price)+'원':'')}
      </table>
      <div style="font-weight:600;margin:16px 0 8px">할부</div>
      <table style="width:100%;border-collapse:collapse;font-size:var(--font-size)">
        ${row('금융사',d.loan_company)}${row('원금',d.loan_principal?fmt(d.loan_principal)+'원':'')}
        ${row('기간',d.loan_months?d.loan_months+'개월':'')}${row('금리',d.loan_rate?d.loan_rate+'%':'')}
        ${row('방식',d.loan_method)}
      </table>
      <div style="font-weight:600;margin:16px 0 8px">계약</div>
      <table style="width:100%;border-collapse:collapse;font-size:var(--font-size)">
        ${row('계약코드',d.contract_code)}${row('계약자',d.contractor_name)}${row('연락처',d.contractor_phone)}
        ${row('시작일',fmtDate(d.start_date))}${row('기간',d.rent_months?d.rent_months+'개월':'')}
        ${row('월대여료',d.rent_amount?fmt(d.rent_amount)+'원':'')}${row('보증금',d.deposit_amount?fmt(d.deposit_amount)+'원':'')}
        ${row('결제일',d.auto_debit_day?'매월 '+d.auto_debit_day+'일':'')}${row('상태',d.contract_status)}
      </table>
      <div style="font-weight:600;margin:16px 0 8px">수납</div>
      <table style="width:100%;border-collapse:collapse;font-size:var(--font-size)">
        ${row('총청구',fmt(d.total_due)+'원')}
        ${row('총납부','<span style="color:var(--c-success)">'+fmt(d.total_paid)+'원</span>')}
        ${row('미수','<span style="color:'+(d.total_unpaid>0?'var(--c-danger)':'var(--c-success)')+'">'+fmt(d.total_unpaid)+'원</span>')}
        ${row('회차수',d.billing_count)}
      </table>
    </div></div>`;
  document.getElementById('totalBack')?.addEventListener('click',()=>{detail.style.display='none';detail.hidden=true;grid.style.display='';});
}

export async function mount() {
  watchAssets((items) => { assets = items; refresh(); });
  watchContracts((items) => { contracts = items; refresh(); });
  watchBillings((items) => { billings = items; refresh(); });
  watchCustomers((items) => { customers = items; refresh(); });
}
