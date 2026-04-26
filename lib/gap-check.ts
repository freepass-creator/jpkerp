import { computeContractEnd, today as todayStr } from '@/lib/date-utils';
/**
 * gap-check 엔진 — 4 카테고리(재무·계약·자산·업무) 미결 룰을 데이터에서 derive.
 *
 * 설계 원칙
 *  - 입력은 useRtdbCollection 결과 그대로 (RtdbAsset/RtdbContract/RtdbBilling/RtdbEvent)
 *  - 추가로 insurance·task 등 collection이 필요하면 optional로 받기
 *  - 임계값(D-N)은 alarm AlarmSettings로 외부 주입, 미지정시 DEFAULT 사용
 *  - 출력은 PendingItem[] 단일 배열 → 카테고리별 group은 호출자가 처리
 *  - 카운트 0인 룰은 결과에서 제외
 *  - description은 대상 차번/계약자 요약 (최대 3~4건 + "외 N건")
 */
import { type AlarmSettings, DEFAULT_ALARM_SETTINGS } from '@/lib/types/alarm-settings';
import type { RtdbAsset, RtdbBilling, RtdbContract, RtdbEvent } from '@/lib/types/rtdb-entities';
import { fmt } from '@/lib/utils';

export type PendingCategory = '재무' | '계약' | '자산' | '업무';
export type PendingPriority = 'urgent' | 'warn' | 'normal';
export type GotoMenu = 'finance' | 'contract' | 'asset' | 'journal';

export interface PendingItem {
  id: string;
  category: PendingCategory;
  label: string;
  count: number;
  description: string;
  priority: PendingPriority;
  action: string;
  gotoMenu: GotoMenu;
  /** 클릭시 라우트 (선택). 없으면 카테고리 기본 라우트로 fallback. */
  route?: string;
}

/** 외부에서 추가로 넘길 수 있는 보조 데이터 (insurance·task 등). 모두 optional. */
export interface GapCheckExtra {
  insurances?: readonly InsuranceLike[];
  tasks?: readonly TaskLike[];
}

export interface GapCheckInput {
  assets: readonly RtdbAsset[];
  contracts: readonly RtdbContract[];
  billings: readonly RtdbBilling[];
  events: readonly RtdbEvent[];
  extra?: GapCheckExtra;
  /** 기준일 (YYYY-MM-DD) — 미지정시 today() */
  today?: string;
  /** 알람 임계값 — 미지정시 DEFAULT_ALARM_SETTINGS */
  alarm?: AlarmSettings;
}

interface InsuranceLike {
  car_number?: string;
  end_date?: string;
  status?: string;
}

interface TaskLike {
  title?: string;
  due_date?: string;
  state?: string;
  car_number?: string;
}

/* ═════════ 카테고리별 기본 라우트 ═════════ */
const MENU_ROUTE: Record<GotoMenu, string> = {
  finance: '/ledger',
  contract: '/contract',
  asset: '/asset',
  journal: '/operation',
};

export function gotoRoute(item: PendingItem): string {
  return item.route ?? MENU_ROUTE[item.gotoMenu];
}

/* ═════════ 메인 엔진 ═════════ */
export function runGapCheck(input: GapCheckInput): PendingItem[] {
  const t = input.today ?? todayStr();
  const alarm = input.alarm ?? DEFAULT_ALARM_SETTINGS;
  const items: PendingItem[] = [];

  pushFinance(items, input, t, alarm);
  pushContract(items, input, t, alarm);
  pushAsset(items, input, t, alarm);
  pushTask(items, input, t, alarm);

  return items;
}

/** 카테고리별 그룹화 (UI 렌더용 헬퍼) */
export function groupByCategory(
  items: readonly PendingItem[],
): Record<PendingCategory, PendingItem[]> {
  const out: Record<PendingCategory, PendingItem[]> = {
    재무: [],
    계약: [],
    자산: [],
    업무: [],
  };
  for (const it of items) out[it.category].push(it);
  return out;
}

