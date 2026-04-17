/**
 * pages/dev.js — 시스템 개발도구
 *
 * 좌: 기능 선택 카드
 * 우: 선택한 기능의 내용
 */
import { ref, get, update } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js';
import { db } from '../firebase/config.js';
import { showToast } from '../core/toast.js';

const $ = s => document.querySelector(s);

const COLLECTIONS = [
  { key: 'assets',    label: '자산',     icon: '🚗' },
  { key: 'contracts', label: '계약',     icon: '📋' },
  { key: 'customers', label: '고객',     icon: '👥' },
  { key: 'members',   label: '회원사',   icon: '🏢' },
  { key: 'vendors',   label: '거래처',   icon: '🤝' },
  { key: 'events',    label: '운영이력', icon: '📊' },
  { key: 'billings',  label: '수납',     icon: '💰' },
  { key: 'uploads',   label: '업로드이력', icon: '📤' },
];

const DEV_MENUS = [
  { key: 'data',     label: '데이터관리', ph: 'ph-database' },
  { key: 'overdue',  label: '개별 미수',  ph: 'ph-magnifying-glass' },
  { key: 'cutover',  label: '미수 정산',  ph: 'ph-currency-krw' },
  { key: 'alimtalk', label: '알림톡',     ph: 'ph-chat-text' },
  { key: 'sms',      label: 'SMS',        ph: 'ph-envelope' },
  { key: 'carmaster', label: '차종 등록', ph: 'ph-car' },
];

let _devCurrentTab = '';

const URL_TAB_MAP = {
  '/dev': 'data',
  '/dev/car-master': 'carmaster',
  '/dev/overdue': 'overdue',
  '/dev/cutover': 'cutover',
  '/dev/alimtalk': 'alimtalk',
  '/dev/sms': 'sms',
};

export async function mount() {
  _devCurrentTab = URL_TAB_MAP[window.location.pathname] || 'data';
  renderDevList();
  renderDevContent();
}

// ── 좌측 기능 카드 ──
function renderDevList() {
  const list = $('#devList');
  if (!list) return;
  list.innerHTML = DEV_MENUS.map(m => `
    <div class="op-type${_devCurrentTab === m.key ? ' is-active' : ''}" data-dev-menu="${m.key}">
      <span class="op-type__icon"><i class="ph ${m.ph}" style="font-size:18px"></i></span>
      <span class="op-type__label">${m.label}</span>
    </div>
  `).join('');

  list.querySelectorAll('[data-dev-menu]').forEach(el => {
    el.addEventListener('click', () => {
      _devCurrentTab = el.dataset.devMenu;
      renderDevList();
      renderDevContent();
    });
  });
}

function renderDevContent() {
  const title = $('#devContentTitle');
  const sub = $('#devContentSub');
  const menu = DEV_MENUS.find(m => m.key === _devCurrentTab);
  if (title) title.textContent = menu?.label || '기능을 선택하세요';
  if (sub) sub.textContent = menu?.sub || '';

  const renderers = { data: renderDataTab, overdue: renderOverdueTab, cutover: renderCutoverTab, alimtalk: renderAlimtalkTab, sms: renderSmsTab, carmaster: renderCarMasterTab };
  const fn = renderers[_devCurrentTab];
  if (fn) fn();
  else $('#devHost').innerHTML = '<div style="padding:24px;text-align:center;color:var(--c-text-muted)">좌측에서 기능을 선택하세요.</div>';
}

// ─── 공통 유틸 ───
async function refreshCount(col) {
  const el = $(`#dev_count_${col}`);
  if (!el) return;
  try {
    const snap = await get(ref(db, col));
    if (!snap.exists()) { el.textContent = '0건'; return; }
    const all = Object.values(snap.val());
    const active = all.filter(v => v && v.status !== 'deleted');
    const deleted = all.length - active.length;
    el.textContent = `${active.length}건${deleted ? ` (삭제포함 ${all.length})` : ''}`;
  } catch { el.textContent = '조회 실패'; }
}

const fmtKR = v => Number(v || 0).toLocaleString('ko-KR');

