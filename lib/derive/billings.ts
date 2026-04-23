/**
 * 계약 → billings 자동 파생.
 * 계약 저장 직후 호출: rent_months × 월별 청구 레코드 생성.
 *
 *   1회차 due_date = start_date 이후 첫 auto_debit_day
 *   N회차 due_date = 1회차 + (N-1) 개월
 */
import { ref, push, set, serverTimestamp, get, query, orderByChild, equalTo } from 'firebase/database';
import { getRtdb } from '@/lib/firebase/rtdb';
import { genBillingCode } from '@/lib/code-gen';
import type { RtdbContract } from '@/lib/types/rtdb-entities';

function pad(n: number) { return String(n).padStart(2, '0'); }

/** start_date 이후의 첫 auto_debit_day (YYYY-MM-DD) */
function firstDueDate(startDate: string, debitDay: number): string {
  const s = new Date(startDate);
  const candidate = new Date(s.getFullYear(), s.getMonth(), debitDay);
  // 결제일이 start_date 이전이면 다음 달
  if (candidate < s) candidate.setMonth(candidate.getMonth() + 1);
  return `${candidate.getFullYear()}-${pad(candidate.getMonth() + 1)}-${pad(candidate.getDate())}`;
}

/** 월 더하기 (31일 보정) */
function addMonths(date: string, n: number): string {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + n);
  // 원래 결제일 복원 (예: 31일 → 2월 28일 방지)
  if (d.getDate() !== day) d.setDate(0);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface DeriveResult {
  created: number;
  skipped: number;   // 기존 billings 있으면 skip
  reason?: string;
  cutoverPaid?: number;  // 초기 미수 기준으로 납부처리된 회차 수
}

export interface DeriveOptions {
  /**
   * 계약 이관 시 현재 미수금.
   *   - 오늘 기준 과거 회차 총액에서 이 값을 뺀 만큼을 선납처리
   *   - 마지막 선납 회차는 부분납 허용
   *   - 미래 회차(today 이전 아님)는 `paid_total: 0` (수납대기)
   *   - 생략/0이면 전 회차 `paid_total: 0`
   */
  initialUnpaid?: number;
}

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * 계약에서 billings 자동 생성. 이미 있으면 skip.
 * @returns 생성된 건수
 */
export async function deriveBillingsFromContract(
  contract: RtdbContract,
  options: DeriveOptions = {},
): Promise<DeriveResult> {
  const code = contract.contract_code;
  if (!code) return { created: 0, skipped: 0, reason: 'contract_code 없음' };
  if (!contract.start_date) return { created: 0, skipped: 0, reason: 'start_date 없음' };
  if (!contract.rent_months || contract.rent_months <= 0) return { created: 0, skipped: 0, reason: 'rent_months 없음' };
  if (!contract.rent_amount || contract.rent_amount <= 0) return { created: 0, skipped: 0, reason: 'rent_amount 없음' };

  const debitDay = Number(contract.auto_debit_day) || 25;  // 기본 25일
  if (debitDay < 1 || debitDay > 31) return { created: 0, skipped: 0, reason: 'auto_debit_day 범위오류' };

  const db = getRtdb();

  // 기존 billings 존재 체크
  const existing = await get(
    query(ref(db, 'billings'), orderByChild('contract_code'), equalTo(code)),
  );
  if (existing.exists()) {
    const entries = Object.values(existing.val() as Record<string, { status?: string }>);
    const active = entries.filter((b) => b?.status !== 'deleted');
    if (active.length > 0) return { created: 0, skipped: active.length, reason: '기존 billings 존재' };
  }

  const first = firstDueDate(contract.start_date, debitDay);
  const amount = Number(contract.rent_amount);
  const months = Number(contract.rent_months);

  // 회차별 due_date 미리 계산
  const dueDates: string[] = [];
  for (let i = 0; i < months; i++) {
    dueDates.push(i === 0 ? first : addMonths(first, i));
  }

  // 이관 선납 산정: 과거 회차 총액 − initialUnpaid = 선납액
  const t = todayYmd();
  const initialUnpaid = Math.max(0, Number(options.initialUnpaid) || 0);
  const pastCount = dueDates.filter((d) => d < t).length;
  const pastTotalDue = pastCount * amount;
  let prepaid = Math.max(0, pastTotalDue - initialUnpaid);
  let cutoverPaid = 0;

  let created = 0;
  for (let i = 0; i < months; i++) {
    const dueDate = dueDates[i];
    const isPast = dueDate < t;

    let paidTotal = 0;
    if (isPast && prepaid > 0) {
      paidTotal = Math.min(amount, prepaid);
      prepaid -= paidTotal;
      if (paidTotal > 0) cutoverPaid++;
    }

    const r = push(ref(db, 'billings'));
    await set(r, {
      billing_code: genBillingCode(),
      contract_code: code,
      customer_code: contract.customer_code,
      car_number: contract.car_number,
      partner_code: contract.partner_code,
      bill_count: i + 1,
      due_date: dueDate,
      amount,
      paid_total: paidTotal,
      installments: [],
      status: 'active',
      derived_from: 'contract',
      contract_key: contract._key,
      ...(paidTotal > 0 ? { paid_cutover: true } : {}),
      created_at: Date.now(),
      updated_at: serverTimestamp(),
    });
    created++;
  }

  return { created, skipped: 0, cutoverPaid };
}

export interface ReturnExtraCharge {
  kind: '과주행' | '연료부족' | '손상수리';
  amount: number;
}

/**
 * 반납 추가청구 → billings 추가 행 생성.
 * 기존 회차 뒤로 연번 부여. amount가 0/undefined이면 스킵.
 */
export async function deriveBillingsFromReturnExtras(params: {
  contract: RtdbContract;
  returnDate: string;
  eventKey: string;
  charges: ReturnExtraCharge[];
}): Promise<{ created: number }> {
  const { contract, returnDate, eventKey, charges } = params;
  const code = contract.contract_code;
  if (!code) return { created: 0 };
  const active = charges.filter((c) => c.amount && c.amount > 0);
  if (active.length === 0) return { created: 0 };

  const db = getRtdb();
  const existing = await get(
    query(ref(db, 'billings'), orderByChild('contract_code'), equalTo(code)),
  );
  let maxBillCount = 0;
  if (existing.exists()) {
    for (const b of Object.values(existing.val() as Record<string, { bill_count?: number; status?: string }>)) {
      if (b?.status === 'deleted') continue;
      if ((b?.bill_count ?? 0) > maxBillCount) maxBillCount = b.bill_count ?? 0;
    }
  }

  let created = 0;
  for (const c of active) {
    const r = push(ref(db, 'billings'));
    maxBillCount += 1;
    await set(r, {
      billing_code: genBillingCode(),
      contract_code: code,
      customer_code: contract.customer_code,
      car_number: contract.car_number,
      partner_code: contract.partner_code,
      bill_count: maxBillCount,
      due_date: returnDate,
      amount: c.amount,
      paid_total: 0,
      installments: [],
      status: 'active',
      derived_from: 'return_extra',
      extra_kind: c.kind,
      event_key: eventKey,
      contract_key: contract._key,
      created_at: Date.now(),
      updated_at: serverTimestamp(),
    });
    created++;
  }
  return { created };
}