/* ═════════ 재무 ═════════ */
function pushFinance(
  out: PendingItem[],
  { events, billings }: GapCheckInput,
  t: string,
  alarm: AlarmSettings,
): void {
  // 1) 자금일보 미작성 (오늘 daily_finance_report 이벤트 없음) — 설정 시에만
  if (alarm.daily_report_required) {
    const todayReport = events.some(
      (e) => e.date === t && isDailyFinanceReport(e.type) && e.status !== 'deleted',
    );
    if (!todayReport) {
      out.push({
        id: 'finance.no-daily-report',
        category: '재무',
        label: '자금일보 미작성',
        count: 1,
        description: `오늘(${t}) 자금일보가 아직 작성되지 않음`,
        priority: 'urgent',
        action: '작성',
        gotoMenu: 'finance',
        route: '/ledger?tab=daily',
      });
    }
  }

  // 2) 예수금 매칭 [N] (bank_tx events 중 contract_code 없음)
  const unmatched = events.filter(
    (e) =>
      e.type === 'bank_tx' &&
      e.status !== 'deleted' &&
      Number(e.amount ?? 0) > 0 &&
      !nonEmpty(e.contract_code) &&
      e.match_status !== 'matched' &&
      e.match_status !== 'ignored',
  );
  if (unmatched.length > 0) {
    out.push({
      id: 'finance.deposit-unmatched',
      category: '재무',
      label: `예수금 매칭 [${unmatched.length}]`,
      count: unmatched.length,
      description:
        unmatched
          .slice(0, 3)
          .map((e) => `${e.title ?? '—'} ${fmt(Number(e.amount ?? 0))}`)
          .join(' · ') + (unmatched.length > 3 ? ` 외 ${unmatched.length - 3}건` : ''),
      priority: 'warn',
      action: '매칭',
      gotoMenu: 'finance',
      route: '/ledger?tab=list&filter=unmatched',
    });
  }

  // 3) 과태료 미처리 [N] (penalty events 진행 중)
  const penaltyPending = events.filter(
    (e) =>
      e.type === 'penalty' && e.status !== 'deleted' && isPendingStatus(e.work_status ?? e.status),
  );
  if (penaltyPending.length > 0) {
    out.push({
      id: 'finance.penalty-pending',
      category: '재무',
      label: `과태료 미처리 [${penaltyPending.length}]`,
      count: penaltyPending.length,
      description: `${penaltyPending
        .slice(0, 4)
        .map((e) => e.car_number ?? '—')
        .join(' · ')}${
        penaltyPending.length > 4 ? ` 외 ${penaltyPending.length - 4}건` : ''
      } (스캔 후 변경부과 대기)`,
      priority: 'normal',
      action: '처리',
      gotoMenu: 'contract',
      route: '/contract?tab=fine',
    });
  }

  // 4) 세금계산서 미발행 [N]
  const thisMonth = t.slice(0, 7);
  const issuedPartners = new Set(
    events
      .filter(
        (e) =>
          e.type === 'tax_invoice' &&
          e.status !== 'deleted' &&
          (e.date ?? '').startsWith(thisMonth),
      )
      .map((e) => e.partner_code)
      .filter((v): v is string => Boolean(v)),
  );
  const partnersWithRevenue = new Set<string>();
  for (const b of billings) {
    if (!b.partner_code) continue;
    if (Number(b.paid_total ?? 0) <= 0) continue;
    if ((b.due_date ?? '').startsWith(thisMonth)) partnersWithRevenue.add(b.partner_code);
  }
  const unissued = Array.from(partnersWithRevenue).filter((p) => !issuedPartners.has(p));
  if (unissued.length > 0) {
    out.push({
      id: 'finance.tax-invoice-unissued',
      category: '재무',
      label: `세금계산서 미발행 [${unissued.length}]`,
      count: unissued.length,
      description: `${unissued
        .slice(0, 4)
        .map((p) => `${p} ${thisMonth} 분`)
        .join(
          ' · ',
        )}${unissued.length > 4 ? ` 외 ${unissued.length - 4}건` : ''} — 마감 ${monthEnd(thisMonth)}`,
      priority: 'normal',
      action: '발행',
      gotoMenu: 'finance',
      route: '/ledger?tab=tax-invoice',
    });
  }
}

