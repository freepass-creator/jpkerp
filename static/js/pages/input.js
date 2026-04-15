/**
 * pages/input.js — 직접입력
 *
 * 좌: 유형 선택
 * 우: 선택한 유형의 폼 + 데이터반영 → confirmReflect 팝업 → 저장
 */
import { showToast } from '../core/toast.js';
import { confirmReflect } from '../core/confirm-reflect.js';
import { ASSET_SCHEMA, ASSET_SECTIONS } from '../data/schemas/asset.js';
import { CONTRACT_SCHEMA, CONTRACT_SECTIONS } from '../data/schemas/contract.js';
import { CUSTOMER_SCHEMA, CUSTOMER_SECTIONS } from '../data/schemas/customer.js';
import { MEMBER_SCHEMA, MEMBER_SECTIONS } from '../data/schemas/member.js';
import { VENDOR_SCHEMA, VENDOR_SECTIONS } from '../data/schemas/vendor.js';
import { INSURANCE_SCHEMA, INSURANCE_SECTIONS } from '../data/schemas/insurance.js';
import { PRODUCT_SCHEMA, PRODUCT_SECTIONS } from '../data/schemas/product.js';
import { LOAN_SCHEMA, LOAN_SECTIONS } from '../data/schemas/loan.js';
import { AUTODEBIT_SCHEMA, AUTODEBIT_SECTIONS } from '../data/schemas/autodebit.js';
import { FINANCE_SCHEMA, FINANCE_SECTIONS } from '../data/schemas/finance.js';
import { saveAsset, watchAssets } from '../firebase/assets.js';
import { saveContract, watchContracts } from '../firebase/contracts.js';
import { saveCustomer, watchCustomers } from '../firebase/customers.js';
import { saveMember } from '../firebase/members.js';
import { saveVendor } from '../firebase/vendors.js';
import { saveEvent } from '../firebase/events.js';
import { normalizeAsset } from '../data/asset-normalize.js';
import { ref, set, push } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js';
import { db } from '../firebase/config.js';

const $ = s => document.querySelector(s);

// 입력 유형 아이콘 — Phosphor + 카테고리 색상
// 🟢 마스터 (녹색) | 🔵 계약/고객 (파랑) | 🟣 금융 (보라) | 🟠 기타 (주황)
const TYPES = [
  { key: 'asset',     label: '자산등록',    icon: 'ph-car',            color: '#10b981', desc: '차량 신규 등록',      schema: ASSET_SCHEMA,    sections: ASSET_SECTIONS,    save: saveAsset,    transform: normalizeAsset },
  { key: 'contract',  label: '계약등록',    icon: 'ph-clipboard-text', color: '#3b82f6', desc: '임대차계약 체결',    schema: CONTRACT_SCHEMA, sections: CONTRACT_SECTIONS, save: saveContract, autoMatch: true },
  { key: 'customer',  label: '고객등록',    icon: 'ph-users',          color: '#2563eb', desc: '고객/임차인 정보',   schema: CUSTOMER_SCHEMA, sections: CUSTOMER_SECTIONS, save: saveCustomer },
  { key: 'member',    label: '회원사등록',  icon: 'ph-buildings',      color: '#059669', desc: '회원사 계약',         schema: MEMBER_SCHEMA,   sections: MEMBER_SECTIONS,   save: saveMember },
  { key: 'vendor',    label: '거래처등록',  icon: 'ph-briefcase',      color: '#14b8a6', desc: '정비·탁송·보험사 등', schema: VENDOR_SCHEMA,   sections: VENDOR_SECTIONS,   save: saveVendor },
  { key: 'insurance', label: '보험등록',    icon: 'ph-shield-check',   color: '#0ea5e9', desc: '차량 보험계약',       schema: INSURANCE_SCHEMA, sections: INSURANCE_SECTIONS, save: (d) => genericSave('insurances', d) },
  { key: 'loan',      label: '할부등록',    icon: 'ph-credit-card',    color: '#8b5cf6', desc: '자산 할부 정보',      schema: LOAN_SCHEMA,      sections: LOAN_SECTIONS,     save: (d) => genericSave('loans', d) },
  { key: 'product',   label: '상품등록',    icon: 'ph-ticket',         color: '#ec4899', desc: '렌트 상품 정의',      schema: PRODUCT_SCHEMA,   sections: PRODUCT_SECTIONS,  save: (d) => genericSave('products', d) },
  { key: 'autodebit', label: '자동이체등록', icon: 'ph-arrows-clockwise', color: '#7c3aed', desc: '월 자동이체 설정',     schema: AUTODEBIT_SCHEMA, sections: AUTODEBIT_SECTIONS, save: (d) => genericSave('autodebits', d) },
  { key: 'finance',   label: '재무원장',    icon: 'ph-chart-bar',      color: '#9333ea', desc: '매출/비용 수동 입력', schema: FINANCE_SCHEMA,   sections: FINANCE_SECTIONS,  save: (d) => genericSave('finances', d) },
  { key: 'task',      label: '업무생성',    icon: 'ph-note-pencil',    color: '#f59e0b', desc: '일반 업무/메모',      schema: TASK_SCHEMA(),    sections: null,              save: saveTaskEvent },
  { key: 'fund',      label: '입출금등록',  icon: 'ph-currency-krw',   color: '#f97316', desc: '통장/카드 내역',      schema: FUND_SCHEMA(),    sections: null,              save: saveFundEvent },
];

