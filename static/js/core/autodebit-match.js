/**
 * autodebit-match.js — 자동이체 ↔ 통장입금 매칭
 *
 * 입력: autodebits (등록 목록), bankTransactions (입금 거래)
 * 출력: 매칭 결과 [{autodebit, transaction?, status}]
 */

const DAY_MS = 86400000;
const AUTO_DEBIT_KEYWORDS = /자동이체|CMS|카드자동|집금/i;

/**
 * @param {Array} autodebits — [{contract_code, customer_name, amount, debit_day, ...}]
 * @param {Array} bankTxns — [{date, amount, direction, counterparty, summary, ...}]
 * @param {Date} referenceDate — 기준일 (보통 오늘)
 * @returns {Array} 매칭 결과
 */
export function matchAutoDebits(autodebits, bankTxns, referenceDate = new Date()) {
  const refYm = referenceDate.toISOString().slice(0, 7); // YYYY-MM
  const results = [];

  // 입금만 필터
  const incoming = bankTxns.filter(t => {
    const dir = t.direction;
    return dir === 'in' || dir === '입금';
  });

  // 자동이체 키워드 포함된 입금만
  const autoIncoming = incoming.filter(t => AUTO_DEBIT_KEYWORDS.test(`${t.summary || ''} ${t.counterparty || ''} ${t.memo || ''}`));

  // 이번달 활성 자동이체만
  const activeDebits = autodebits.filter(d => d.status === '사용중' || d.status === '등록' || !d.status);
  const usedTxnIds = new Set();

  for (const debit of activeDebits) {
    // 이번달 예정일 계산
    const debitDay = debit.debit_day === '말일' ? daysInMonth(refYm) : Number(debit.debit_day);
    if (!debitDay) continue;
    const scheduledDate = new Date(`${refYm}-${String(debitDay).padStart(2, '0')}T00:00:00`);

    // 허용 범위: 전 5일 ~ 후 14일 (연휴/주말 고려 — 추석·설 대비)
    const rangeFrom = scheduledDate.getTime() - 5 * DAY_MS;
    const rangeTo = scheduledDate.getTime() + 14 * DAY_MS;

    // 후보 찾기
    const candidates = autoIncoming.filter(t => {
      if (usedTxnIds.has(txnId(t))) return false;
      const tMs = new Date(t.date).getTime();
      if (tMs < rangeFrom || tMs > rangeTo) return false;
      return true;
    });

    // 점수 계산
    let best = null;
    let bestScore = 0;
    const debitAmount = Number(debit.amount) || 0;

    for (const c of candidates) {
      let score = 0;
      const cAmount = Number(c.amount) || 0;

      // 금액 매칭 — 입금은 수수료(건당 200~1,500원) 빼고 들어옴
      // 정상: cAmount = debitAmount - 수수료 (debit보다 약간 적음)
      const diff = debitAmount - cAmount;  // 양수 = 수수료만큼 적게 입금
      if (diff === 0) score += 5;                    // 수수료 없는 경우
      else if (diff > 0 && diff <= 1500) score += 5; // 정상 수수료 차감 (최대 1,500원)
      else if (diff > 0 && diff <= 3000) score += 4; // 수수료 조금 큰 경우
      else continue;  // 금액 범위 벗어나면 후보 제외

      // 이름 매칭 (CMS 집금이 아니면)
      const cName = String(c.counterparty || '').trim();
      const dName = String(debit.customer_name || '').trim();
      if (cName && dName) {
        if (cName === dName) score += 3;
        else if (cName.includes(dName) || dName.includes(cName)) score += 2;
      }

      // 날짜 가까울수록 가산
      const tMs = new Date(c.date).getTime();
      const dayDiff = Math.abs(Math.round((tMs - scheduledDate.getTime()) / DAY_MS));
      if (dayDiff === 0) score += 2;
      else if (dayDiff <= 2) score += 1;

      if (score > bestScore) { bestScore = score; best = c; }
    }

    // 오늘 기준 예정일 +5일 지났는지 (미납 판단)
    const pastDue = referenceDate.getTime() > rangeTo;

    if (best && bestScore >= 5) {
      usedTxnIds.add(txnId(best));
      results.push({
        autodebit: debit,
        transaction: best,
        scheduled_date: isoDate(scheduledDate),
        actual_date: best.date,
        status: bestScore >= 7 ? 'matched' : 'candidate',
        score: bestScore,
      });
    } else {
      results.push({
        autodebit: debit,
        transaction: null,
        scheduled_date: isoDate(scheduledDate),
        actual_date: null,
        status: pastDue ? 'overdue' : 'pending',
      });
    }
  }

  // 미매칭 자동이체 입금 (등록 안 된 것)
  const unmatchedIn = autoIncoming.filter(t => !usedTxnIds.has(txnId(t)));
  unmatchedIn.forEach(t => {
    results.push({
      autodebit: null,
      transaction: t,
      status: 'unregistered',
    });
  });

  return results;
}