// ─── 1. 데이터관리 ───
async function renderDataTab() {
  const host = $('#devHost');
  host.innerHTML = `
    <div style="display:flex;gap:20px;height:100%">
      <div style="flex:1">
        <div style="padding:8px 0;color:var(--c-danger);font-weight:600;font-size:var(--font-size-sm);margin-bottom:8px">
          ⚠ 삭제는 복구 불가합니다.
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px">
          ${COLLECTIONS.map(c => `
            <div class="dash-card" style="display:flex;align-items:center;gap:10px;padding:10px" data-col="${c.key}">
              <span style="font-size:20px">${c.icon}</span>
              <div style="flex:1;min-width:0">
                <div style="font-weight:600">${c.label}</div>
                <div style="font-size:var(--font-size-xs);color:var(--c-text-muted)" id="dev_count_${c.key}">조회 중...</div>
              </div>
              <button class="btn" data-action="count" data-col="${c.key}" style="font-size:var(--font-size-xs)">새로고침</button>
              <button class="btn" data-action="delete-all" data-col="${c.key}" style="font-size:var(--font-size-xs);color:var(--c-danger)">삭제</button>
            </div>
          `).join('')}
        </div>
      </div>
      <div style="flex:0 0 320px;display:flex;flex-direction:column;gap:12px">
        <div>
          <div style="font-weight:600;margin-bottom:6px">업로드 단위 삭제</div>
          <div style="font-size:var(--font-size-sm);color:var(--c-text-muted);margin-bottom:6px">upload_id 기준 데이터 삭제</div>
          <div style="display:flex;gap:6px">
            <input type="text" id="devUploadId" class="ctrl" placeholder="upload_id" style="flex:1">
            <button class="btn" id="devDeleteByUpload" style="color:var(--c-danger)">삭제</button>
          </div>
        </div>
      </div>
    </div>`;

  for (const c of COLLECTIONS) await refreshCount(c.key);

  // 이벤트
  host.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const col = btn.dataset.col;
    if (action === 'count') await refreshCount(col);
    if (action === 'delete-all') {
      const info = COLLECTIONS.find(c => c.key === col);
      const countEl = $(`#dev_count_${col}`);
      const count = countEl?.textContent?.match(/(\d+)/)?.[1] || '?';
      if (!confirm(`⚠ "${info.label}" 컬렉션의 ${count}건을 전체 삭제합니다.\n\n정말 삭제하시겠습니까?`)) return;
      if (!confirm(`마지막 확인: "${info.label}" 전체 삭제 진행합니다.`)) return;
      try {
        btn.disabled = true; btn.textContent = '삭제 중...';
        const snap = await get(ref(db, col));
        if (!snap.exists()) { showToast('데이터 없음', 'info'); return; }
        const updates = {};
        Object.keys(snap.val()).forEach(k => { updates[`${col}/${k}/status`] = 'deleted'; updates[`${col}/${k}/deleted_at`] = Date.now(); });
        await update(ref(db), updates);
        showToast(`${info.label} 전체 삭제 완료`, 'success');
        await refreshCount(col);
      } catch (err) { showToast(err.message, 'error'); }
      finally { btn.disabled = false; btn.textContent = '전체 삭제'; }
    }
  });

  $('#devDeleteByUpload')?.addEventListener('click', async () => {
    const uploadId = $('#devUploadId')?.value?.trim();
    if (!uploadId) { showToast('upload_id를 입력하세요', 'info'); return; }
    try {
      const eventsSnap = await get(ref(db, 'events'));
      const assetsSnap = await get(ref(db, 'assets'));
      const updates = {};
      let count = 0;
      if (eventsSnap.exists()) Object.entries(eventsSnap.val()).forEach(([k, v]) => { if (v.note?.includes(uploadId) || v.upload_id === uploadId) { updates[`events/${k}/status`] = 'deleted'; updates[`events/${k}/deleted_at`] = Date.now(); count++; } });
      if (assetsSnap.exists()) Object.entries(assetsSnap.val()).forEach(([k, v]) => { if (v.upload_id === uploadId) { updates[`assets/${k}/status`] = 'deleted'; updates[`assets/${k}/deleted_at`] = Date.now(); count++; } });
      if (!count) { showToast('해당 업로드로 생성된 데이터 없음', 'info'); return; }
      if (!confirm(`${count}건 삭제합니다. 진행?`)) return;
      await update(ref(db), updates);
      showToast(`${count}건 삭제 완료`, 'success');
      for (const c of COLLECTIONS) await refreshCount(c.key);
    } catch (err) { showToast(err.message, 'error'); }
  });
}

