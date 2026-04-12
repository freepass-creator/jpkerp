/**
 * pages/input-operation.js — 운영등록 (정비/사고/과태료/출고반납)
 */
import { saveEvent } from '../firebase/events.js';
import { watchAssets } from '../firebase/assets.js';
import { showToast } from '../core/toast.js';

const $ = (s) => document.querySelector(s);
const fmt = (v) => Number(v || 0).toLocaleString('ko-KR');

const TYPES = [
  { key: 'maintenance', label: '정비', icon: '🔧', sub: '차량 정비/소모품 교환', direction: 'out' },
  { key: 'accident',    label: '사고', icon: '⚠',  sub: '사고 발생/처리 기록', direction: 'out' },
  { key: 'penalty',     label: '과태료', icon: '🚫', sub: '교통 과태료/위반', direction: 'out' },
  { key: 'delivery',    label: '출고/반납', icon: '🚗', sub: '차량 인도/회수', direction: 'in' },
];

let assets = [];
let currentType = null;

function renderCards() {
  $('#opCards').innerHTML = TYPES.map(t => `
    <div class="dash-card" style="cursor:pointer;text-align:center" data-type="${t.key}">
      <div style="font-size:28px;margin-bottom:6px">${t.icon}</div>
      <div style="font-weight:600">${t.label}</div>
      <div style="font-size:10px;color:var(--c-text-muted)">${t.sub}</div>
    </div>
  `).join('');

  $('#opCards').querySelectorAll('.dash-card').forEach(card => {
    card.addEventListener('click', () => openForm(card.dataset.type));
  });
}

function openForm(type) {
  currentType = type;
  const t = TYPES.find(x => x.key === type);
  const today = new Date().toISOString().slice(0, 10);
  const form = $('#opForm');
  form.hidden = false;
  form.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
      <span style="font-size:24px">${t.icon}</span>
      <span style="font-size:14px;font-weight:600">${t.label} 입력</span>
      <button class="btn" id="opCancel" style="margin-left:auto">취소</button>
    </div>
    <form id="opSubmitForm" style="display:flex;flex-direction:column;gap:10px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="field"><label>일자</label><input type="date" name="date" value="${today}" required></div>
        <div class="field"><label>차량번호</label><input type="text" name="car_number" placeholder="02무0357" list="opCarList" autocomplete="off"><datalist id="opCarList">${assets.map(a => `<option value="${a.car_number || ''}">${a.car_model || ''}</option>`).join('')}</datalist></div>
      </div>
      <div class="field"><label>제목</label><input type="text" name="title" placeholder="예: 엔진오일 교환" required></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="field"><label>금액</label><input type="text" name="amount" inputmode="numeric" placeholder="0"></div>
        <div class="field"><label>업체/장소</label><input type="text" name="vendor"></div>
      </div>
      <div class="field"><label>메모</label><textarea name="note" rows="2"></textarea></div>
      <button type="submit" class="btn btn-primary" style="align-self:flex-end">저장</button>
    </form>
  `;

  const amtInput = form.querySelector('[name="amount"]');
  amtInput?.addEventListener('input', () => {
    const d = amtInput.value.replace(/[^\d]/g, '');
    amtInput.value = d ? Number(d).toLocaleString() : '';
  });

  document.getElementById('opCancel').addEventListener('click', () => {
    form.hidden = true;
    currentType = null;
  });

  document.getElementById('opSubmitForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
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
      showToast('저장 완료', 'success');
      form.hidden = true;
      currentType = null;
    } catch (err) { showToast(err.message, 'error'); }
  });
}

export async function mount() {
  watchAssets((items) => { assets = items; });
  renderCards();
}
