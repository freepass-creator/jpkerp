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
  { key: 'delivery',  label: '일괄출고',  ph: 'ph-truck' },
  { key: 'carmaster', label: '차종 등록', ph: 'ph-car' },
];

let _devCurrentTab = '';

const PATH_TAB = {
  '/dev': 'data', '/dev/overdue': 'overdue', '/dev/cutover': 'cutover',
  '/dev/alimtalk': 'alimtalk', '/dev/sms': 'sms', '/dev/delivery': 'delivery',
  '/dev/car-master': 'carmaster',
};

export async function mount() {
  _devCurrentTab = PATH_TAB[window.location.pathname] || '';
  renderDevList();
  if (_devCurrentTab) renderDevContent();
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

  // 우측 패널 초기화
  const rt = $('#devResultTitle');
  const rs = $('#devResultSub');
  const rh = $('#devResultHost');
  if (rt) rt.textContent = '결과';
  if (rs) rs.textContent = '';
  if (rh) { rh.style.padding = ''; rh.innerHTML = '<div style="padding:24px;text-align:center;color:var(--c-text-muted)">실행 결과가 여기 표시됩니다.</div>'; }

  // 초기화/반영 버튼 — 기능 선택되면 표시
  const resetBtn = $('#devReset');
  const applyBtn = $('#devApply');
  if (resetBtn) { resetBtn.style.display = _devCurrentTab ? '' : 'none'; resetBtn.onclick = null; }
  if (applyBtn) { applyBtn.style.display = _devCurrentTab ? '' : 'none'; applyBtn.onclick = null; applyBtn.disabled = true; }

  const renderers = { data: renderDataTab, overdue: renderOverdueTab, cutover: renderCutoverTab, alimtalk: renderAlimtalkTab, sms: renderSmsTab, delivery: renderDeliveryTab, carmaster: renderCarMasterTab };
  const fn = renderers[_devCurrentTab];
  if (fn) fn();
  else {
    $('#devHost').innerHTML = '<div style="padding:24px;text-align:center;color:var(--c-text-muted)">좌측에서 기능을 선택하세요.</div>';
    if (resetBtn) resetBtn.style.display = 'none';
    if (applyBtn) applyBtn.style.display = 'none';
  }
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
// 계약 기준으로 수납 스케줄 새로 생성 + 미수 반영
let _cutContracts = [];
function renderCutoverTab() {
  const host = $('#devHost');
  const resultTitle = $('#devResultTitle');
  const resultSub = $('#devResultSub');
  let _cutoverPlan = null;
  let cutoverGridApi = null;

  // 계약 데이터 로드
  import('../firebase/contracts.js').then(m => {
    m.watchContracts(items => { _cutContracts = items; console.log('[cutover] contracts loaded:', items.length); });
  });

  if (resultTitle) resultTitle.textContent = '정산 검증';
  if (resultSub) resultSub.textContent = '';

  host.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:8px;height:100%">
      <div style="font-size:var(--font-size-sm);color:var(--c-text-muted)">
        미수 명세를 입력하면 <b>계약 기준으로 수납 스케줄을 새로 생성</b>합니다.<br>
        오늘 이전 회차 → 미수 없으면 <b>완납</b>, 미수 있으면 최근 회차부터 <b>미납</b><br>
        오늘 이후 회차 → <b>납부대기</b>
      </div>
      <div style="display:flex;gap:6px">
        <input type="text" id="cutoverUrl" class="ctrl" placeholder="구글시트 URL 붙여넣기" style="flex:1">
        <button class="btn" id="cutoverLoadUrl">불러오기</button>
      </div>
      <textarea id="cutoverInput" class="ctrl" style="flex:1;min-height:200px;resize:vertical;font-family:monospace" placeholder="차량번호, 등록번호, 미수금액
123가4567, 900101-1******, 1650000
34나5678, 950505-2******, 0"></textarea>
    </div>`;

  // 우측 AG Grid
  const rh = $('#devResultHost');
  if (rh) {
    rh.style.padding = '0';
    rh.innerHTML = '<div id="cutoverGrid" class="ag-theme-alpine" style="width:100%;height:100%"></div>';
  }
  const gridEl = $('#cutoverGrid');
  if (gridEl) {
    cutoverGridApi = agGrid.createGrid(gridEl, {
      columnDefs: [
        { headerName: '차량번호', field: 'car_number', width: 95, cellStyle: { fontWeight: 'var(--fw-bold)' } },
        { headerName: '계약자', field: 'contractor', width: 80 },
        { headerName: '월렌트', field: 'rent_amount', width: 85, type: 'numericColumn', valueFormatter: p => fmtKR(p.value) },
        { headerName: '총회차', field: 'total_months', width: 60, type: 'numericColumn' },
        { headerName: '완납', field: 'paid_cnt', width: 50, type: 'numericColumn',
          cellStyle: { color: 'var(--c-success)' } },
        { headerName: '미납', field: 'unpaid_cnt', width: 50, type: 'numericColumn',
          cellStyle: p => ({ color: p.value > 0 ? 'var(--c-danger)' : 'var(--c-text-muted)' }) },
        { headerName: '대기', field: 'future_cnt', width: 50, type: 'numericColumn' },
        { headerName: '미수액', field: 'unpaid_amount', width: 90, type: 'numericColumn',
          valueFormatter: p => p.value > 0 ? fmtKR(p.value) : '—',
          cellStyle: p => ({ color: p.value > 0 ? 'var(--c-danger)' : 'var(--c-text-muted)', textAlign: 'right', fontWeight: 'var(--fw-bold)' }) },
        { headerName: '상태', field: 'statusLabel', width: 80,
          cellStyle: p => ({ color: p.data?.unpaid_amount > 0 ? 'var(--c-danger)' : 'var(--c-success)', fontWeight: 'var(--fw-bold)' }) },
      ],
      rowData: [],
      defaultColDef: { resizable: true, sortable: true, filter: true, minWidth: 40 },
      rowHeight: 28, headerHeight: 28, animateRows: false,
    });
  }

  // 패널헤드 버튼
  const resetBtn = $('#devReset');
  const applyBtn = $('#devApply');
  if (resetBtn) {
    resetBtn.onclick = () => {
      $('#cutoverInput').value = '';
      $('#cutoverUrl').value = '';
      _cutoverPlan = null;
      cutoverGridApi?.setGridOption('rowData', []);
      if (applyBtn) applyBtn.disabled = true;
      if (resultSub) resultSub.textContent = '';
    };
  }
  if (applyBtn) applyBtn.disabled = true;

  function parseCutoverInput() {
    const text = $('#cutoverInput')?.value?.trim();
    if (!text) return [];
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return [];
    // CSV 파싱 — 따옴표 안 콤마 무시 ("990,000" → 990000)
    const splitLine = (l) => {
      const result = []; let cur = '', inQ = false;
      for (const ch of l) {
        if (ch === '"') { inQ = !inQ; continue; }
        if ((ch === ',' || ch === '\t') && !inQ) { result.push(cur.trim()); cur = ''; continue; }
        cur += ch;
      }
      result.push(cur.trim());
      return result;
    };
    const firstCols = splitLine(lines[0]);
    const hasHeader = firstCols.some(c => /차량번호|차번|등록번호|미수|회원사/i.test(c));
    let carIdx = -1, amtIdx = -1, dataStart = 0;
    if (hasHeader) {
      firstCols.forEach((c, i) => { if (/차량번호|차번/i.test(c)) carIdx = i; else if (/미수|잔액|금액/i.test(c)) amtIdx = i; });
      dataStart = 1;
    }
    if (carIdx < 0 || amtIdx < 0) {
      const sample = splitLine(lines[dataStart] || lines[0]);
      let bestAmtIdx = -1, bestAmtVal = 0;
      sample.forEach((v, i) => { const n = Number(v.replace(/[,원\s]/g, '')); if (!isNaN(n) && n > bestAmtVal) { bestAmtVal = n; bestAmtIdx = i; } });
      amtIdx = bestAmtIdx;
      const carCandidate = sample.findIndex(v => /\d{2,3}[가-힣]\d{4}/.test(v));
      carIdx = carCandidate >= 0 ? carCandidate : 0;
    }
    const normCar = s => String(s || '').trim().replace(/\s+/g, '');
    return lines.slice(dataStart).map((line, i) => {
      const parts = splitLine(line);
      return { car_number: normCar(parts[carIdx]), unpaid_amount: Number(String(parts[amtIdx] || '').replace(/[,원\s]/g, '')) || 0 };
    }).filter(r => r.car_number && !/차량번호|차번|car/i.test(r.car_number));
  }

  function parseFlexDate(s) {
    if (!s) return null;
    let v = String(s).trim().replace(/[./]/g, '-');
    const m = v.match(/^(\d{2})-(\d{1,2})-(\d{1,2})$/);
    if (m) v = `${Number(m[1]) < 50 ? 2000 + Number(m[1]) : 1900 + Number(m[1])}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  // 계약 → 수납 스케줄 + 미수 반영 계산
  function buildPlan(input) {
    const today = new Date().toISOString().slice(0, 10);
    const inputMap = {};
    input.forEach(r => { inputMap[r.car_number] = r; });
    const normCar = s => String(s || '').trim().replace(/\s+/g, '');
    const rows = [];
    const allBillings = []; // { contract, seq, due_date, amount, status, paid_total }

    _cutContracts.forEach(c => {
      if (c.status === 'deleted') return;
      const cn = normCar(c.car_number);
      if (!cn) return;
      const months = Number(c.rent_months) || 0;
      const amount = Number(String(c.rent_amount || '').replace(/,/g, '')) || 0;
      const start = parseFlexDate(c.start_date);
      if (!months || !amount || !start || !c.contract_code) return;

      const debitDayRaw = String(c.auto_debit_day || '').trim();
      const isLastDay = ['말일', '말'].includes(debitDayRaw);
      const debitDay = isLastDay ? 31 : (Number(debitDayRaw) || 25);

      const inputRow = inputMap[cn];
      const unpaidAmt = inputRow ? inputRow.unpaid_amount : 0;

      let paidCnt = 0, unpaidCnt = 0, futureCnt = 0;
      const schedules = [];

      for (let i = 0; i < months; i++) {
        const d = isLastDay
          ? new Date(start.getFullYear(), start.getMonth() + i + 1, 0)
          : new Date(start.getFullYear(), start.getMonth() + i, debitDay);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const dueDate = `${yyyy}-${mm}-${dd}`;
        schedules.push({ seq: i + 1, due_month: `${yyyy}-${mm}`, due_date: dueDate, amount });
      }

      // 오늘 이전: 완납 or 미납 (미수액 역산)
      // 오늘 이후: 납부대기
      const pastSchedules = schedules.filter(s => s.due_date <= today);
      const futureSchedules = schedules.filter(s => s.due_date > today);

      // 미수 역산: 최근 회차부터 미수액만큼 미납
      const sortedPast = [...pastSchedules].sort((a, b) => b.due_date.localeCompare(a.due_date));
      let remain = unpaidAmt;
      for (const s of sortedPast) {
        if (remain >= s.amount) {
          s.status = '미납'; s.paid_total = 0; remain -= s.amount; unpaidCnt++;
        } else if (remain > 0) {
          s.status = '부분납부'; s.paid_total = s.amount - remain; remain = 0; unpaidCnt++;
        } else {
          s.status = '완납'; s.paid_total = s.amount; paidCnt++;
        }
      }
      futureSchedules.forEach(s => { s.status = '납부대기'; s.paid_total = 0; futureCnt++; });

      const allSchedules = [...pastSchedules, ...futureSchedules];
      allSchedules.forEach(s => {
        allBillings.push({
          contract_code: c.contract_code,
          contractor_code: c.contractor_code || '',
          contractor_name: c.contractor_name || '',
          car_number: cn,
          ...s,
        });
      });

      rows.push({
        car_number: cn,
        contractor: c.contractor_name || '—',
        contract_code: c.contract_code,
        rent_amount: amount,
        total_months: months,
        paid_cnt: paidCnt,
        unpaid_cnt: unpaidCnt,
        future_cnt: futureCnt,
        unpaid_amount: unpaidAmt,
        statusLabel: unpaidAmt > 0 ? '미수' : '정산완료',
      });
    });

    // 매칭 안 된 입력
    const contractCars = new Set(_cutContracts.map(c => normCar(c.car_number)));
    input.forEach(r => {
      if (!contractCars.has(r.car_number)) {
        rows.push({
          car_number: r.car_number, contractor: '계약없음', contract_code: '',
          rent_amount: 0, total_months: 0, paid_cnt: 0, unpaid_cnt: 0, future_cnt: 0,
          unpaid_amount: r.unpaid_amount, statusLabel: '계약없음',
        });
      }
    });

    rows.sort((a, b) => (b.unpaid_amount || 0) - (a.unpaid_amount || 0));
    return { rows, billings: allBillings };
  }

  async function runPreview() {
    try {
      _cutoverPlan = null;
      const input = parseCutoverInput();
      if (!input.length) {
        if (resultSub) resultSub.textContent = '파싱 실패 — 차량번호/금액 확인';
        showToast('데이터가 없습니다', 'error');
        return;
      }
      if (resultSub) resultSub.textContent = `${input.length}행 로딩 중...`;

      // 계약 대기
      let waited = 0;
      while (!_cutContracts.length && waited < 5000) { await new Promise(r => setTimeout(r, 300)); waited += 300; }
      console.log('[cutover] contracts:', _cutContracts.length, 'input:', input.length);

      const plan = buildPlan(input);
      _cutoverPlan = plan.billings;
      cutoverGridApi?.setGridOption('rowData', plan.rows);

      const totalPaid = plan.rows.reduce((s, r) => s + r.paid_cnt, 0);
      const totalUnpaid = plan.rows.reduce((s, r) => s + r.unpaid_cnt, 0);
      const totalFuture = plan.rows.reduce((s, r) => s + r.future_cnt, 0);
      if (resultSub) resultSub.textContent = `${plan.rows.length}대 · 완납${totalPaid} · 미납${totalUnpaid} · 대기${totalFuture} · 총${plan.billings.length}회차`;

      const headApply = $('#devApply');
      if (headApply) headApply.disabled = !plan.billings.length;
    } catch (err) {
      console.error('[cutover]', err);
      if (resultSub) resultSub.textContent = `오류: ${err.message}`;
      showToast(err.message, 'error');
    }
  }

  // 불러오기
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
      if (text.trim().startsWith('<')) throw new Error('시트가 비공개입니다');
      $('#cutoverInput').value = text;
      showToast(`불러옴 · ${text.split(/\r?\n/).filter(Boolean).length}행`, 'success');
      await runPreview();
    } catch (e) { showToast(`실패: ${e.message}`, 'error'); }
  });

  // 반영하기: 기존 billings 삭제 → 새로 생성
  const headApplyBtn = $('#devApply');
  if (headApplyBtn) {
    headApplyBtn.onclick = async () => {
      if (!_cutoverPlan?.length) return;
      headApplyBtn.disabled = true;
      const origText = headApplyBtn.innerHTML;
      headApplyBtn.innerHTML = '<i class="ph ph-spinner"></i> 처리 중...';
      try {
        // 1) 기존 billings 전부 삭제
        if (resultSub) resultSub.textContent = '기존 데이터 삭제 중...';
        await update(ref(db), { billings: null });

        // 2) 새 billings 일괄 생성 (batch write)
        const now = Date.now();
        const batchSize = 500; // Firebase update 한번에 최대
        const total = _cutoverPlan.length;
        let created = 0;

        for (let i = 0; i < total; i += batchSize) {
          const chunk = _cutoverPlan.slice(i, i + batchSize);
          const batchUpdates = {};
          chunk.forEach((b, j) => {
            const id = `BL${String(created + j + 1).padStart(5, '0')}`;
            batchUpdates[`billings/${id}`] = {
              ...b,
              billing_id: id,
              status: b.status || '미수',
              paid_total: b.paid_total || 0,
              created_at: now,
              updated_at: now,
            };
          });
          await update(ref(db), batchUpdates);
          created += chunk.length;
          if (resultSub) resultSub.textContent = `생성 중... ${created}/${total}`;
          // 우측 그리드에 진행상황 업데이트
          const progress = cutoverGridApi?.getDisplayedRowCount() ? null :
            cutoverGridApi?.setGridOption('rowData', _cutoverPlan.slice(0, created).map((b, idx) => ({
              car_number: b.car_number, contractor: b.contractor_name || '',
              rent_amount: b.amount, total_months: '', paid_cnt: '', unpaid_cnt: '',
              future_cnt: '', unpaid_amount: 0, statusLabel: `${idx + 1}/${total}`,
            })));
        }

        // 시퀀스 카운터 업데이트
        await update(ref(db), { 'sequences/billing': total });

        if (resultSub) resultSub.textContent = `완료 — ${created}회차 생성`;
        _cutoverPlan = null;
        showToast(`미수 정산 완료 — ${created}회차`, 'success');
      } catch (e) {
        if (resultSub) resultSub.textContent = `오류: ${e.message}`;
        showToast(e.message, 'error');
      } finally { headApplyBtn.innerHTML = origText; }
    };
  }
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