// ─── 2. 개별 미수 등록 ───
async function renderOverdueTab() {
  const host = $('#devHost');
  let selectedCar = '';

  // 계약 목록 로드 → datalist
  const cSnap = await get(ref(db, 'contracts'));
  const allContracts = cSnap.exists() ? Object.values(cSnap.val()).filter(c => c && c.status !== 'deleted' && c.contract_status !== '계약해지') : [];
  const carOpts = allContracts.map(c => {
    const info = [c.partner_code, c.car_model, c.contractor_name].filter(Boolean).join(' ');
    return `<option value="${c.car_number || ''}">${info}</option>`;
  }).join('');

  host.innerHTML = `
    <div style="display:flex;gap:20px;height:100%">
      <div style="flex:1;display:flex;flex-direction:column;gap:8px">
        <div style="font-size:var(--font-size-sm);color:var(--c-text-muted)">차량번호 선택 → 미수금액 입력</div>
        <div style="display:flex;gap:6px">
          <input type="text" id="overdueSearch" class="ctrl" list="overdueCarList" placeholder="차량번호 / 고객명" style="flex:1" autocomplete="off">
          <datalist id="overdueCarList">${carOpts}</datalist>
          <button class="btn" id="overdueSearchBtn">검색</button>
        </div>
        <div id="overdueSearchResult" style="flex:1;overflow-y:auto"></div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;gap:8px">
        <div id="overdueInputArea" style="display:none">
          <div style="font-weight:600;margin-bottom:6px">미수금액 입력</div>
          <div style="display:flex;gap:6px;align-items:center">
            <input type="text" id="overdueAmount" class="ctrl" placeholder="미수금액" inputmode="numeric" style="flex:1">
            <button class="btn btn-primary" id="overdueApplyBtn">미수 등록</button>
          </div>
        </div>
        <pre id="overdueApplyResult" style="flex:1;background:var(--c-bg-sub);padding:12px;font-size:var(--font-size-xs);overflow:auto;margin:0;white-space:pre-wrap;border-radius:var(--r-md);display:none"></pre>
      </div>
    </div>`;

  const searchInput = $('#overdueSearch');
  const doSearch = async () => {
    const q = searchInput?.value?.trim();
    if (!q) return;
    const resultEl = $('#overdueSearchResult');
    const inputArea = $('#overdueInputArea');
    selectedCar = '';

    const contract = allContracts.find(c => c.car_number === q);
    if (!contract) {
      const matched = allContracts.filter(c => (c.car_number || '').includes(q) || (c.contractor_name || '').includes(q));
      if (!matched.length) { resultEl.innerHTML = '<span style="color:var(--c-danger)">검색 결과 없음</span>'; inputArea.style.display = 'none'; return; }
      resultEl.innerHTML = matched.map(c => `
        <div class="dash-card" style="padding:8px;margin-bottom:4px;cursor:pointer" data-car="${c.car_number}">
          <strong>${c.car_number}</strong> <span style="font-size:var(--font-size-sm);color:var(--c-text-sub)">${c.contractor_name || ''} · ${c.partner_code || ''}</span>
        </div>`).join('');
      resultEl.querySelectorAll('[data-car]').forEach(el => { el.addEventListener('click', () => { searchInput.value = el.dataset.car; doSearch(); }); });
      inputArea.style.display = 'none';
      return;
    }

    selectedCar = contract.car_number;
    const bSnap = await get(ref(db, 'billings'));
    const allBills = bSnap.exists() ? Object.entries(bSnap.val()).filter(([_, b]) => b && b.status !== 'deleted').map(([id, b]) => ({ id, ...b })) : [];
    const carBills = allBills.filter(b => b.car_number === selectedCar);
    const today = new Date().toISOString().slice(0, 10);
    const pastBills = carBills.filter(b => !b.due_date || b.due_date <= today);
    const unpaidBills = pastBills.filter(b => b.status === '미수' || b.status === '부분입금');
    const unpaidAmt = unpaidBills.reduce((s, b) => s + ((Number(b.amount) || 0) - (Number(b.paid_total) || 0)), 0);
    const futureCnt = carBills.filter(b => b.due_date && b.due_date > today).length;
    const monthlyAmt = carBills.length ? Number(carBills[0].amount || 0) : 0;

    resultEl.innerHTML = `
      <div class="dash-card" style="padding:12px;border:2px solid var(--c-primary)">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px">
          <strong style="font-size:var(--font-size-md)">${contract.car_number}</strong>
          <span style="font-weight:600;color:${unpaidAmt > 0 ? 'var(--c-danger)' : 'var(--c-success)'}">${unpaidAmt > 0 ? `현재 미수 ${fmtKR(unpaidAmt)}원` : '완납'}</span>
        </div>
        <table style="width:100%;font-size:var(--font-size-sm);border-collapse:collapse">
          <tr><td style="color:var(--c-text-muted);padding:2px 8px 2px 0">계약자</td><td><b>${contract.contractor_name || '—'}</b></td>
              <td style="color:var(--c-text-muted);padding:2px 8px 2px 16px">등록번호</td><td>${contract.contractor_reg_no || '—'}</td></tr>
          <tr><td style="color:var(--c-text-muted);padding:2px 8px 2px 0">회사코드</td><td>${contract.partner_code || '—'}</td>
              <td style="color:var(--c-text-muted);padding:2px 8px 2px 16px">계약기간</td><td>${contract.start_date || ''} ~ ${contract.end_date || ''}</td></tr>
          <tr><td style="color:var(--c-text-muted);padding:2px 8px 2px 0">월 납부액</td><td>${fmtKR(monthlyAmt)}원</td>
              <td style="color:var(--c-text-muted);padding:2px 8px 2px 16px">회차</td><td>총 ${carBills.length}건 (과거 ${pastBills.length} / 대기 ${futureCnt})</td></tr>
        </table>
      </div>`;
    inputArea.style.display = '';
    $('#overdueAmount').value = unpaidAmt > 0 ? String(unpaidAmt) : '';
    $('#overdueAmount').focus();
  };

  searchInput?.addEventListener('change', doSearch);
  searchInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
  $('#overdueSearchBtn')?.addEventListener('click', doSearch);

  $('#overdueApplyBtn')?.addEventListener('click', async () => {
    if (!selectedCar) { showToast('차량을 선택하세요', 'info'); return; }
    const unpaidAmount = Number(($('#overdueAmount')?.value || '').replace(/[,원\s]/g, '')) || 0;
    const resultEl = $('#overdueApplyResult');
    resultEl.style.display = '';

    const bSnap = await get(ref(db, 'billings'));
    const allBills = bSnap.exists() ? Object.entries(bSnap.val()).filter(([_, b]) => b && b.status !== 'deleted').map(([id, b]) => ({ id, ...b })) : [];
    const carBills = allBills.filter(b => b.car_number === selectedCar);
    const today = new Date().toISOString().slice(0, 10);
    const pastBills = carBills.filter(b => !b.due_date || b.due_date <= today);
    const futureBills = carBills.filter(b => b.due_date && b.due_date > today);
    const dbUpdates = {};
    const now = Date.now();
    let unpaidCount = 0;

    futureBills.forEach(b => { dbUpdates[`billings/${b.id}/paid_total`] = 0; dbUpdates[`billings/${b.id}/status`] = '납부대기'; dbUpdates[`billings/${b.id}/updated_at`] = now; });

    if (unpaidAmount <= 0) {
      pastBills.forEach(b => { dbUpdates[`billings/${b.id}/paid_total`] = Number(b.amount) || 0; dbUpdates[`billings/${b.id}/status`] = '완납'; dbUpdates[`billings/${b.id}/updated_at`] = now; });
      resultEl.textContent = `✅ ${selectedCar}: 전체 완납 처리 (${pastBills.length}회차)`;
    } else {
      const sorted = [...pastBills].sort((x, y) => String(y.due_date || '').localeCompare(String(x.due_date || '')));
      let remain = unpaidAmount;
      for (const b of sorted) {
        const due = Number(b.amount) || 0;
        if (remain >= due) { dbUpdates[`billings/${b.id}/paid_total`] = 0; dbUpdates[`billings/${b.id}/status`] = '미수'; remain -= due; unpaidCount++; }
        else if (remain > 0) { dbUpdates[`billings/${b.id}/paid_total`] = due - remain; dbUpdates[`billings/${b.id}/status`] = '부분입금'; remain = 0; unpaidCount++; }
        else { dbUpdates[`billings/${b.id}/paid_total`] = due; dbUpdates[`billings/${b.id}/status`] = '완납'; }
        dbUpdates[`billings/${b.id}/updated_at`] = now;
      }
      resultEl.textContent = `✅ ${selectedCar}: 미납 ${unpaidCount}회 (${fmtKR(unpaidAmount)}원) / 완납 ${sorted.length - unpaidCount}회 / 대기 ${futureBills.length}회`;
    }

    if (!confirm(`${selectedCar} 미수 반영합니다. 진행?`)) return;
    try { await update(ref(db), dbUpdates); showToast(`${selectedCar} 미수 반영 완료`, 'success'); }
    catch (e) { showToast(e.message, 'error'); resultEl.textContent = `❌ ${e.message}`; }
  });
}

