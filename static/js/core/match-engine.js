/**
 * match-engine.js — 렌터카 ERP 통합 매칭 엔진
 *
 * 통장 거래 하나가 올라오면 3가지를 동시에 처리:
 *   1. 입출금 재무 정리 (events 저장 — 순수 거래 기록)
 *   2. 입금 → 계약/회차 매칭 → 수납 처리 (billings payment 추가)
 *   3. 출금 → 항목별 분류 (할부/보험/정비/과태료/이체수수료/기타)
 *
 * 매칭 학습:
 *   같은 이름으로 입금한 이력 → localStorage에 저장
 *   다음에 같은 이름 오면 차량/계약까지 자동 매칭
 */

const CAR_PATTERN = /(\d{2,3}[가-힣]\d{4})/;
const NAME_CAR_PATTERN = /^(.+?)[\(\[（](.+?)[\)\]）]/;

// ─── 매칭 이력 (학습) ──────────────────────────────────────
const HISTORY_KEY = 'jpk.match.history';
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || {}; } catch { return {}; }
}
function saveHistory(h) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
}

// ─── 내용 파싱 ─────────────────────────────────────────────
function parseCounterparty(text) {
  const s = String(text || '').trim();
  const result = { name: '', car: '', raw: s };

  const nc = NAME_CAR_PATTERN.exec(s);
  if (nc) {
    result.name = nc[1].trim();
    const inner = nc[2].trim();
    if (CAR_PATTERN.test(inner)) result.car = inner;
    return result;
  }

  const cm = CAR_PATTERN.exec(s);
  if (cm) {
    result.car = cm[1];
    result.name = s.replace(cm[0], '').trim();
    return result;
  }

  result.name = s;
  return result;
}

// ─── 출금 항목 분류 ─────────────────────────────────────────
const EXPENSE_RULES = [
  { pattern: /할부|캐피탈|저축은행|리스|오릭스|하나캐|KB캐|현대캐|BNK캐|JB우리/i, category: '할부금', type: 'loan' },
  { pattern: /보험|삼성화재|현대해상|DB손해|KB손보|메리츠|한화손해/i, category: '보험료', type: 'insurance' },
  { pattern: /정비|오일|타이어|세차|광택|수리|부품/i, category: '정비비', type: 'maintenance' },
  { pattern: /과태료|범칙금|주정차|교통/i, category: '과태료', type: 'penalty' },
  { pattern: /주유|충전|SK에너지|GS칼텍스|S-OIL|현대오일/i, category: '유류비', type: 'fuel' },
  { pattern: /CMS|수수료|이체수수료|자동이체/i, category: '수수료', type: 'fee' },
  { pattern: /급여|월급|상여|인건비/i, category: '인건비', type: 'salary' },
  { pattern: /임대|월세|관리비|공과금|전기|수도|가스/i, category: '임차료', type: 'rent' },
  { pattern: /세금|국세|지방세|부가세|원천/i, category: '세금', type: 'tax' },
];

function classifyExpense(event) {
  const text = `${event.counterparty || ''} ${event.summary || ''} ${event.memo || ''}`;
  for (const rule of EXPENSE_RULES) {
    if (rule.pattern.test(text)) {
      return { category: rule.category, type: rule.type };
    }
  }
  return { category: '기타지출', type: 'etc' };
}