function txnId(t) {
  return t.event_id || t.raw_key || `${t.date}_${t.amount}_${t.counterparty || ''}`;
}

function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

function isoDate(d) { return d.toISOString().slice(0, 10); }

/**
 * CMS 합산 입금 매칭 — 입금액과 일치하는 자동이체 조합 찾기
 *
 * @param {Array} candidates — 이번달 대상 자동이체들
 * @param {number} depositAmount — 실제 입금액
 * @param {number} feePerItem — 건당 수수료 (기본 500원)
 * @returns {{debits: Array, totalFee: number, matched: boolean} | null}
 */
export function findCMSSubset(candidates, depositAmount, feePerItem = 500) {
  if (!candidates.length || !depositAmount) return null;

  // ① 전체 매칭 먼저 시도
  const allSum = candidates.reduce((s, d) => s + Number(d.amount || 0), 0);
  const allFee = candidates.length * feePerItem;
  if (Math.abs(allSum - allFee - depositAmount) <= 500) {
    return { debits: [...candidates], totalFee: allFee, matched: true };
  }

  // ② 부분 조합 찾기 (작은 N이면 완전탐색, 크면 휴리스틱)
  if (candidates.length <= 20) {
    return subsetSumExact(candidates, depositAmount, feePerItem);
  }
  return subsetSumGreedy(candidates, depositAmount, feePerItem);
}

/** 완전탐색 (N ≤ 20) */
function subsetSumExact(items, target, feePerItem) {
  const n = items.length;
  let bestSubset = null;
  let bestDiff = Infinity;
  for (let mask = 1; mask < (1 << n); mask++) {
    const subset = [];
    let sum = 0;
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        subset.push(items[i]);
        sum += Number(items[i].amount) || 0;
      }
    }
    const fee = subset.length * feePerItem;
    const diff = Math.abs(sum - fee - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestSubset = subset;
      if (diff === 0) break;
    }
  }
  if (bestSubset && bestDiff <= 500) {
    return { debits: bestSubset, totalFee: bestSubset.length * feePerItem, matched: true };
  }
  return null;
}

/** 휴리스틱 (N > 20) — 금액 큰 순부터 그리디 */
function subsetSumGreedy(items, target, feePerItem) {
  const sorted = [...items].sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0));
  const chosen = [];
  let sum = 0;
  for (const item of sorted) {
    const itemAmt = Number(item.amount) || 0;
    const newSum = sum + itemAmt;
    const newFee = (chosen.length + 1) * feePerItem;
    if (newSum - newFee <= target + 500) {
      chosen.push(item);
      sum = newSum;
      if (Math.abs(sum - newFee - target) <= 500) break;
    }
  }
  const fee = chosen.length * feePerItem;
  if (Math.abs(sum - fee - target) <= 500) {
    return { debits: chosen, totalFee: fee, matched: true };
  }
  return null;
}

/** 기존 호환 — 단순 합계 매칭 */
export function distributeCMSCollection(autodebits, cmsTxn) {
  const active = autodebits.filter(d => (d.status === '사용중' || d.status === '등록' || !d.status));
  return findCMSSubset(active, Number(cmsTxn.amount) || 0);
}