// ─── 3. 미수 정산 (cutover) ───
function renderCutoverTab() {
  const host = $('#devHost');
  let _cutoverPlan = null;

  host.innerHTML = `
    <div style="display:flex;gap:20px;height:100%">
      <div style="flex:1;display:flex;flex-direction:column;gap:8px">
        <div style="font-size:var(--font-size-sm);color:var(--c-text-muted)">
          현재 미수 명세를 입력하면 <b>전체 회차를 완납 처리</b>한 뒤, 입력된 차량의 <b>최근 회차부터 역산해 미수액만큼 미납</b>으로 되돌립니다.
        </div>
        <div style="display:flex;gap:6px">
          <input type="text" id="cutoverUrl" class="ctrl" placeholder="구글시트 URL 붙여넣기" style="flex:1">
          <button class="btn" id="cutoverLoadUrl">불러오기</button>
        </div>
        <textarea id="cutoverInput" class="ctrl" style="flex:1;min-height:200px;resize:vertical;font-family:monospace" placeholder="또는 직접 입력:
123가4567, 900101-1******, 1650000
34나5678, 950505-2******, 1100000"></textarea>
        <div style="display:flex;gap:6px">
          <button class="btn" id="cutoverPreview">미리보기</button>
          <button class="btn btn-primary" id="cutoverApply" disabled>정산 적용</button>
        </div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column">
        <div style="font-weight:600;margin-bottom:6px">정산 검증</div>
        <div id="cutoverResult" style="flex:1;overflow:auto;font-size:var(--font-size-sm)"></div>
      </div>
    </div>`;

  function parseCutoverInput() {
    const text = $('#cutoverInput')?.value?.trim();
    if (!text) return [];
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return [];
    const splitLine = (l) => l.split(/[,\t]/).map(s => s.trim().replace(/^"|"$/g, '').replace(/,/g, ''));
    const firstCols = splitLine(lines[0]);
    const hasHeader = firstCols.some(c => /차량번호|차번|등록번호|미수|회원사/i.test(c));
    let carIdx = -1, regIdx = -1, amtIdx = -1, dataStart = 0;
    if (hasHeader) {
      firstCols.forEach((c, i) => { if (/차량번호|차번/i.test(c)) carIdx = i; else if (/등록번호|고객등록/i.test(c)) regIdx = i; else if (/미수|잔액|금액/i.test(c)) amtIdx = i; });
      dataStart = 1;
    }
    if (carIdx < 0 || amtIdx < 0) {
      const sample = splitLine(lines[dataStart] || lines[0]);
      let bestAmtIdx = -1, bestAmtVal = 0;
      sample.forEach((v, i) => { const n = Number(v.replace(/[,원\s]/g, '')); if (!isNaN(n) && n > bestAmtVal) { bestAmtVal = n; bestAmtIdx = i; } });
      amtIdx = bestAmtIdx;
      const regCandidate = sample.findIndex(v => /\d{6}-[\d*]{7}/.test(v));
      regIdx = regCandidate >= 0 ? regCandidate : -1;
      const carCandidate = sample.findIndex(v => /\d{2,3}[가-힣]\d{4}/.test(v));
      carIdx = carCandidate >= 0 ? carCandidate : 1;
    }
    return lines.slice(dataStart).map((line, i) => {
      const parts = splitLine(line);
      return { line: i + 1 + dataStart, car_number: parts[carIdx] || '', reg_no: regIdx >= 0 ? (parts[regIdx] || '') : '', unpaid_amount: Number(String(parts[amtIdx] || '').replace(/[,원\s]/g, '')) || 0 };
    }).filter(r => r.car_number && !/차량번호|차번|car|회원사/i.test(r.car_number));
  }

  $('#cutoverLoadUrl')?.addEventListener('click', async () => {
    const url = $('#cutoverUrl')?.value?.trim();
    if (!url) { showToast('URL을 입력하세요', 'error'); return; }
    const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!m) { showToast('구글시트 URL이 아닙니다', 'error'); return; }
    const id = m[1];
    const gidMatch = url.match(/[#?&]gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : '0';
    try {
      const res = await fetch(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (text.trim().startsWith('<')) throw new Error('시트가 비공개입니다 — 공유: 링크 있는 모든 사용자 뷰어');
      $('#cutoverInput').value = text;
      showToast(`불러옴 · ${text.split(/\r?\n/).filter(Boolean).length}행`, 'success');
    } catch (e) { showToast(`불러오기 실패: ${e.message}`, 'error'); }
  });

  $('#cutoverPreview')?.addEventListener('click', async () => {
    const resultEl = $('#cutoverResult');
    const applyBtn = $('#cutoverApply');
    applyBtn.disabled = true;
    _cutoverPlan = null;
    const input = parseCutoverInput();
    resultEl.textContent = '로딩 중...';
    const [bSnap, cSnap] = await Promise.all([get(ref(db, 'billings')), get(ref(db, 'contracts'))]);
    const bills = bSnap.exists() ? Object.entries(bSnap.val()).filter(([_, b]) => b && b.status !== 'deleted').map(([id, b]) => ({ id, ...b })) : [];
    const contracts = cSnap.exists() ? Object.values(cSnap.val()).filter(c => c && c.status !== 'deleted') : [];
    const billsByCar = {};
    bills.forEach(b => { if (b.car_number) (billsByCar[b.car_number] ||= []).push(b); });
    const inputMap = {};
    input.forEach(r => { if (r.car_number) inputMap[r.car_number] = r; });
    const updates = [];
    const lines = [];
    let totalFullPaid = 0, totalUnpaid = 0, totalFuture = 0;
    const processedCars = new Set();
    const today = new Date().toISOString().slice(0, 10);

    Object.entries(billsByCar).forEach(([car, carBills]) => {
      const inputRow = inputMap[car];
      const pastBills = carBills.filter(b => !b.due_date || b.due_date <= today);
      const futureBills = carBills.filter(b => b.due_date && b.due_date > today);
      futureBills.forEach(b => { updates.push({ id: b.id, paid_total: 0, status: '납부대기', payments: [] }); totalFuture++; });
      if (!inputRow || inputRow.unpaid_amount <= 0) {
        pastBills.forEach(b => { updates.push({ id: b.id, paid_total: Number(b.amount) || 0, status: '완납', payments: [] }); totalFullPaid++; });
        processedCars.add(car); return;
      }
      const contract = contracts.find(c => c.car_number === car);
      const looksLikeRegNo = /^\d{6}-[\d*]{7}$/.test(inputRow.reg_no);
      if (looksLikeRegNo && contract?.contractor_reg_no && contract.contractor_reg_no !== inputRow.reg_no) { lines.push(`⚠ ${car}: 등록번호 불일치 — 건너뜀`); return; }
      const sorted = [...pastBills].sort((x, y) => String(y.due_date || '').localeCompare(String(x.due_date || '')));
      let remain = inputRow.unpaid_amount, unpaidCount = 0;
      for (const b of sorted) {
        const due = Number(b.amount) || 0;
        if (remain >= due) { updates.push({ id: b.id, paid_total: 0, status: '미수', payments: [] }); remain -= due; unpaidCount++; }
        else if (remain > 0) { updates.push({ id: b.id, paid_total: due - remain, status: '부분입금', payments: [] }); remain = 0; unpaidCount++; }
        else { updates.push({ id: b.id, paid_total: due, status: '완납', payments: [] }); totalFullPaid++; }
      }
      totalUnpaid += unpaidCount;
      processedCars.add(car);
      lines.push(`✅ ${car}: 미납 ${unpaidCount}회 (${fmtKR(inputRow.unpaid_amount)}) / 완납 ${sorted.length - unpaidCount}회`);
    });
    input.forEach(r => { if (r.car_number && !processedCars.has(r.car_number)) lines.push(`⚠ ${r.car_number}: 회차 데이터 없음`); });
    _cutoverPlan = updates;

    // 검증 테이블 렌더
    const rows = [];
    Object.entries(billsByCar).forEach(([car, carBills]) => {
      const inputRow = inputMap[car];
      const pastBills = carBills.filter(b => !b.due_date || b.due_date <= today);
      const futureBills = carBills.filter(b => b.due_date && b.due_date > today);
      const curUnpaid = pastBills.filter(b => b.status === '미수' || b.status === '부분입금')
        .reduce((s, b) => s + ((Number(b.amount) || 0) - (Number(b.paid_total) || 0)), 0);
      const contract = contracts.find(c => c.car_number === car);
      const inputAmt = inputRow?.unpaid_amount || 0;
      const hasChange = inputAmt !== curUnpaid;
      rows.push({ car, contractor: contract?.contractor_name || '—', inputAmt, curUnpaid, totalBills: carBills.length, pastCnt: pastBills.length, futureCnt: futureBills.length, hasChange });
    });
    // 미수 있는 건 먼저
    rows.sort((a, b) => (b.inputAmt || 0) - (a.inputAmt || 0));

    const th = `<tr style="background:var(--c-bg-sub);font-weight:600;font-size:var(--font-size-xs)">
      <td style="padding:6px 8px">차량번호</td><td style="padding:6px 8px">계약자</td>
      <td style="padding:6px 8px;text-align:right">입력 미수</td><td style="padding:6px 8px;text-align:right">DB 현재 미수</td>
      <td style="padding:6px 8px;text-align:center">결제 회차</td><td style="padding:6px 8px;text-align:center">상태</td></tr>`;
    const trs = rows.map(r => {
      const statusLabel = r.inputAmt > 0 ? `미수 ${fmtKR(r.inputAmt)}원` : '미수없음';
      const statusColor = r.inputAmt > 0 ? 'var(--c-danger)' : 'var(--c-success)';
      const changeIcon = r.hasChange ? '⚠' : '✓';
      return `<tr style="border-bottom:1px solid var(--c-border)">
        <td style="padding:4px 8px;font-weight:600">${r.car}</td>
        <td style="padding:4px 8px">${r.contractor}</td>
        <td style="padding:4px 8px;text-align:right;color:${r.inputAmt > 0 ? 'var(--c-danger)' : 'var(--c-text-muted)'}">${r.inputAmt > 0 ? fmtKR(r.inputAmt) : '—'}</td>
        <td style="padding:4px 8px;text-align:right;color:${r.curUnpaid > 0 ? 'var(--c-danger)' : 'var(--c-text-muted)'}">${r.curUnpaid > 0 ? fmtKR(r.curUnpaid) : '—'}</td>
        <td style="padding:4px 8px;text-align:center">총${r.totalBills} (완납${r.pastCnt}/대기${r.futureCnt})</td>
        <td style="padding:4px 8px;text-align:center;color:${statusColor}">${changeIcon} ${statusLabel}</td>
      </tr>`;
    }).join('');

    resultEl.innerHTML = `
      <div style="margin-bottom:8px;font-size:var(--font-size-xs);color:var(--c-text-muted)">
        입력 ${input.length}행 · 완납 ${totalFullPaid}회 · 미납 ${totalUnpaid}회 · 대기 ${totalFuture}회 · 총 ${updates.length}건
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:var(--font-size-sm)">${th}${trs}</table>`;
    applyBtn.disabled = !updates.length;
  });

  $('#cutoverApply')?.addEventListener('click', async () => {
    if (!_cutoverPlan?.length) return;
    if (!confirm(`${_cutoverPlan.length}건 일괄 업데이트합니다. 진행?`)) return;
    const btn = $('#cutoverApply');
    btn.disabled = true; btn.textContent = '처리 중...';
    const now = Date.now();
    const updates = {};
    _cutoverPlan.forEach(p => { updates[`billings/${p.id}/paid_total`] = p.paid_total; updates[`billings/${p.id}/status`] = p.status; updates[`billings/${p.id}/payments`] = p.payments || []; updates[`billings/${p.id}/cutover_at`] = now; });
    try {
      await update(ref(db), updates);
      $('#cutoverResult').insertAdjacentHTML('beforeend', `<div style="margin-top:12px;padding:10px;background:var(--c-success-bg,#f0fdf4);border-radius:var(--r-sm);font-weight:600;color:var(--c-success)">✅ 완료 — ${_cutoverPlan.length}건 처리됨</div>`);
      _cutoverPlan = null;
      showToast('미수 정산 완료', 'success');
    } catch (e) { $('#cutoverResult').textContent += `\n\n❌ ${e.message}`; showToast(e.message, 'error'); }
    finally { btn.textContent = '정산 적용'; }
  });
}

// ─── 4. 알림톡 ───
function renderAlimtalkTab() {
  const host = $('#devHost');
  host.innerHTML = `
    <div style="display:flex;gap:20px;height:100%">
      <div style="flex:1;display:flex;flex-direction:column;gap:6px">
        <div style="font-size:var(--font-size-sm);color:var(--c-text-muted)">템플릿 심사 전엔 <b>채널 관리자 본인 번호로만</b> 발송 가능.</div>
        <input type="text" id="atTo" class="ctrl" placeholder="수신번호" value="010-6393-0926">
        <input type="text" id="atTplId" class="ctrl" placeholder="템플릿 ID (KA01TP...)">
        <textarea id="atVars" class="ctrl" style="flex:1;min-height:160px;resize:vertical;font-family:monospace">{
  "고객명": "박영협",
  "차량번호": "123가4567",
  "청구월": "4",
  "미납금액": "550,000",
  "원납부일": "2026-04-25",
  "미납일수": "1",
  "입금계좌": "신한 110-123-456789",
  "예금주": "(주)프리패스",
  "담당자": "박영협",
  "담당연락처": "010-6393-0926"
}</textarea>
        <input type="text" id="atFallback" class="ctrl" placeholder="실패 시 SMS 대체 문구 (선택)" value="미납 안내드립니다 (카톡 미수신)">
        <button class="btn btn-primary" id="atSendBtn">알림톡 발송</button>
      </div>
      <div style="flex:1;display:flex;flex-direction:column">
        <div style="font-weight:600;margin-bottom:6px">발송 결과</div>
        <pre id="atResult" style="flex:1;background:var(--c-bg-sub);padding:12px;font-size:var(--font-size-xs);overflow:auto;margin:0;border-radius:var(--r-md)"></pre>
      </div>
    </div>`;

  $('#atSendBtn')?.addEventListener('click', async () => {
    const to = $('#atTo')?.value?.trim();
    const tpl_id = $('#atTplId')?.value?.trim();
    const varsRaw = $('#atVars')?.value?.trim() || '{}';
    const fallback_sms = $('#atFallback')?.value?.trim() || '';
    const resultEl = $('#atResult');
    const btn = $('#atSendBtn');
    if (!to || !tpl_id) { showToast('수신번호 + 템플릿 ID 필요', 'error'); return; }
    let variables;
    try { variables = JSON.parse(varsRaw); } catch { showToast('변수 JSON 형식 오류', 'error'); return; }
    if (!confirm(`알림톡 실발송 (${to}). 진행?`)) return;
    try {
      btn.disabled = true; btn.textContent = '발송 중...'; resultEl.textContent = '';
      const r = await fetch('/api/solapi/alimtalk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to, tpl_id, variables, fallback_sms }) });
      const body = await r.json();
      resultEl.textContent = JSON.stringify(body, null, 2);
      if (body.ok) showToast('알림톡 발송 요청 성공', 'success');
      else showToast(body.error || '발송 실패', 'error');
    } catch (err) { resultEl.textContent = String(err); showToast(err.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = '알림톡 발송'; }
  });
}

// ─── 5. SMS ───
function renderSmsTab() {
  const host = $('#devHost');
  host.innerHTML = `
    <div style="display:flex;gap:20px;height:100%">
      <div style="flex:1;display:flex;flex-direction:column;gap:6px">
        <div style="font-size:var(--font-size-sm);color:var(--c-text-muted)">발신번호 <b>010-6393-0926</b> 에서 발송.</div>
        <div style="display:flex;gap:6px;align-items:center">
          <label style="display:flex;align-items:center;gap:4px"><input type="radio" name="smsProvider" value="solapi" checked> Solapi</label>
          <label style="display:flex;align-items:center;gap:4px"><input type="radio" name="smsProvider" value="aligo"> 알리고</label>
          <button class="btn" id="solapiBalanceBtn" style="margin-left:auto;font-size:var(--font-size-xs)">잔액조회</button>
        </div>
        <input type="text" id="smsTo" class="ctrl" placeholder="수신번호" value="010-6393-0926">
        <textarea id="smsMsg" class="ctrl" style="flex:1;min-height:100px;resize:vertical">JPK ERP 테스트 메시지입니다.</textarea>
        <label style="display:flex;align-items:center;gap:6px;font-size:var(--font-size-sm)" id="aligoTestmodeWrap" hidden>
          <input type="checkbox" id="smsTestmode" checked> 테스트 모드
        </label>
        <button class="btn btn-primary" id="smsSendBtn">SMS 발송</button>
      </div>
      <div style="flex:1;display:flex;flex-direction:column">
        <div style="font-weight:600;margin-bottom:6px">발송 결과</div>
        <pre id="smsResult" style="flex:1;background:var(--c-bg-sub);padding:12px;font-size:var(--font-size-xs);overflow:auto;margin:0;border-radius:var(--r-md)"></pre>
      </div>
    </div>`;

  host.querySelectorAll('input[name="smsProvider"]').forEach(r => {
    r.addEventListener('change', (e) => { const wrap = $('#aligoTestmodeWrap'); if (wrap) wrap.hidden = e.target.value !== 'aligo'; });
  });

  $('#solapiBalanceBtn')?.addEventListener('click', async () => {
    const resultEl = $('#smsResult');
    try { const r = await fetch('/api/solapi/balance'); const body = await r.json(); resultEl.textContent = JSON.stringify(body, null, 2); if (body.ok) showToast('잔액 조회 OK', 'success'); else showToast(body.error || '조회 실패', 'error'); }
    catch (err) { resultEl.textContent = String(err); showToast(err.message, 'error'); }
  });

  $('#smsSendBtn')?.addEventListener('click', async () => {
    const provider = document.querySelector('input[name="smsProvider"]:checked')?.value || 'solapi';
    const to = $('#smsTo')?.value?.trim();
    const msg = $('#smsMsg')?.value?.trim();
    const testmode = $('#smsTestmode')?.checked || false;
    const resultEl = $('#smsResult');
    const btn = $('#smsSendBtn');
    if (!to) { showToast('수신번호 필요', 'error'); return; }
    if (!confirm(`SMS 실발송 (${provider} → ${to}). 진행?`)) return;
    try {
      btn.disabled = true; btn.textContent = '발송 중...'; resultEl.textContent = '';
      const url = provider === 'aligo' ? '/api/aligo/sms' : '/api/solapi/sms';
      const payload = provider === 'aligo' ? { to, msg, testmode } : { to, msg };
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await r.json();
      resultEl.textContent = JSON.stringify(body, null, 2);
      if (body.ok) showToast('SMS 발송 성공', 'success');
      else showToast(body.error || '발송 실패', 'error');
    } catch (err) { resultEl.textContent = String(err); showToast(err.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = 'SMS 발송'; }
  });
}

// ─── 6. 차종 등록 ───
async function renderCarMasterTab() {
  const host = $('#devHost');
  host.innerHTML = `
    <div style="display:flex;gap:16px;height:100%">
      <div style="flex:0 0 320px;overflow-y:auto">
        <div class="form-section">
          <div class="form-section-title">차종 추가</div>
          <div class="form-grid">
            <div class="field is-required"><label>제조사</label><input type="text" name="maker" list="cmMakerList" autocomplete="off"><datalist id="cmMakerList"></datalist></div>
            <div class="field is-required"><label>모델</label><input type="text" name="model" list="cmModelList" autocomplete="off"><datalist id="cmModelList"></datalist></div>
            <div class="field is-required"><label>세부모델</label><input type="text" name="sub" placeholder="아반떼 CN7 20~"></div>
            <div class="field"><label>개발코드</label><input type="text" name="code" placeholder="CN7"></div>
            <div class="field is-required"><label>생산시작</label><input type="text" name="year_start" placeholder="20" maxlength="2"></div>
            <div class="field"><label>생산종료</label><input type="text" name="year_end" placeholder="현재" maxlength="4"></div>
            <div class="field"><label>차종구분</label><input type="text" name="category" list="cmCatList" placeholder="준중형 세단"><datalist id="cmCatList"></datalist></div>
          </div>
          <div style="display:flex;gap:6px;margin-top:12px">
            <button class="btn" id="cmReset">초기화</button>
            <button class="btn btn-primary" id="cmSave">저장</button>
          </div>
        </div>
      </div>
      <div style="flex:1;min-width:0;display:flex;flex-direction:column">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <span style="font-weight:600">차종 목록</span>
          <span id="cmCount" style="font-size:var(--font-size-sm);color:var(--c-text-muted)">0건</span>
          <input type="text" id="cmSearch" class="ctrl" placeholder="검색" style="margin-left:auto;width:160px;height:28px">
        </div>
        <div id="cmGrid" class="ag-theme-alpine" style="flex:1;min-height:300px;width:100%"></div>
      </div>
    </div>`;

  try {
    const mod = await import('./dev-car-master.js');
    await mod.mount();
  } catch (e) {
    console.error('[carmaster]', e);
    showToast('차종 등록 로드 실패: ' + e.message, 'error');
  }
}