// ─── 입금 매칭 ──────────────────────────────────────────────
function matchIncome(event, ctx) {
  const { contracts = [], billings = [] } = ctx;
  const { name, car, raw } = parseCounterparty(event.counterparty);
  const amount = Number(event.amount) || 0;
  const date = event.date || '';
  const history = loadHistory();

  // CMS/카드 일괄
  if (/CMS|카드자동|자동집금|일괄/i.test(raw)) {
    return {
      status: 'bulk',
      category: '일괄입금',
      matches: [],
      reason: '자동이체/카드 일괄 — 명세 매칭 필요',
      parsed: { name, car, raw },
    };
  }

  // 계약 검색
  let candidates = [];

  // 차량번호로
  if (car) {
    candidates = contracts.filter(c => c.car_number && c.car_number.includes(car));
  }

  // 이름으로
  if (!candidates.length && name) {
    candidates = contracts.filter(c => {
      const cName = String(c.contractor_name || '').trim();
      return cName && (cName === name || cName.includes(name) || name.includes(cName));
    });
  }

  // 이력에서
  if (!candidates.length && name && history[name]?.contract_code) {
    const hc = contracts.find(c => c.contract_code === history[name].contract_code);
    if (hc) candidates = [hc];
  }

  if (!candidates.length) {
    return {
      status: 'unmatched',
      category: '미매칭입금',
      matches: [],
      reason: `매칭 실패: "${raw}"`,
      parsed: { name, car, raw },
    };
  }

  // 미납 회차 매칭
  const results = [];
  for (const contract of candidates) {
    const unpaid = billings
      .filter(b => b.contract_code === contract.contract_code)
      .filter(b => (Number(b.paid_total) || 0) < (Number(b.amount) || 0))
      .sort((a, b) => (a.seq || 0) - (b.seq || 0));

    const exact = unpaid.find(b => ((Number(b.amount) || 0) - (Number(b.paid_total) || 0)) === amount);

    if (exact) {
      results.push({
        contract_code: contract.contract_code,
        contractor_name: contract.contractor_name,
        car_number: contract.car_number,
        billing_id: exact.billing_id,
        seq: exact.seq,
        confidence: 'high',
      });
    } else if (unpaid.length) {
      results.push({
        contract_code: contract.contract_code,
        contractor_name: contract.contractor_name,
        car_number: contract.car_number,
        billing_id: unpaid[0].billing_id,
        seq: unpaid[0].seq,
        confidence: 'low',
      });
    }
  }

  if (!results.length) {
    return {
      status: 'unmatched',
      category: '미매칭입금',
      matches: [],
      reason: '계약 있으나 미납 회차 없음',
      parsed: { name, car, raw },
    };
  }

  const best = results.find(r => r.confidence === 'high') || results[0];
  const status = best.confidence === 'high' ? 'auto' : 'candidate';

  // 학습 저장
  if (name && best.contract_code) {
    history[name] = {
      contract_code: best.contract_code,
      car_number: best.car_number,
      contractor_name: best.contractor_name,
      last_date: date,
    };
    if (car) history[name].car_hint = car;
    saveHistory(history);
  }

  return {
    status,
    category: '대여료',
    matches: results,
    best,
    reason: status === 'auto'
      ? `${best.contractor_name} ${best.car_number || ''} ${best.seq}회차`
      : `${best.contractor_name} 후보 (금액 불일치)`,
    parsed: { name, car, raw },
  };
}

// ─── 통합 매칭 (입금+출금 동시) ──────────────────────────────
/**
 * @param {object} event — 통장 거래
 * @param {object} ctx — { contracts, billings, customers, assets }
 * @returns {object} {
 *   status: 'auto'|'candidate'|'unmatched'|'bulk',
 *   direction: 'in'|'out',
 *   category: '대여료'|'할부금'|'보험료'|...,
 *   reason: string,
 *   best: { contract_code, billing_id, ... } | null,
 *   parsed: { name, car, raw },
 * }
 */
export function matchEvent(event, ctx) {
  if (event.direction === 'out' || (!event.direction && Number(event.amount) < 0)) {
    // 출금 → 항목 분류
    const exp = classifyExpense(event);
    return {
      status: 'classified',
      direction: 'out',
      category: exp.category,
      expenseType: exp.type,
      reason: exp.category,
      parsed: parseCounterparty(event.counterparty),
      best: null,
      matches: [],
    };
  }

  // 입금 → 계약/수납 매칭
  const result = matchIncome(event, ctx);
  return { ...result, direction: 'in' };
}

/**
 * 배열 일괄 매칭
 */
export function matchEvents(events, ctx) {
  return events.map(ev => ({
    event: ev,
    match: matchEvent(ev, ctx),
  }));
}

/**
 * 매칭 이력
 */
export function getMatchHistory() { return loadHistory(); }
export function clearMatchHistory() { localStorage.removeItem(HISTORY_KEY); }

/**
 * 출금 분류 규칙 (외부 참조용)
 */
export { EXPENSE_RULES, classifyExpense, parseCounterparty };