async function genericSave(collection, data) {
  const r = push(ref(db, collection));
  const now = Date.now();
  await set(r, { ...data, id: r.key, created_at: now, updated_at: now, status: 'active' });
  return { ...data, id: r.key };
}

// 계약 자동 매칭용
let _assets = [];
let _customers = [];
let _contracts = [];

let currentType = null;

export async function mount() {
  renderTypeList();
  bindButtons();
  // 자동 매칭용 데이터 구독
  watchAssets(items => { _assets = items; });
  watchCustomers(items => { _customers = items; });
  watchContracts(items => { _contracts = items; });
}

// ── 좌측 유형 리스트 ────────────────────────────────────
function renderTypeList() {
  const host = $('#inputTypeList');
  if (!host) return;
  host.innerHTML = TYPES.map(t => `
    <div class="op-type${currentType?.key === t.key ? ' is-active' : ''}" data-key="${t.key}">
      <span class="op-type__icon"><i class="ph ${t.icon}" style="color:${t.color};font-size:18px"></i></span>
      <span class="op-type__label">${t.label}</span>
      <span class="op-type__handle" style="margin-left:auto">⠿</span>
    </div>
  `).join('');

  host.querySelectorAll('.op-type').forEach(el => {
    el.addEventListener('click', () => selectType(el.dataset.key));
  });

  if (window.Sortable && !host._sortable) {
    host._sortable = Sortable.create(host, {
      animation: 200,
      handle: '.op-type__handle',
      ghostClass: 'op-type--ghost',
      chosenClass: 'op-type--chosen',
      onEnd: () => {
        const order = [...host.querySelectorAll('.op-type')].map(el => el.dataset.key);
        const newTypes = order.map(k => TYPES.find(t => t.key === k)).filter(Boolean);
        TYPES.length = 0;
        TYPES.push(...newTypes);
        try { localStorage.setItem('jpk.input.order', JSON.stringify(TYPES.map(t => t.key))); } catch {}
      },
    });
  }
}

function highlightType(key) {
  document.querySelectorAll('.op-type').forEach(el => {
    el.classList.toggle('is-active', el.dataset.key === key);
  });
}

// ── 유형 선택 → 폼 렌더 ─────────────────────────────────
function selectType(key) {
  const type = TYPES.find(t => t.key === key);
  if (!type) return;
  currentType = type;
  highlightType(key);
  $('#inputFormTitle').innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px"><i class="ph ${type.icon}" style="color:${type.color};font-size:18px"></i><span>${type.label}</span></span>`;
  $('#inputFormSubtitle').textContent = type.desc || '';
  $('#inputFormActions').hidden = false;
  renderForm(type);
}

function renderForm(type) {
  const host = $('#inputFormHost');
  const sections = type.sections || ['기본'];

  host.innerHTML = sections.map(sec => {
    const fields = type.schema.filter(f => (f.section || '기본') === sec);
    if (!fields.length) return '';
    return `<div class="form-section">
      <div class="form-section-title">${sec}</div>
      <div class="form-grid">${fields.map(f => fieldHtml(f)).join('')}</div>
    </div>`;
  }).join('');

  // ── 자동 매칭 훅 (계약등록 등) ──
  if (type.autoMatch) setupContractAutoMatch(host);
}

