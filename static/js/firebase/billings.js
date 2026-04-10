/**
 * billings.js — 수납 회차 컬렉션
 * 키: billing_id (자동 채번 BL00001)
 *
 * 한 계약 (CT00001) → N개월짜리 → N개 회차 (BL00001~BL00012)
 */
import {
  watchCollection, fetchOne, setRecord, updateRecord, softDelete, nextSequence, isNotDeleted,
} from './db.js';

const PATH = 'billings';

export function watchBillings(callback, options = {}) {
  return watchCollection(PATH, callback, {
    sort: options.sort || ((a, b) => (a.seq || 0) - (b.seq || 0)),
    ...options,
  });
}

export async function getBilling(id) {
  return fetchOne(`${PATH}/${id}`);
}

export async function saveBilling(data) {
  const id = await nextSequence('billing', 'BL');
  const now = Date.now();
  const record = {
    ...data,
    billing_id: id,
    status: data.status || '미수',
    paid_total: Number(data.paid_total) || 0,
    payments: data.payments || [],
    created_at: now,
    updated_at: now,
  };
  await setRecord(`${PATH}/${id}`, record);
  return record;
}

export async function updateBilling(id, data) {
  return updateRecord(`${PATH}/${id}`, data);
}

export async function deleteBilling(id) {
  return softDelete(`${PATH}/${id}`);
}

