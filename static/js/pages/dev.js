/**
 * pages/dev.js — 개발도구
 *
 * 컬렉션 단위 데이터 조회/전체삭제
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

export async function mount() {
  const host = $('#devHost');
  if (!host) return;

  // 각 컬렉션 카드 렌더
  host.innerHTML = `
    <div style="padding:12px 0;color:var(--c-danger);font-weight:600;font-size:var(--font-size-sm)">
      ⚠ 삭제는 복구 불가합니다. 신중하게 사용하세요.
    </div>
    ${COLLECTIONS.map(c => `
      <div class="dash-card" style="display:flex;align-items:center;gap:12px;margin-bottom:8px" data-col="${c.key}">
        <span style="font-size:20px">${c.icon}</span>
        <div style="flex:1">
          <div style="font-weight:600">${c.label}</div>
          <div style="font-size:var(--font-size-xs);color:var(--c-text-muted)" id="dev_count_${c.key}">조회 중...</div>
        </div>
        <button class="btn" data-action="count" data-col="${c.key}" style="font-size:var(--font-size-xs)">새로고침</button>
        <button class="btn" data-action="delete-all" data-col="${c.key}" style="font-size:var(--font-size-xs);color:var(--c-danger)">전체 삭제</button>
      </div>
    `).join('')}
    <div style="margin-top:20px;border-top:1px solid var(--c-border);padding-top:16px">
      <div style="font-weight:600;margin-bottom:8px">업로드 단위 삭제</div>
      <div style="font-size:var(--font-size-sm);color:var(--c-text-muted);margin-bottom:8px">
        특정 업로드로 반영된 데이터만 삭제 (upload_id 기준)
      </div>
      <div style="display:flex;gap:6px">
        <input type="text" id="devUploadId" class="ctrl" placeholder="upload_id 입력" style="flex:1">
        <button class="btn" id="devDeleteByUpload" style="color:var(--c-danger)">해당 업로드 삭제</button>
      </div>
    </div>

    <div style="margin-top:20px;border-top:1px solid var(--c-border);padding-top:16px">
      <div style="font-weight:600;margin-bottom:8px">💰 개시 미수 정산 (cutover)</div>
      <div style="font-size:var(--font-size-sm);color:var(--c-text-muted);margin-bottom:8px">
        현재 미수 명세를 입력하면 <b>전체 회차를 일단 완납 처리</b>한 뒤,<br>
        입력된 차량의 <b>최근 회차부터 역산해 미수액만큼 미납</b>으로 되돌립니다.<br>
        형식: <code>차량번호, 고객등록번호, 미수액</code> (한 줄에 한 차량)
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <div style="display:flex;gap:6px">
          <input type="text" id="cutoverUrl" class="ctrl" placeholder="구글시트 URL 붙여넣기 (공유: 링크 있는 모든 사용자 뷰어)" style="flex:1">
          <button class="btn" id="cutoverLoadUrl">불러오기</button>
        </div>
        <textarea id="cutoverInput" class="ctrl" rows="6" style="resize:vertical;font-family:monospace" placeholder="또는 아래에 직접 입력:
123가4567, 900101-1******, 1650000
34나5678, 950505-2******, 1100000"></textarea>
        <div style="display:flex;gap:6px">
          <button class="btn" id="cutoverPreview">미리보기</button>
          <button class="btn btn-primary" id="cutoverApply" disabled>정산 적용</button>
        </div>
        <pre id="cutoverResult" style="background:var(--c-bg-sub);padding:8px;font-size:var(--font-size-xs);overflow:auto;max-height:300px;margin:0;white-space:pre-wrap"></pre>
      </div>
    </div>

    <div style="margin-top:20px;border-top:1px solid var(--c-border);padding-top:16px">
      <div style="font-weight:600;margin-bottom:8px">💛 카카오 알림톡 테스트 (Solapi)</div>
      <div style="font-size:var(--font-size-sm);color:var(--c-text-muted);margin-bottom:8px">
        템플릿 심사 전엔 <b>채널 관리자 본인 번호(010-6393-0926)로만</b> 발송 가능. 변수는 JSON.
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <input type="text" id="atTo" class="ctrl" placeholder="수신번호" value="010-6393-0926">
        <input type="text" id="atTplId" class="ctrl" placeholder="템플릿 ID (KA01TP...)">
        <textarea id="atVars" class="ctrl" rows="5" style="resize:vertical;font-family:monospace">{
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
        <pre id="atResult" style="background:var(--c-bg-sub);padding:8px;font-size:var(--font-size-xs);overflow:auto;max-height:200px;margin:0"></pre>
      </div>
    </div>

    <div style="margin-top:20px;border-top:1px solid var(--c-border);padding-top:16px">
      <div style="font-weight:600;margin-bottom:8px">💬 SMS 테스트</div>
      <div style="font-size:var(--font-size-sm);color:var(--c-text-muted);margin-bottom:8px">
        발신번호 <b>010-6393-0926</b> 에서 발송.
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <div style="display:flex;gap:6px;align-items:center">
          <label style="display:flex;align-items:center;gap:4px"><input type="radio" name="smsProvider" value="solapi" checked> Solapi (배포 OK)</label>
          <label style="display:flex;align-items:center;gap:4px"><input type="radio" name="smsProvider" value="aligo"> 알리고 (IP 제한)</label>
          <button class="btn" id="solapiBalanceBtn" style="margin-left:auto;font-size:var(--font-size-xs)">잔액조회</button>
        </div>
        <input type="text" id="smsTo" class="ctrl" placeholder="수신번호 (예: 010-1234-5678)" value="010-6393-0926">
        <textarea id="smsMsg" class="ctrl" rows="3" style="resize:vertical">JPK ERP 테스트 메시지입니다.</textarea>
        <label style="display:flex;align-items:center;gap:6px;font-size:var(--font-size-sm)" id="aligoTestmodeWrap" hidden>
          <input type="checkbox" id="smsTestmode" checked> 테스트 모드 (알리고만 — 실발송 안됨)
        </label>
        <button class="btn btn-primary" id="smsSendBtn">SMS 발송</button>
        <pre id="smsResult" style="background:var(--c-bg-sub);padding:8px;font-size:var(--font-size-xs);overflow:auto;max-height:200px;margin:0"></pre>
      </div>
    </div>
  `;

  // 건수 조회
  for (const c of COLLECTIONS) {
    await refreshCount(c.key);
  }

  // 이벤트
  host.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const col = btn.dataset.col;

    if (action === 'count') {
      await refreshCount(col);
    }

    if (action === 'delete-all') {
      const info = COLLECTIONS.find(c => c.key === col);
      const countEl = $(`#dev_count_${col}`);
      const count = countEl?.textContent?.match(/(\d+)/)?.[1] || '?';

      if (!confirm(`⚠ "${info.label}" 컬렉션의 ${count}건을 전체 삭제합니다.\n\n정말 삭제하시겠습니까?`)) return;
      if (!confirm(`마지막 확인: "${info.label}" 전체 삭제 진행합니다.`)) return;

      try {
        btn.disabled = true;
        btn.textContent = '삭제 중...';
        const snap = await get(ref(db, col));
        if (!snap.exists()) { showToast('데이터 없음', 'info'); return; }

        const updates = {};
        Object.keys(snap.val()).forEach(k => {
          updates[`${col}/${k}/status`] = 'deleted';
          updates[`${col}/${k}/deleted_at`] = Date.now();
        });
        await update(ref(db), updates);

        showToast(`${info.label} 전체 삭제 완료`, 'success');
        await refreshCount(col);
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = '전체 삭제';
      }
    }
  });

  // 업로드 단위 삭제
  $('#devDeleteByUpload')?.addEventListener('click', async () => {
    const uploadId = $('#devUploadId')?.value?.trim();
    if (!uploadId) { showToast('upload_id를 입력하세요', 'info'); return; }

    // 해당 upload_id로 만들어진 events 찾기
    try {
      const eventsSnap = await get(ref(db, 'events'));
      const assetsSnap = await get(ref(db, 'assets'));
      const updates = {};
      let count = 0;

      if (eventsSnap.exists()) {
        Object.entries(eventsSnap.val()).forEach(([k, v]) => {
          if (v.note?.includes(uploadId) || v.upload_id === uploadId) {
            updates[`events/${k}/status`] = 'deleted';
            updates[`events/${k}/deleted_at`] = Date.now();
            count++;
          }
        });
      }

      if (assetsSnap.exists()) {
        Object.entries(assetsSnap.val()).forEach(([k, v]) => {
          if (v.upload_id === uploadId) {
            updates[`assets/${k}/status`] = 'deleted';
            updates[`assets/${k}/deleted_at`] = Date.now();
            count++;
          }
        });
      }

      if (!count) { showToast('해당 업로드로 생성된 데이터 없음', 'info'); return; }
      if (!confirm(`${count}건 삭제합니다. 진행?`)) return;

      await update(ref(db), updates);
      showToast(`${count}건 삭제 완료`, 'success');

      for (const c of COLLECTIONS) await refreshCount(c.key);
    } catch (err) { showToast(err.message, 'error'); }
  });

  // 알림톡 발송
  $('#atSendBtn')?.addEventListener('click', async () => {
    const to = $('#atTo')?.value?.trim();
    const tpl_id = $('#atTplId')?.value?.trim();
    const varsRaw = $('#atVars')?.value?.trim() || '{}';
    const fallback_sms = $('#atFallback')?.value?.trim() || '';
    const resultEl = $('#atResult');
    const btn = $('#atSendBtn');
    if (!to || !tpl_id) { showToast('수신번호 + 템플릿 ID 필요', 'error'); return; }
    let variables;
    try { variables = JSON.parse(varsRaw); }
    catch { showToast('변수 JSON 형식 오류', 'error'); return; }
    if (!confirm(`알림톡 실발송 (${to}). 진행?`)) return;
    try {
      btn.disabled = true;
      btn.textContent = '발송 중...';
      resultEl.textContent = '';
      const r = await fetch('/api/solapi/alimtalk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, tpl_id, variables, fallback_sms }),
      });
      const body = await r.json();
      resultEl.textContent = JSON.stringify(body, null, 2);
      if (body.ok) showToast('알림톡 발송 요청 성공', 'success');
      else showToast(body.error || JSON.stringify(body.raw?.statusMessage) || '발송 실패', 'error');
    } catch (err) {
      resultEl.textContent = String(err);
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '알림톡 발송';
    }
  });

  // ── 개시 미수 정산 (cutover) ──
  const fmtKR = v => Number(v || 0).toLocaleString('ko-KR');
  let _cutoverPlan = null;

  function parseCutoverInput() {
    const text = $('#cutoverInput')?.value?.trim();
    if (!text) return [];
    // 헤더행 감지해서 컬럼 인덱스 찾기 (회원사·차량번호·등록번호·미수액 유연 대응)
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return [];
    const splitLine = (l) => l.split(/[,\t]/).map(s => s.trim().replace(/^"|"$/g, '').replace(/,/g, ''));

    const firstCols = splitLine(lines[0]);
    const hasHeader = firstCols.some(c => /차량번호|차번|등록번호|미수|회원사/i.test(c));
    let carIdx = -1, regIdx = -1, amtIdx = -1;
    let dataStart = 0;
    if (hasHeader) {
      firstCols.forEach((c, i) => {
        if (/차량번호|차번/i.test(c)) carIdx = i;
        else if (/등록번호|고객등록/i.test(c)) regIdx = i;
        else if (/미수|잔액|금액/i.test(c)) amtIdx = i;
      });
      dataStart = 1;
    }
    // 헤더 없거나 찾지 못하면 컬럼 순서 자동 추정 (첫 숫자 없는/짧은 = 회원사·차번·등록, 숫자 큰 = 금액)
    if (carIdx < 0 || amtIdx < 0) {
      const sample = splitLine(lines[dataStart] || lines[0]);
      // 가장 큰 숫자가 들어있는 컬럼 = 미수액
      let bestAmtIdx = -1, bestAmtVal = 0;
      sample.forEach((v, i) => {
        const n = Number(v.replace(/[,원\s]/g, ''));
        if (!isNaN(n) && n > bestAmtVal) { bestAmtVal = n; bestAmtIdx = i; }
      });
      amtIdx = bestAmtIdx;
      // 등록번호는 하이픈 + 별표 패턴
      const regCandidate = sample.findIndex(v => /\d{6}-[\d*]{7}/.test(v) || /\d{6}-\d{7}/.test(v));
      regIdx = regCandidate >= 0 ? regCandidate : -1;
      // 차량번호는 "XX가XXXX" 패턴
      const carCandidate = sample.findIndex(v => /\d{2,3}[가-힣]\d{4}/.test(v));
      carIdx = carCandidate >= 0 ? carCandidate : 1;  // 자동 감지 실패 시 두 번째 컬럼(회원사 다음)
    }

    return lines.slice(dataStart).map((line, i) => {
      const parts = splitLine(line);
      return {
        line: i + 1 + dataStart,
        car_number: parts[carIdx] || '',
        reg_no: regIdx >= 0 ? (parts[regIdx] || '') : '',
        unpaid_amount: Number(String(parts[amtIdx] || '').replace(/[,원\s]/g, '')) || 0,
      };
    }).filter(r => r.car_number && !/차량번호|차번|car|회원사/i.test(r.car_number));
  }

  // 구글시트 URL → CSV 변환
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
    } catch (e) {
      showToast(`불러오기 실패: ${e.message}`, 'error');
    }
  });

  $('#cutoverPreview')?.addEventListener('click', async () => {
    const resultEl = $('#cutoverResult');
    const applyBtn = $('#cutoverApply');
    applyBtn.disabled = true;
    _cutoverPlan = null;

    const input = parseCutoverInput();
    resultEl.textContent = '로딩 중...';

    // 데이터 로드
    const [bSnap, cSnap] = await Promise.all([
      get(ref(db, 'billings')),
      get(ref(db, 'contracts')),
    ]);
    const bills = bSnap.exists() ? Object.entries(bSnap.val())
      .filter(([_, b]) => b && b.status !== 'deleted')
      .map(([id, b]) => ({ id, ...b })) : [];
    const contracts = cSnap.exists() ? Object.values(cSnap.val()).filter(c => c && c.status !== 'deleted') : [];

    // 차량별 그룹핑
    const billsByCar = {};
    bills.forEach(b => {
      if (!b.car_number) return;
      if (!billsByCar[b.car_number]) billsByCar[b.car_number] = [];
      billsByCar[b.car_number].push(b);
    });

    // 입력 차량별 검증 + 역산
    const inputMap = {};
    input.forEach(r => { if (r.car_number) inputMap[r.car_number] = r; });

    const updates = [];  // {id, paid_total, status}
    const lines = [];
    let totalFullPaid = 0;
    let totalUnpaid = 0;
    let totalFuture = 0;
    const processedCars = new Set();
    const today = new Date().toISOString().slice(0, 10);

    // 1) 차량별 처리 — 과거/당월까지만 완납 대상, 미래는 납부대기 (paid_total=0, status='납부대기')
    Object.entries(billsByCar).forEach(([car, carBills]) => {
      const inputRow = inputMap[car];
      const pastBills = carBills.filter(b => !b.due_date || b.due_date <= today);
      const futureBills = carBills.filter(b => b.due_date && b.due_date > today);

      // 미래 회차 → 납부대기
      futureBills.forEach(b => {
        updates.push({ id: b.id, paid_total: 0, status: '납부대기', payments: [] });
        totalFuture++;
      });

      if (!inputRow || inputRow.unpaid_amount <= 0) {
        // 미수 없음 → 과거분 전체 완납
        pastBills.forEach(b => {
          const due = Number(b.amount) || 0;
          updates.push({ id: b.id, paid_total: due, status: '완납', payments: [] });
          totalFullPaid++;
        });
        processedCars.add(car);
        return;
      }

      // 2) 미수 있음 — 계약자 검증
      const contract = contracts.find(c => c.car_number === car);
      const looksLikeRegNo = /^\d{6}-[\d*]{7}$/.test(inputRow.reg_no);
      if (looksLikeRegNo && contract?.contractor_reg_no && contract.contractor_reg_no !== inputRow.reg_no) {
        lines.push(`⚠ ${car}: 등록번호 불일치 (입력 ${inputRow.reg_no} / DB ${contract.contractor_reg_no}) — 건너뜀`);
        return;
      }

      // 3) 과거분 대상으로 최근 회차부터 역산 — 미수액만큼 미납 처리
      const sorted = [...pastBills].sort((x, y) => String(y.due_date || '').localeCompare(String(x.due_date || '')));
      let remain = inputRow.unpaid_amount;
      let unpaidCount = 0;
      for (const b of sorted) {
        const due = Number(b.amount) || 0;
        if (remain >= due) {
          updates.push({ id: b.id, paid_total: 0, status: '미수', payments: [] });
          remain -= due;
          unpaidCount++;
        } else if (remain > 0) {
          updates.push({ id: b.id, paid_total: due - remain, status: '부분입금', payments: [] });
          remain = 0;
          unpaidCount++;
        } else {
          updates.push({ id: b.id, paid_total: due, status: '완납', payments: [] });
          totalFullPaid++;
        }
      }
      totalUnpaid += unpaidCount;
      processedCars.add(car);
      const futMark = futureBills.length ? ` · 납부대기 ${futureBills.length}회` : '';
      lines.push(`✅ ${car}: 미납 ${unpaidCount}회 (${fmtKR(inputRow.unpaid_amount)}) / 이전 완납 ${sorted.length - unpaidCount}회${futMark}`);
    });

    // 입력에 있는데 회차 없는 차량
    input.forEach(r => {
      if (r.car_number && !processedCars.has(r.car_number)) {
        lines.push(`⚠ ${r.car_number}: 회차 데이터 없음 — 건너뜀`);
      }
    });

    _cutoverPlan = updates;
    // 파싱 샘플 3건 보여주기 (컬럼 매칭 디버그)
    const sampleDbg = input.slice(0, 3).map(r =>
      `  ${r.line}: 차번=[${r.car_number}] 등록=[${r.reg_no}] 미수=${fmtKR(r.unpaid_amount)}`
    ).join('\n');
    const header = `📋 파싱 결과 (${input.length}행):\n${sampleDbg}\n${input.length > 3 ? `  ... 외 ${input.length - 3}행\n` : ''}━━━\n`;
    resultEl.textContent = header + lines.join('\n') +
      `\n\n━━━\n완납 처리: ${totalFullPaid}회 / 미납: ${totalUnpaid}회 / 납부대기(미래): ${totalFuture}회 / 총 ${updates.length}건 변경`;
    applyBtn.disabled = !updates.length;
  });

  $('#cutoverApply')?.addEventListener('click', async () => {
    if (!_cutoverPlan?.length) return;
    if (!confirm(`${_cutoverPlan.length}건 일괄 업데이트합니다.\n(미리보기 결과대로 진행)\n\n진행?`)) return;
    const btn = $('#cutoverApply');
    btn.disabled = true;
    btn.textContent = '처리 중...';
    const resultEl = $('#cutoverResult');
    const now = Date.now();
    const updates = {};
    _cutoverPlan.forEach(p => {
      updates[`billings/${p.id}/paid_total`] = p.paid_total;
      updates[`billings/${p.id}/status`] = p.status;
      updates[`billings/${p.id}/payments`] = p.payments || [];
      updates[`billings/${p.id}/cutover_at`] = now;
      updates[`billings/${p.id}/cutover_note`] = '개시 미수 정산';
    });
    try {
      await update(ref(db), updates);
      resultEl.textContent += `\n\n✅ 완료 — ${_cutoverPlan.length}건 처리됨`;
      _cutoverPlan = null;
      showToast('개시 미수 정산 완료', 'success');
    } catch (e) {
      resultEl.textContent += `\n\n❌ 오류: ${e.message}`;
      showToast(e.message, 'error');
    } finally {
      btn.textContent = '정산 적용';
    }
  });

  // SMS provider 토글 → 알리고일 때만 testmode 표시
  document.querySelectorAll('input[name="smsProvider"]').forEach(r => {
    r.addEventListener('change', (e) => {
      const wrap = $('#aligoTestmodeWrap');
      if (wrap) wrap.hidden = e.target.value !== 'aligo';
    });
  });

  // 잔액 조회 (Solapi)
  $('#solapiBalanceBtn')?.addEventListener('click', async () => {
    const resultEl = $('#smsResult');
    try {
      const r = await fetch('/api/solapi/balance');
      const body = await r.json();
      resultEl.textContent = JSON.stringify(body, null, 2);
      if (body.ok) showToast(`잔액 조회 OK`, 'success');
      else showToast(body.error || '조회 실패', 'error');
    } catch (err) {
      resultEl.textContent = String(err);
      showToast(err.message, 'error');
    }
  });

  // SMS 테스트 발송 (provider 선택)
  $('#smsSendBtn')?.addEventListener('click', async () => {
    const provider = document.querySelector('input[name="smsProvider"]:checked')?.value || 'solapi';
    const to = $('#smsTo')?.value?.trim();
    const msg = $('#smsMsg')?.value?.trim();
    const testmode = $('#smsTestmode')?.checked;
    const resultEl = $('#smsResult');
    const btn = $('#smsSendBtn');
    if (!to) { showToast('수신번호 입력', 'error'); return; }

    const isReal = provider === 'solapi' || !testmode;
    if (isReal && !confirm(`실제 발송합니다 (${provider}). 수신: ${to}\n진행?`)) return;

    const url = provider === 'solapi' ? '/api/solapi/sms' : '/api/aligo/sms';
    const payload = provider === 'solapi' ? { to, msg } : { to, msg, testmode };

    try {
      btn.disabled = true;
      btn.textContent = '발송 중...';
      resultEl.textContent = '';
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await r.json();
      resultEl.textContent = JSON.stringify(body, null, 2);
      if (body.ok) showToast(isReal ? '발송 요청 성공' : '테스트 모드 성공', 'success');
      else showToast(body.error || '발송 실패', 'error');
    } catch (err) {
      resultEl.textContent = String(err);
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'SMS 발송';
    }
  });
}

async function refreshCount(col) {
  const el = $(`#dev_count_${col}`);
  if (!el) return;
  try {
    const snap = await get(ref(db, col));
    if (!snap.exists()) { el.textContent = '0건'; return; }
    const all = Object.values(snap.val());
    const active = all.filter(v => v.status !== 'deleted');
    el.textContent = `${active.length}건 (삭제포함 ${all.length})`;
  } catch { el.textContent = '조회 실패'; }
}