/** 계약등록 자동 매칭 — 차량번호, 계약자 자동완성 + 종료일 계산 */
function setupContractAutoMatch(host) {
  const carInput = host.querySelector('[name="car_number"]');
  const regNoInput = host.querySelector('[name="contractor_reg_no"]');
  const startInput = host.querySelector('[name="start_date"]');
  const monthsInput = host.querySelector('[name="rent_months"]');
  const endInput = host.querySelector('[name="end_date"]');

  // 안내 배지 추가 영역
  const infoHost = document.createElement('div');
  infoHost.id = 'contractMatchInfo';
  infoHost.style.cssText = 'padding:10px 12px;background:var(--c-bg-sub);border-radius:var(--r-sm);font-size:var(--font-size-sm);color:var(--c-text-muted);margin-bottom:12px';
  infoHost.textContent = '차량번호·계약자 입력 시 자동으로 관련 정보가 채워집니다.';
  host.insertBefore(infoHost, host.firstChild);

  // 차량번호 자동완성 datalist
  if (carInput) {
    const dl = document.createElement('datalist');
    dl.id = 'contractCarList';
    dl.innerHTML = _assets.map(a => `<option value="${a.car_number || ''}">${a.manufacturer || ''} ${a.car_model || ''}</option>`).join('');
    carInput.setAttribute('list', 'contractCarList');
    host.appendChild(dl);

    carInput.addEventListener('input', () => {
      const car = carInput.value.trim();
      const asset = _assets.find(a => a.car_number === car);
      if (asset) {
        fillIfEmpty(host, 'vin', asset.vin);
        fillIfEmpty(host, 'car_model', `${asset.manufacturer || ''} ${asset.car_model || ''}`.trim());
        fillIfEmpty(host, 'partner_code', asset.partner_code);
        infoHost.innerHTML = `✅ <b>${car}</b> · ${asset.manufacturer || ''} ${asset.car_model || ''} ${asset.car_year || ''}년 (자산등록됨)`;
        infoHost.style.color = 'var(--c-success)';
      } else if (car) {
        infoHost.innerHTML = `⚠ <b>${car}</b> 자산 미등록 — 먼저 자산등록 필요`;
        infoHost.style.color = 'var(--c-warn)';
      }
    });
  }

  // 계약자 등록번호 자동완성
  if (regNoInput) {
    regNoInput.addEventListener('blur', () => {
      const regNo = regNoInput.value.trim();
      if (!regNo) return;
      const cust = _customers.find(c => c.customer_reg_no === regNo);
      if (cust) {
        fillIfEmpty(host, 'contractor_name', cust.code_name);
        fillIfEmpty(host, 'contractor_phone', cust.phone);
        fillIfEmpty(host, 'contractor_address', cust.address);
        showToast(`기존 고객: ${cust.code_name}`, 'success');
      }
    });
  }

  // 시작일 + 기간 → 종료일 자동 계산
  function recalcEnd() {
    if (!startInput || !monthsInput || !endInput) return;
    const start = startInput.value;
    const months = Number(monthsInput.value) || 0;
    if (!start || !months) return;
    const d = new Date(start);
    if (isNaN(d)) return;
    d.setMonth(d.getMonth() + months);
    d.setDate(d.getDate() - 1);
    endInput.value = d.toISOString().slice(0, 10);
  }
  startInput?.addEventListener('change', recalcEnd);
  monthsInput?.addEventListener('input', recalcEnd);
}

function fillIfEmpty(host, name, value) {
  if (!value) return;
  const el = host.querySelector(`[name="${name}"]`);
  if (el && !el.value) el.value = value;
}

function fieldHtml(s) {
  const req = s.required ? ' is-required' : '';
  if (s.readonly) {
    return `<div class="field"><label>${s.label}</label><input type="text" name="${s.col}" readonly placeholder="자동부여" style="background:#f3f4f6;color:#9ca3af"></div>`;
  }
  if (s.type === 'select' && s.options) {
    const opts = ['<option value="">선택</option>']
      .concat(s.options.map(o => `<option value="${o}">${o}</option>`)).join('');
    return `<div class="field${req}"><label>${s.label}</label><select name="${s.col}">${opts}</select></div>`;
  }
  if (s.type === 'textarea') {
    return `<div class="field${req}" style="grid-column:1/-1"><label>${s.label}</label><textarea name="${s.col}" rows="2"></textarea></div>`;
  }
  const type = s.type === 'date' ? 'date' : 'text';
  const inputmode = (s.num || s.type === 'number') ? ' inputmode="numeric"' : '';
  return `<div class="field${req}"><label>${s.label}</label><input type="${type}" name="${s.col}"${inputmode}></div>`;
}

function readForm() {
  const host = $('#inputFormHost');
  const data = {};
  host.querySelectorAll('[name]').forEach(el => { data[el.name] = el.value.trim(); });
  return data;
}