// ─── 회차 자동 생성 ────────────────────────────────────────────
function parseFlexDate(s) {
  if (!s) return null;
  if (s instanceof Date) return isNaN(s.getTime()) ? null : s;
  let v = String(s).trim().replace(/[./]/g, '-');
  const m = v.match(/^(\d{2})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const yy = Number(m[1]);
    v = `${yy < 50 ? 2000 + yy : 1900 + yy}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export async function generateBillingsForContract(contract) {
  const months = Number(contract.rent_months) || 0;
  const amount = Number(String(contract.rent_amount || '').replace(/,/g, '')) || 0;
  const debitDayRaw = String(contract.auto_debit_day || '').trim();
  const isLastDay = ['말일', '말'].includes(debitDayRaw);
  const debitDay = isLastDay ? 31 : (Number(debitDayRaw) || 25);
  const start = parseFlexDate(contract.start_date);
  if (!months || !amount || !start || !contract.contract_code) {
    return { created: 0, reason: '필수 정보 부족' };
  }

  const tasks = [];
  for (let i = 0; i < months; i++) {
    const d = isLastDay
      ? new Date(start.getFullYear(), start.getMonth() + i + 1, 0)
      : new Date(start.getFullYear(), start.getMonth() + i, debitDay);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    tasks.push(saveBilling({
      contract_code: contract.contract_code,
      contractor_code: contract.contractor_code || '',
      contractor_name: contract.contractor_name || '',
      car_number: contract.car_number || '',
      seq: i + 1,
      due_month: `${yyyy}-${mm}`,
      due_date: `${yyyy}-${mm}-${dd}`,
      amount,
      status: '미수',
    }).catch(e => { console.error(`회차 ${i+1}`, e); return null; }));
  }
  const results = await Promise.all(tasks);
  return { created: results.filter(Boolean).length, total: months };
}

/** 회차의 최종 청구액 = 기본 amount + adjustments 합계 */
export function computeTotalDue(billing) {
  const base = Number(billing?.amount) || 0;
  const adj = Array.isArray(billing?.adjustments) ? billing.adjustments : [];
  return adj.reduce((s, a) => s + (Number(a.amount) || 0), base);
}

// ─── 입금 추가 (부분/초과 자동 처리) ───────────────────────────
export async function addPaymentToBilling(billingId, payment) {
  const cur = await getBilling(billingId);
  if (!cur) throw new Error('청구건을 찾을 수 없습니다.');
  const payments = Array.isArray(cur.payments) ? [...cur.payments] : [];
  const amt = Number(String(payment.amount || '').replace(/,/g, '')) || 0;
  payments.push({
    method: payment.method || '',
    date: payment.date || '',
    amount: amt,
    note: payment.note || '',
    source_event_id: payment.source_event_id || '',
  });
  const totalPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const totalDue = computeTotalDue(cur);
  const status = totalPaid >= totalDue ? '완납' : (totalPaid > 0 ? '부분입금' : '미수');
  await updateBilling(billingId, { payments, paid_total: totalPaid, status });

  // 초과입금 → 다음 미납 회차로 자동 이월
  let overflow = totalPaid - totalDue;
  if (overflow > 0 && cur.contract_code) {
    const all = await new Promise((resolve) => {
      const unsub = watchBillings((items) => { unsub(); resolve(items); });
    });
    const siblings = all
      .filter(b => b.contract_code === cur.contract_code && (b.seq || 0) > (cur.seq || 0))
      .sort((a, b) => (a.seq || 0) - (b.seq || 0));

    for (const next of siblings) {
      if (overflow <= 0) break;
      const nextDue = computeTotalDue(next);
      const nextPaid = Number(next.paid_total) || 0;
      const nextRemain = nextDue - nextPaid;
      if (nextRemain <= 0) continue;
      const apply = Math.min(overflow, nextRemain);
      const nextPayments = Array.isArray(next.payments) ? [...next.payments] : [];
      nextPayments.push({
        method: '이월',
        date: payment.date,
        amount: apply,
        note: `${cur.seq}회차 초과입금 이월`,
        source_event_id: payment.source_event_id || '',
      });
      const newPaid = nextPaid + apply;
      const newStatus = newPaid >= nextDue ? '완납' : (newPaid > 0 ? '부분입금' : '미수');
      await updateBilling(next.billing_id, { payments: nextPayments, paid_total: newPaid, status: newStatus });
      overflow -= apply;
    }
  }
  return { ok: true, totalPaid, status };
}

export async function removePaymentFromBilling(billingId, paymentIndex) {
  const cur = await getBilling(billingId);
  if (!cur) throw new Error('청구건을 찾을 수 없습니다.');
  const payments = Array.isArray(cur.payments) ? [...cur.payments] : [];
  payments.splice(paymentIndex, 1);
  const totalPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const totalDue = computeTotalDue(cur);
  const status = totalPaid >= totalDue ? '완납' : (totalPaid > 0 ? '부분입금' : '미수');
  return updateBilling(billingId, { payments, paid_total: totalPaid, status });
}

// ─── 조정 항목 추가/삭제 ───────────────────────────────────────
/**
 * @param {string} billingId
 * @param {object} adjustment
 *   type:    'add' | 'discount'  — UI 구분용
 *   label:   '과태료 대납' / '정비비 할인' 등
 *   amount:  부호 포함 (할인은 음수)
 *   date:    '2026-04-09'
 *   note:    선택
 */
export async function addAdjustmentToBilling(billingId, adjustment) {
  const cur = await getBilling(billingId);
  if (!cur) throw new Error('청구건을 찾을 수 없습니다.');
  const adjustments = Array.isArray(cur.adjustments) ? [...cur.adjustments] : [];
  const rawAmt = Number(String(adjustment.amount || '').replace(/,/g, '')) || 0;
  // type 이 discount 면 무조건 음수, add 면 양수
  const signed = adjustment.type === 'discount' ? -Math.abs(rawAmt) : Math.abs(rawAmt);
  adjustments.push({
    type: adjustment.type || 'add',
    label: adjustment.label || '',
    amount: signed,
    date: adjustment.date || '',
    note: adjustment.note || '',
    created_at: Date.now(),
  });
  const newCur = { ...cur, adjustments };
  const totalDue = computeTotalDue(newCur);
  const totalPaid = Number(cur.paid_total) || 0;
  const status = totalPaid >= totalDue ? '완납' : (totalPaid > 0 ? '부분입금' : '미수');
  return updateBilling(billingId, { adjustments, status });
}

export async function removeAdjustmentFromBilling(billingId, adjIndex) {
  const cur = await getBilling(billingId);
  if (!cur) throw new Error('청구건을 찾을 수 없습니다.');
  const adjustments = Array.isArray(cur.adjustments) ? [...cur.adjustments] : [];
  adjustments.splice(adjIndex, 1);
  const newCur = { ...cur, adjustments };
  const totalDue = computeTotalDue(newCur);
  const totalPaid = Number(cur.paid_total) || 0;
  const status = totalPaid >= totalDue ? '완납' : (totalPaid > 0 ? '부분입금' : '미수');
  return updateBilling(billingId, { adjustments, status });
}