/* ═════════ 계약 ═════════ */
function pushContract(
  out: PendingItem[],
  { contracts, billings, events }: GapCheckInput,
  t: string,
  alarm: AlarmSettings,
): void {
  // 1) 미납 발생 [N] (billings.paid_total < amount AND due_date < today)
  const overdueBills = billings.filter((b) => {
    const amount = Number(b.amount ?? 0);
    const paid = Number(b.paid_total ?? 0);
    if (amount <= 0 || paid >= amount) return false;
    if (!b.due_date) return false;
    return b.due_date < t;
  });
  if (overdueBills.length > 0) {
    out.push({
      id: 'contract.overdue',
      category: '계약',
      label: `미납 발생 [${overdueBills.length}]`,
      count: overdueBills.length,
      description:
        overdueBills
          .slice(0, 3)
          .map((b) => {
            const days = daysAfter(b.due_date, t);
            const remain = Number(b.amount ?? 0) - Number(b.paid_total ?? 0);
            return `${b.contract_code ?? '—'} D+${days} ${fmt(remain)}`;
          })
          .join(' · ') + (overdueBills.length > 3 ? ` 외 ${overdueBills.length - 3}건` : ''),
      priority: 'urgent',
      action: '독촉',
      gotoMenu: 'journal',
      route: '/operation?tab=eungdae&filter=overdue',
    });
  }

  // 2-pre) 시동제어 권유 [N] — 미납 D+ignition_recommend_days 이상 + 시동제어 미적용
  const igThreshold = alarm.ignition_recommend_days;
  if (igThreshold > 0) {
    // 계약별 최대 D+ 일수 집계
    const overdueByCode = new Map<string, number>();
    for (const b of overdueBills) {
      if (!b.contract_code || !b.due_date) continue;
      const d = daysAfter(b.due_date, t);
      const prev = overdueByCode.get(b.contract_code) ?? 0;
      if (d > prev) overdueByCode.set(b.contract_code, d);
    }
    const ignitionCandidates = contracts.filter((c) => {
      if (c.status === 'deleted' || !c.contract_code) return false;
      if ((c.action_status ?? '').toString().includes('시동제어')) return false;
      const maxD = overdueByCode.get(c.contract_code) ?? 0;
      return maxD >= igThreshold;
    });
    if (ignitionCandidates.length > 0) {
      out.push({
        id: 'contract.ignition-recommend',
        category: '계약',
        label: `시동제어 권유 [${ignitionCandidates.length}]`,
        count: ignitionCandidates.length,
        description:
          ignitionCandidates
            .slice(0, 3)
            .map((c) => {
              const d = overdueByCode.get(c.contract_code ?? '') ?? 0;
              return `${c.car_number ?? c.contract_code} D+${d}`;
            })
            .join(' · ') +
          (ignitionCandidates.length > 3 ? ` 외 ${ignitionCandidates.length - 3}건` : ''),
        priority: 'urgent',
        action: '제어',
        gotoMenu: 'journal',
        route: '/operation?tab=sidong&filter=overdue',
      });
    }
  }

  // 2) 시동제어 중 [N]
  const engineLocked = contracts.filter(
    (c) => c.status !== 'deleted' && (c.action_status ?? '').toString().includes('시동제어'),
  );
  if (engineLocked.length > 0) {
    out.push({
      id: 'contract.engine-lock',
      category: '계약',
      label: `시동제어 중 [${engineLocked.length}]`,
      count: engineLocked.length,
      description:
        engineLocked
          .slice(0, 4)
          .map((c) => c.car_number ?? c.contract_code ?? '—')
          .join(' · ') + (engineLocked.length > 4 ? ` 외 ${engineLocked.length - 4}건` : ''),
      priority: 'warn',
      action: '확인',
      gotoMenu: 'contract',
      route: '/contract?tab=overdue&filter=locked',
    });
  }

  // 3) 반납 지연 [N] (만기 경과 + return event 없음)
  const returnedCodes = new Set(
    events
      .filter((e) => e.status !== 'deleted' && isReturnEvent(e.type))
      .map((e) => e.contract_code)
      .filter((v): v is string => Boolean(v)),
  );
  const lateReturn = contracts.filter((c) => {
    if (c.status === 'deleted') return false;
    if (!c.contract_code) return false;
    if (isTerminatedStatus(c.contract_status)) return false;
    const end = computeContractEnd(c);
    if (!end || end >= t) return false;
    return !returnedCodes.has(c.contract_code);
  });
  if (lateReturn.length > 0) {
    out.push({
      id: 'contract.late-return',
      category: '계약',
      label: `반납 지연 [${lateReturn.length}]`,
      count: lateReturn.length,
      description:
        lateReturn
          .slice(0, 3)
          .map((c) => {
            const end = computeContractEnd(c);
            return `${c.car_number ?? c.contract_code} D+${daysAfter(end, t)}`;
          })
          .join(' · ') + (lateReturn.length > 3 ? ` 외 ${lateReturn.length - 3}건` : ''),
      priority: 'urgent',
      action: '처리',
      gotoMenu: 'contract',
      route: '/contract?tab=release-return&filter=late',
    });
  }

  // 4) 출고 대기 [N]
  const releasedCodes = new Set(
    events
      .filter((e) => e.status !== 'deleted' && isReleaseEvent(e.type))
      .map((e) => e.contract_code)
      .filter((v): v is string => Boolean(v)),
  );
  const pendingRelease = contracts.filter((c) => {
    if (c.status === 'deleted') return false;
    if (!c.contract_code) return false;
    if (isTerminatedStatus(c.contract_status)) return false;
    const status = (c.contract_status ?? '').toString();
    if (!status.includes('계약') && !status.includes('진행') && !status.includes('대기')) {
      return false;
    }
    return !releasedCodes.has(c.contract_code);
  });
  if (pendingRelease.length > 0) {
    out.push({
      id: 'contract.pending-release',
      category: '계약',
      label: `출고 대기 [${pendingRelease.length}]`,
      count: pendingRelease.length,
      description:
        pendingRelease
          .slice(0, 3)
          .map((c) => `${c.contract_code} ${c.contractor_name ?? ''}`.trim())
          .join(' · ') + (pendingRelease.length > 3 ? ` 외 ${pendingRelease.length - 3}건` : ''),
      priority: 'normal',
      action: '출고',
      gotoMenu: 'contract',
      route: '/contract?tab=release-return&filter=pending',
    });
  }
}