// ─── 6. 일괄출고 ───
async function renderDeliveryTab() {
  const host = $('#devHost');
  host.innerHTML = `
    <div style="display:flex;gap:20px;height:100%">
      <div style="flex:1;display:flex;flex-direction:column">
        <div style="font-size:var(--font-size-sm);color:var(--c-text-muted);margin-bottom:12px">
          계약 등록된 차량 중 <b>출고 이벤트가 없는 건</b>을 조회합니다.<br>
          계약 시작일 기준으로 출고 이벤트를 일괄 생성합니다.
        </div>
        <div style="display:flex;gap:6px;margin-bottom:12px">
          <button class="btn" id="deliveryScan">미출고 조회</button>
          <button class="btn btn-primary" id="deliveryApply" disabled>일괄 출고 등록</button>
        </div>
        <div id="deliveryResult" style="flex:1;overflow:auto"></div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column">
        <div style="font-weight:600;margin-bottom:6px">처리 결과</div>
        <pre id="deliveryLog" style="flex:1;background:var(--c-bg-sub);padding:12px;font-size:var(--font-size-xs);overflow:auto;margin:0;white-space:pre-wrap;border-radius:var(--r-md)"></pre>
      </div>
    </div>`;

  let _deliveryPlan = [];

  $('#deliveryScan')?.addEventListener('click', async () => {
    const resultEl = $('#deliveryResult');
    const applyBtn = $('#deliveryApply');
    applyBtn.disabled = true;
    _deliveryPlan = [];
    resultEl.innerHTML = '<span style="color:var(--c-text-muted)">조회 중...</span>';

    const [cSnap, eSnap, aSnap] = await Promise.all([
      get(ref(db, 'contracts')),
      get(ref(db, 'events')),
      get(ref(db, 'assets')),
    ]);
    const contracts = cSnap.exists() ? Object.values(cSnap.val()).filter(c => c && c.status !== 'deleted' && c.contract_status !== '계약해지') : [];
    const events = eSnap.exists() ? Object.values(eSnap.val()).filter(e => e && e.status !== 'deleted') : [];
    const assets = aSnap.exists() ? Object.values(aSnap.val()).filter(a => a && a.status !== 'deleted') : [];

    // 출고 이벤트가 있는 차량 (ioc + 정상출고 or delivery)
    const deliveredCars = new Set();
    events.forEach(e => {
      if ((e.type === 'ioc' && e.ioc_kind === '정상출고') || e.type === 'delivery' || e.event_type === 'delivery') {
        deliveredCars.add(e.car_number);
      }
    });

    // 계약중 + 미출고
    const missing = contracts.filter(c => c.car_number && !deliveredCars.has(c.car_number));

    if (!missing.length) {
      resultEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--c-success)">모든 계약 차량이 출고 처리되어 있습니다.</div>';
      return;
    }

    _deliveryPlan = missing;

    const th = `<tr style="background:var(--c-bg-sub);font-weight:600;font-size:var(--font-size-xs)">
      <td style="padding:6px 8px">차량번호</td><td style="padding:6px 8px">계약자</td>
      <td style="padding:6px 8px">계약시작일</td><td style="padding:6px 8px">계약종료일</td>
      <td style="padding:6px 8px">회사코드</td></tr>`;
    const trs = missing.map(c => {
      const asset = assets.find(a => a.car_number === c.car_number);
      return `<tr style="border-bottom:1px solid var(--c-border)">
        <td style="padding:4px 8px;font-weight:600">${c.car_number}</td>
        <td style="padding:4px 8px">${c.contractor_name || '—'}</td>
        <td style="padding:4px 8px">${c.start_date || '—'}</td>
        <td style="padding:4px 8px">${c.end_date || '—'}</td>
        <td style="padding:4px 8px">${c.partner_code || asset?.partner_code || '—'}</td>
      </tr>`;
    }).join('');

    resultEl.innerHTML = `
      <div style="margin-bottom:8px;font-size:var(--font-size-sm);color:var(--c-danger);font-weight:600">
        미출고 ${missing.length}건 발견
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:var(--font-size-sm)">${th}${trs}</table>`;
    applyBtn.disabled = false;
  });

  $('#deliveryApply')?.addEventListener('click', async () => {
    if (!_deliveryPlan.length) return;
    if (!confirm(`${_deliveryPlan.length}건 일괄 출고 등록합니다. 진행?`)) return;

    const btn = $('#deliveryApply');
    const logEl = $('#deliveryLog');
    btn.disabled = true;
    btn.textContent = '처리 중...';
    logEl.textContent = '';

    // 일괄 업데이트 (1회 요청)
    const now = Date.now();
    const bulkUpdates = {};
    _deliveryPlan.forEach((c, i) => {
      const key = `EV${now}${String(i).padStart(4, '0')}`;
      bulkUpdates[`events/${key}`] = {
        event_id: key,
        type: 'ioc',
        event_type: 'ioc',
        ioc_kind: '정상출고',
        direction: 'out',
        date: c.start_date || new Date().toISOString().slice(0, 10),
        car_number: c.car_number,
        vin: c.vin || '',
        title: '정상출고 (일괄등록)',
        customer_name: c.contractor_name || '',
        contract_code: c.contract_code || '',
        partner_code: c.partner_code || '',
        note: '개발도구 일괄출고',
        status: 'active',
        match_status: 'unmatched',
        amount: 0,
        created_at: now,
        updated_at: now,
      };
    });

    let ok = 0;
    try {
      await update(ref(db), bulkUpdates);
      ok = _deliveryPlan.length;
      _deliveryPlan.forEach(c => {
        logEl.textContent += `✅ ${c.car_number} → ${c.start_date} 출고\n`;
      });
    } catch (e) {
      logEl.textContent += `❌ 일괄 처리 실패: ${e.message}\n`;
    }

    logEl.textContent += `\n━━━\n완료: ${ok}건`;
    showToast(`일괄출고 ${ok}건 완료`, ok > 0 ? 'success' : 'error');
    btn.textContent = '일괄 출고 등록';
    _deliveryPlan = [];
  });
}

// ─── 7. 차종 등록 ───
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
