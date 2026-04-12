/**
 * pages/input-operation.js — 운영등록
 *
 * 좌: 유형 목록 (정비/사고/과태료/출고반납)
 * 우: 선택한 유형의 입력 폼 + 등록
 */
import { saveEvent } from '../firebase/events.js';
import { watchAssets } from '../firebase/assets.js';
import { showToast } from '../core/toast.js';

const $ = (s) => document.querySelector(s);

const DEFAULT_TYPES = [
  { key: 'maintenance', label: '정비',     icon: '🔧', sub: '차량 정비/소모품 교환', direction: 'out' },
  { key: 'accident',    label: '사고',     icon: '⚠',  sub: '사고 발생/처리 기록', direction: 'out' },
  { key: 'penalty',     label: '과태료',   icon: '🚫', sub: '교통 과태료/위반', direction: 'out' },
  { key: 'delivery',    label: '출고/반납', icon: '🚗', sub: '차량 인도/회수', direction: 'in' },
];

const ORDER_KEY = 'jpk.op.order';
function loadTypes() {
  try {
    const saved = JSON.parse(localStorage.getItem(ORDER_KEY));
    if (saved?.length) {
      return saved.map(k => DEFAULT_TYPES.find(t => t.key === k)).filter(Boolean);
    }
  } catch {}
  return [...DEFAULT_TYPES];
}
function saveOrder(types) {
  localStorage.setItem(ORDER_KEY, JSON.stringify(types.map(t => t.key)));
}
let TYPES = loadTypes();

let assets = [];
let currentType = null;

function renderList() {
  const host = $('#opList');
  host.innerHTML = TYPES.map(t => `
    <div class="op-type${currentType === t.key ? ' is-active' : ''}" data-type="${t.key}" draggable="true">
      <span class="op-type__icon">${t.icon}</span>
      <span class="op-type__label">${t.label}</span>
      <span class="op-type__sub">${t.sub}</span>
      <span class="op-type__handle">⠿</span>
    </div>
  `).join('');

  // 클릭
  host.querySelectorAll('.op-type').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('[draggable]') && e.detail === 0) return;
      currentType = el.dataset.type;
      renderList();
      renderForm();
    });
  });

  // 드래그 정렬
  let dragEl = null;
  host.querySelectorAll('.op-type').forEach(el => {
    el.addEventListener('dragstart', (e) => {
      dragEl = el;
      el.style.opacity = '0.4';
      e.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragend', () => {
      el.style.opacity = '';
      dragEl = null;
    });
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      el.style.borderTop = '2px solid var(--c-primary)';
    });
    el.addEventListener('dragleave', () => {
      el.style.borderTop = '';
    });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.style.borderTop = '';
      if (!dragEl || dragEl === el) return;
      const fromKey = dragEl.dataset.type;
      const toKey = el.dataset.type;
      const fromIdx = TYPES.findIndex(t => t.key === fromKey);
      const toIdx = TYPES.findIndex(t => t.key === toKey);
      if (fromIdx < 0 || toIdx < 0) return;
      const [moved] = TYPES.splice(fromIdx, 1);
      TYPES.splice(toIdx, 0, moved);
      saveOrder(TYPES);
      renderList();
    });
  });
}

function renderForm() {
  const t = TYPES.find(x => x.key === currentType);
  if (!t) return;
  const today = new Date().toISOString().slice(0, 10);
  $('#opFormTitle').textContent = `${t.icon} ${t.label} 입력`;

  const host = $('#opFormHost');
  host.innerHTML = `
    <div class="form-section">
      <div class="form-section-title">${t.label} 정보</div>
      <div class="form-grid">
        <div class="field is-required"><label>일자</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"><label>차량번호</label><input type="text" name="car_number" placeholder="02무0357" list="opCarList" autocomplete="off"><datalist id="opCarList">${assets.map(a => `<option value="${a.car_number || ''}">${a.car_model || ''}</option>`).join('')}</datalist></div>
        <div class="field is-required"><label>제목</label><input type="text" name="title" placeholder="예: 엔진오일 교환"></div>
        <div class="field"><label>금액</label><input type="text" name="amount" inputmode="numeric" placeholder="0"></div>
        <div class="field"><label>업체/장소</label><input type="text" name="vendor"></div>
        <div class="field" style="grid-column:1/-1"><label>메모</label><textarea name="note" rows="2"></textarea></div>
      </div>
    </div>
  `;

  const amtInput = host.querySelector('[name="amount"]');
  amtInput?.addEventListener('input', () => {
    const d = amtInput.value.replace(/[^\d]/g, '');
    amtInput.value = d ? Number(d).toLocaleString() : '';
  });

  host.querySelector('[name="car_number"]')?.focus();
}

function resetForm() {
  if (!currentType) return;
  renderForm();
}

async function submitForm() {
  if (!currentType) { showToast('유형을 선택하세요', 'error'); return; }
  const t = TYPES.find(x => x.key === currentType);
  const host = $('#opFormHost');
  const data = {};
  host.querySelectorAll('[name]').forEach(el => { data[el.name] = el.value.trim(); });

  if (!data.date || !data.car_number || !data.title) {
    showToast('일자, 차량번호, 제목은 필수입니다', 'error');
    return;
  }

  const a = assets.find(x => x.car_number === data.car_number);
  try {
    await saveEvent({
      type: currentType,
      direction: t.direction,
      date: data.date,
      car_number: data.car_number,
      vin: a?.vin || '',
      title: data.title,
      vendor: data.vendor || '',
      amount: Number(String(data.amount || '').replace(/,/g, '')) || 0,
      note: data.note || '',
    });
    showToast('등록 완료', 'success');
    renderForm();
  } catch (err) { showToast(err.message, 'error'); }
}

export async function mount() {
  watchAssets((items) => { assets = items; });
  renderList();
  $('#opReset')?.addEventListener('click', resetForm);
  $('#opSubmit')?.addEventListener('click', submitForm);
}