/* ═════════ 자산 ═════════ */
function pushAsset(
  out: PendingItem[],
  { assets, events, extra }: GapCheckInput,
  t: string,
  alarm: AlarmSettings,
): void {
  // 1) 보험 만료 임박 [N] (insurance end_date ≤ today + alarm.insurance_expiring_days)
  const insurances = extra?.insurances ?? [];
  const insThreshold = alarm.insurance_expiring_days;
  const inSoon = insurances.filter((i) => {
    if (i.status === 'deleted') return false;
    if (!i.end_date) return false;
    const days = diffDays(i.end_date, t);
    return days >= 0 && days <= insThreshold;
  });
  if (inSoon.length > 0) {
    out.push({
      id: 'asset.insurance-expiring',
      category: '자산',
      label: `보험 만료 임박 [${inSoon.length}]`,
      count: inSoon.length,
      description:
        inSoon
          .slice(0, 4)
          .map((i) => `${i.car_number ?? '—'} D-${diffDays(i.end_date ?? '', t)}`)
          .join(' · ') + (inSoon.length > 4 ? ` 외 ${inSoon.length - 4}건` : ''),
      priority: 'urgent',
      action: '갱신',
      gotoMenu: 'asset',
      route: '/asset?tab=insurance&filter=expiring',
    });
  }

  // 2) 정기검사 도래 [N] (asset.inspection_valid_until ≤ today + alarm.inspection_expiring_days)
  const inspThreshold = alarm.inspection_expiring_days;
  const inspectionDue = assets.filter((a) => {
    if (a.status === 'deleted') return false;
    if (!a.inspection_valid_until) return false;
    const days = diffDays(a.inspection_valid_until, t);
    return days <= inspThreshold; // 이미 지난 것 포함 (음수)
  });
  if (inspectionDue.length > 0) {
    out.push({
      id: 'asset.inspection-due',
      category: '자산',
      label: `정기검사 도래 [${inspectionDue.length}]`,
      count: inspectionDue.length,
      description:
        inspectionDue
          .slice(0, 4)
          .map((a) => {
            const days = diffDays(a.inspection_valid_until ?? '', t);
            return `${a.car_number ?? '—'} ${days >= 0 ? `D-${days}` : `D+${-days}`}`;
          })
          .join(' · ') + (inspectionDue.length > 4 ? ` 외 ${inspectionDue.length - 4}건` : ''),
      priority: 'warn',
      action: '예약',
      gotoMenu: 'asset',
      route: '/asset?tab=inspection&filter=due',
    });
  }

  // 3) 휴차 N일 초과 [N] — alarm.idle_alert_days
  // — 휴차 진입일을 정확히 알기 어려우므로, asset_status가 휴차이고 last_maint_date 기준으로 derive.
  //   더 정확하게는 events에서 마지막 idle/return 이벤트 일자 사용.
  const idleThreshold = alarm.idle_alert_days;
  const idleSince = new Map<string, string>();
  for (const e of events) {
    if (e.status === 'deleted') continue;
    if (!e.car_number || !e.date) continue;
    if (isReturnEvent(e.type) || (e.type ?? '').toString().includes('idle')) {
      const prev = idleSince.get(e.car_number);
      if (!prev || e.date > prev) idleSince.set(e.car_number, e.date);
    }
  }
  const longIdle = assets.filter((a) => {
    if (a.status === 'deleted') return false;
    const s = (a.asset_status ?? a.status ?? '').toString();
    if (!s.includes('휴차')) return false;
    const since = a.car_number ? idleSince.get(a.car_number) : undefined;
    if (!since) return false; // 시작일 모르면 제외
    return diffDays(t, since) > idleThreshold;
  });
  if (longIdle.length > 0) {
    out.push({
      id: 'asset.long-idle',
      category: '자산',
      label: `휴차 ${idleThreshold}일 초과 [${longIdle.length}]`,
      count: longIdle.length,
      description:
        longIdle
          .slice(0, 4)
          .map((a) => {
            const since = idleSince.get(a.car_number ?? '') ?? '';
            return `${a.car_number ?? '—'} D+${diffDays(t, since)}`;
          })
          .join(' · ') + (longIdle.length > 4 ? ` 외 ${longIdle.length - 4}건` : ''),
      priority: 'warn',
      action: '활용',
      gotoMenu: 'contract',
      route: '/contract?tab=idle&filter=long',
    });
  }
}

