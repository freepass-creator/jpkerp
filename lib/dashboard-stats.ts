/**
 * dashboard-stats.ts — 기존 jpkerp home.js 미결업무 6종 집계 로직 이식
 *
 * 입력: assets, contracts, billings, events (RTDB 그대로)
 * 출력: 대시보드 요약 오브젝트
 */

interface AnyRecord {
  [k: string]: unknown;
}

interface Contract extends AnyRecord {
  status?: string;
  contractor_name?: string;
  start_date?: string;
  end_date?: string;
  rent_months?: number;
  contract_code?: string;
  car_number?: string;
  contract_status?: string;
  created_at?: number;
}

interface Billing extends AnyRecord {
  contract_code?: string;
  due_date?: string;
  paid_total?: number;
  amount?: number;
  installments?: { amount?: number }[];
}

interface Event extends AnyRecord {
  type?: string;
  date?: string;
  contract_code?: string;
  car_number?: string;
  accident_status?: string;
  work_status?: string;
  contact_result?: string;
  collect_result?: string;
  match_status?: string;
  amount?: number;
}

function normalizeDate(s?: string): string {
  if (!s) return '';
  let v = String(s).trim().replace(/[./]/g, '-');
  const m = v.match(/^(\d{2})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const yy = Number(m[1]);
    v = `${yy < 50 ? 2000 + yy : 1900 + yy}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  return v;
}

function computeContractEnd(c: Contract): string {
  if (c.end_date) return normalizeDate(c.end_date);
  const start = normalizeDate(c.start_date);
  if (!start || !c.rent_months) return '';
  const d = new Date(start);
  if (Number.isNaN(d.getTime())) return '';
  d.setMonth(d.getMonth() + Number(c.rent_months));
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function computeTotalDue(b: Billing): number {
  if (b.installments && Array.isArray(b.installments)) {
    return b.installments.reduce(
      (s, i) => s + (Number(i.amount) || 0),
      0,
    );
  }
  return Number(b.amount) || 0;
}

export interface DashboardStats {
  active_contracts: number;
  total_assets: number;
  idle_assets: number;
  utilization_rate: number;
  month_new_contracts: number;
  month_expiring_14d: number;
  total_unpaid: number;
  overdue_count: number;
  overdue_amount: number;
  pending_tasks: {
    not_delivered: number;
    unmatched_bank: number;
    open_accidents: number;
    open_works: number;
    open_contacts: number;
    open_collects: number;
    unpaid_deductibles: number;
  };
}

export function computeDashboardStats({
  assets,
  contracts,
  billings,
  events,
}: {
  assets: AnyRecord[];
  contracts: Contract[];
  billings: Billing[];
  events: Event[];
}): DashboardStats {
  const today = new Date().toISOString().slice(0, 10);
  const todayDate = new Date(today);
  const thisMonth = today.slice(0, 7);

  // 활성 계약 / 가동 차량
  const activeContracts = contracts.filter((c) => {
    if (c.status === 'deleted') return false;
    if (!c.contractor_name || !String(c.contractor_name).trim()) return false;
    const start = normalizeDate(c.start_date);
    const end = computeContractEnd(c);
    if (!start) return false;
    if (!end) return start <= today;
    return start <= today && end >= today;
  });
  const activeCars = new Set(
    activeContracts.map((c) => c.car_number).filter(Boolean) as string[],
  );
  const total_assets = assets.length;
  const activating = activeCars.size;
  const utilization_rate = total_assets
    ? Math.round((activating / total_assets) * 100)
    : 0;

  // 이번달 신규
  const month_new_contracts = contracts.filter((c) => {
    const created = c.created_at
      ? new Date(Number(c.created_at)).toISOString().slice(0, 7)
      : '';
    return created === thisMonth;
  }).length;

  // 14일 이내 만기
  const month_expiring_14d = contracts.filter((c) => {
    const end = computeContractEnd(c);
    if (!end) return false;
    const diff = Math.floor(
      (new Date(end).getTime() - todayDate.getTime()) / 86400000,
    );
    return diff >= 0 && diff <= 14;
  }).length;

  // 미납 집계
  const totalDue = billings.reduce((s, b) => s + computeTotalDue(b), 0);
  const totalPaid = billings.reduce(
    (s, b) => s + (Number(b.paid_total) || 0),
    0,
  );
  const total_unpaid = totalDue - totalPaid;

  const overdueBills = billings.filter((b) => {
    const due = computeTotalDue(b);
    const paid = Number(b.paid_total) || 0;
    return paid < due && b.due_date && b.due_date < today;
  });
  const overdue_count = overdueBills.length;
  const overdue_amount = overdueBills.reduce(
    (s, b) => s + computeTotalDue(b) - (Number(b.paid_total) || 0),
    0,
  );

  // 6종 미결업무
  const deliveryByContract = new Set(
    events
      .filter((e) => e.type === 'delivery' && e.contract_code)
      .map((e) => e.contract_code as string),
  );
  const deliveryByCar = new Set(
    events
      .filter((e) => e.type === 'delivery')
      .map((e) => e.car_number as string),
  );

  const not_delivered = contracts.filter((c) => {
    if (c.status === 'deleted') return false;
    if (!c.contractor_name) return false;
    const start = normalizeDate(c.start_date);
    if (!start || start > today) return false;
    if (c.contract_status !== '계약진행') return false;
    return (
      !deliveryByContract.has(c.contract_code ?? '') &&
      !deliveryByCar.has(c.car_number ?? '')
    );
  }).length;

  const unmatched_bank = events.filter(
    (e) =>
      (e.type === 'bank_tx' || e.type === 'card_tx') &&
      (!e.match_status ||
        e.match_status === 'unmatched' ||
        e.match_status === 'candidate'),
  ).length;

  const open_accidents = events.filter(
    (e) =>
      e.type === 'accident' &&
      e.accident_status &&
      !['종결', '완료', '처리완료'].includes(e.accident_status),
  ).length;

  const open_works = events.filter(
    (e) =>
      ['maint', 'maintenance', 'repair', 'product', 'wash'].includes(
        e.type ?? '',
      ) &&
      e.work_status &&
      e.work_status !== '완료',
  ).length;

  const open_contacts = events.filter(
    (e) =>
      e.type === 'contact' &&
      e.contact_result &&
      ['진행중', '보류', '처리불가'].includes(e.contact_result),
  ).length;

  const open_collects = events.filter(
    (e) =>
      e.type === 'collect' &&
      e.collect_result &&
      e.collect_result !== '즉시납부',
  ).length;

  // 면책금 미수 — 사고 이벤트 중 deductible_status가 '미수'인 건
  const unpaid_deductibles = events.filter(
    (e) => e.type === 'accident' && e.deductible_status === '미수',
  ).length;

  return {
    active_contracts: activeContracts.length,
    total_assets,
    idle_assets: total_assets - activating,
    utilization_rate,
    month_new_contracts,
    month_expiring_14d,
    total_unpaid,
    overdue_count,
    overdue_amount,
    pending_tasks: {
      not_delivered,
      unmatched_bank,
      open_accidents,
      open_works,
      open_contacts,
      open_collects,
      unpaid_deductibles,
    },
  };
}