function resetForm() {
  const host = $('#inputFormHost');
  host.querySelectorAll('[name]').forEach(el => { el.value = ''; });
  host.querySelector('[name]')?.focus();
}

// ── 데이터 반영 ─────────────────────────────────────────
async function submitForm() {
  if (!currentType) return;
  let data = readForm();

  // 필수 검증
  const missing = currentType.schema.filter(s => s.required && !data[s.col]);
  if (missing.length) {
    showToast('필수: ' + missing.map(s => s.label).join(', '), 'error');
    return;
  }

  // 정규화 (자산만 transform 있음)
  if (currentType.transform) {
    const result = await currentType.transform(data);
    data = result?.data || data;
  }

  // 날짜/숫자 정규화
  currentType.schema.forEach(s => {
    if (data[s.col]) {
      if (s.type === 'date') data[s.col] = normalizeDate(data[s.col]);
      if (s.num || s.type === 'number') data[s.col] = String(data[s.col]).replace(/,/g, '').trim();
    }
  });

  // 재확인 팝업 — 입력 내용 전체 미리보기
  const previewRow = {};
  currentType.schema.forEach(s => {
    if (data[s.col] !== undefined && data[s.col] !== '') {
      previewRow[s.label] = data[s.col];
    }
  });

  const ok = await confirmReflect({
    title: `${currentType.label}`,
    message: `아래 내용으로 <strong>1건</strong>을 등록합니다.`,
    summary: { '정상': 1 },
    preview: Object.entries(previewRow).map(([label, value]) => ({ 항목: label, 값: value })),
    previewCols: ['항목', '값'],
    count: 1,
  });
  if (!ok) return;

  // 저장
  try {
    await currentType.save(data);
    showToast(`${currentType.label} 완료`, 'success');
    resetForm();
  } catch (e) {
    showToast(e.message || '저장 실패', 'error');
  }
}

// ── 버튼 바인딩 ──────────────────────────────────────────
function bindButtons() {
  $('#inputFormReset')?.addEventListener('click', resetForm);
  $('#inputFormSave')?.addEventListener('click', submitForm);
}

// ── 날짜 정규화 ─────────────────────────────────────────
function normalizeDate(s) {
  if (!s) return '';
  let v = String(s).trim().replace(/년|월/g, '-').replace(/일/g, '').replace(/[./]/g, '-').replace(/\s+/g, '');
  if (/^\d{8}$/.test(v)) v = `${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6)}`;
  if (/^\d{6}$/.test(v)) { const y = Number(v.slice(0,2)); v = `${y<50?2000+y:1900+y}-${v.slice(2,4)}-${v.slice(4)}`; }
  const m2 = v.match(/^(\d{2})-(\d{1,2})-(\d{1,2})$/);
  if (m2) { const y = Number(m2[1]); v = `${y<50?2000+y:1900+y}-${String(m2[2]).padStart(2,'0')}-${String(m2[3]).padStart(2,'0')}`; }
  const m4 = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m4) v = `${m4[1]}-${String(m4[2]).padStart(2,'0')}-${String(m4[3]).padStart(2,'0')}`;
  return v;
}

// ── 업무 / 입출금 간이 스키마 ────────────────────────────
function TASK_SCHEMA() {
  return [
    { col: 'date',       label: '일자',     type: 'date', required: true },
    { col: 'title',      label: '제목',     required: true },
    { col: 'car_number', label: '차량번호' },
    { col: 'assignee',   label: '담당자' },
    { col: 'note',       label: '내용',     type: 'textarea' },
  ];
}

async function saveTaskEvent(data) {
  return saveEvent({ ...data, event_type: 'task' });
}

function FUND_SCHEMA() {
  return [
    { col: 'date',         label: '일자',     type: 'date', required: true },
    { col: 'direction',    label: '구분',     type: 'select', options: ['입금','출금'], required: true },
    { col: 'amount',       label: '금액',     type: 'number', num: true, required: true },
    { col: 'counterparty', label: '거래처/내용', required: true },
    { col: 'account',      label: '계좌' },
    { col: 'category',     label: '분류',     type: 'select', options: ['대여료','할부금','보험료','정비비','유류비','과태료','탁송비','기타'] },
    { col: 'memo',         label: '메모',     type: 'textarea' },
  ];
}

async function saveFundEvent(data) {
  return saveEvent({
    ...data,
    amount: Number(data.amount || 0),
    direction: data.direction === '입금' ? 'in' : 'out',
    event_type: 'fund',
  });
}