/* ═════════ 업무 ═════════ */
function pushTask(
  out: PendingItem[],
  { events, extra }: GapCheckInput,
  t: string,
  alarm: AlarmSettings,
): void {
  // 1) 받은 요청 마감 임박 [N] — tasks.due_date ≤ today + alarm.request_due_days
  const tasks = extra?.tasks ?? [];
  const reqThreshold = alarm.request_due_days;
  const dueSoon = tasks.filter((tk) => {
    const state = (tk.state ?? '').toString();
    if (state.includes('완료')) return false;
    if (!tk.due_date) return false;
    const days = diffDays(tk.due_date, t);
    return days <= reqThreshold; // 오늘·내일·이미 지난 것
  });
  if (dueSoon.length > 0) {
    out.push({
      id: 'task.due-soon',
      category: '업무',
      label: `받은 요청 마감 임박 [${dueSoon.length}]`,
      count: dueSoon.length,
      description:
        dueSoon
          .slice(0, 3)
          .map((tk) => {
            const days = diffDays(tk.due_date ?? '', t);
            const tag = days >= 0 ? `D-${days}` : `D+${-days}`;
            return `${tk.title ?? '(제목없음)'} ${tag}`;
          })
          .join(' · ') + (dueSoon.length > 3 ? ` 외 ${dueSoon.length - 3}건` : ''),
      priority: 'urgent',
      action: '처리',
      gotoMenu: 'journal',
      route: '/task',
    });
  }

  // 2) 사고 처리 진행 중 [N]
  const accidentOpen = events.filter(
    (e) =>
      e.status !== 'deleted' &&
      e.type === 'accident' &&
      e.accident_status &&
      e.accident_status !== '종결',
  );
  if (accidentOpen.length > 0) {
    out.push({
      id: 'task.accident-open',
      category: '업무',
      label: `사고 처리 진행 중 [${accidentOpen.length}]`,
      count: accidentOpen.length,
      description:
        accidentOpen
          .slice(0, 3)
          .map((e) => `${e.car_number ?? '—'} ${e.accident_status ?? '진행'}`)
          .join(' · ') + (accidentOpen.length > 3 ? ` 외 ${accidentOpen.length - 3}건` : ''),
      priority: 'normal',
      action: '확인',
      gotoMenu: 'journal',
      route: '/operation?tab=accident',
    });
  }
}

/* ═════════ helpers ═════════ */

function nonEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  return String(v).trim().length > 0;
}

function isDailyFinanceReport(t: unknown): boolean {
  const s = (t ?? '').toString();
  return s === 'daily_finance_report' || s === 'fund_daily' || s.includes('자금일보');
}

function isPendingStatus(v: unknown): boolean {
  if (!nonEmpty(v)) return true;
  const s = String(v).toLowerCase();
  return s.includes('pending') || s.includes('대기') || s.includes('미처리') || s.includes('진행');
}

function isReturnEvent(t: unknown): boolean {
  const s = (t ?? '').toString();
  return s.includes('반납') || s.toLowerCase().includes('return');
}

function isReleaseEvent(t: unknown): boolean {
  const s = (t ?? '').toString();
  return (
    s.includes('출고') ||
    s.toLowerCase().includes('release') ||
    s.toLowerCase().includes('delivery')
  );
}

function isTerminatedStatus(v: unknown): boolean {
  const s = (v ?? '').toString();
  return s.includes('해지') || s.includes('종료') || s.includes('완료');
}

function daysAfter(date: string | undefined, t: string): number {
  if (!date) return 0;
  return Math.max(0, diffDays(t, date));
}

/** a - b in days (양수 = a가 미래, 음수 = a가 과거) */
function diffDays(a: string, b: string): number {
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return 0;
  return Math.floor((da.getTime() - db.getTime()) / 86400000);
}

function monthEnd(yyyymm: string): string {
  const [y, m] = yyyymm.split('-').map((s) => Number.parseInt(s, 10));
  if (!y || !m) return yyyymm;
  const last = new Date(y, m, 0).getDate();
  return `${yyyymm}-${String(last).padStart(2, '0')}`;
}

/* ═════════ 카테고리별 메타 (UI 헤더용) ═════════ */
export const CATEGORY_META: Record<
  PendingCategory,
  { icon: string; gotoLabel: string; gotoMenu: GotoMenu }
> = {
  재무: { icon: 'ph-coins', gotoLabel: '재무관리로 →', gotoMenu: 'finance' },
  계약: { icon: 'ph-clipboard-text', gotoLabel: '계약관리로 →', gotoMenu: 'contract' },
  자산: { icon: 'ph-car-simple', gotoLabel: '자산관리로 →', gotoMenu: 'asset' },
  업무: { icon: 'ph-notebook', gotoLabel: '업무일지로 →', gotoMenu: 'journal' },
};

/* ═════════ 사이드바 카운트 (카테고리별 합계) ═════════ */
export interface GapCheckCounts {
  /** 미결 건수 합계 (전체) */
  pending: number;
  /** 재무 카테고리 합계 → 재무관리 메뉴 뱃지 */
  finance: number;
  /** 계약 카테고리 합계 → 계약관리 메뉴 뱃지 */
  contract: number;
  /** 자산 카테고리 합계 → 자산관리 메뉴 뱃지 */
  asset: number;
  /** 업무 카테고리 합계 → 업무관리 메뉴 뱃지 */
  journal: number;
}

/** PendingItem[] → 사이드바용 카운트 5종 */
export function getCategoryCounts(items: readonly PendingItem[]): GapCheckCounts {
  const out: GapCheckCounts = {
    pending: 0,
    finance: 0,
    contract: 0,
    asset: 0,
    journal: 0,
  };
  for (const it of items) {
    out.pending += it.count;
    switch (it.category) {
      case '재무':
        out.finance += it.count;
        break;
      case '계약':
        out.contract += it.count;
        break;
      case '자산':
        out.asset += it.count;
        break;
      case '업무':
        out.journal += it.count;
        break;
    }
  }
  return out;
}
