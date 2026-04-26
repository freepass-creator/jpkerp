'use client';

/**
 * 대시보드 (Phase 14) — JPK ERP v3 root 페이지.
 *
 * 4개 핵심 카드:
 *   1) 전체 가동률   — 운용 자산 N / 가동중 M = %
 *   2) 미납         — 미납 N건 / 미수합계 / 평균 D+
 *   3) 반납스케줄    — D-7 / D-30 / 만기경과
 *   4) 미결업무      — runGapCheck() → 4 카테고리 분포
 *
 * 데이터 derived는 useMemo로 1회 계산. 클릭시 router.push.
 */

import { useRtdbCollection } from '@/lib/collections/rtdb';
import { computeContractEnd, today as todayStr } from '@/lib/date-utils';
import { groupByCategory, runGapCheck } from '@/lib/gap-check';
import { useAlarmSettings } from '@/lib/hooks/useAlarmSettings';
import type { RtdbAsset, RtdbBilling, RtdbContract, RtdbEvent } from '@/lib/types/rtdb-entities';
import { fmt } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';

interface InsuranceRow {
  car_number?: string;
  end_date?: string;
  status?: string;
  [k: string]: unknown;
}

interface TaskRow {
  title?: string;
  due_date?: string;
  state?: string;
  car_number?: string;
  [k: string]: unknown;
}

export default function DashboardPage() {
  const router = useRouter();
  const assets = useRtdbCollection<RtdbAsset>('assets');
  const contracts = useRtdbCollection<RtdbContract>('contracts');
  const billings = useRtdbCollection<RtdbBilling>('billings');
  const events = useRtdbCollection<RtdbEvent>('events');
  const insurances = useRtdbCollection<InsuranceRow>('insurances');
  const tasks = useRtdbCollection<TaskRow>('tasks');
  const { settings: alarm } = useAlarmSettings();

  const loading =
    assets.loading ||
    contracts.loading ||
    billings.loading ||
    events.loading ||
    insurances.loading ||
    tasks.loading;

  const t = todayStr();

  /* ───── 카드 1: 전체 가동률 ───── */
  const utilization = useMemo(() => {
    if (loading) return null;
    // 운용 자산 = 삭제 아님 + asset_status가 매각/처분 아님
    const operating = assets.data.filter((a) => {
      if (a.status === 'deleted') return false;
      const s = (a.asset_status ?? '').toString();
      if (s.includes('매각') || s.includes('폐차') || s.includes('처분')) return false;
      return true;
    });

    // 가동중 = 진행중 계약 + release event 있음
    const releasedCodes = new Set(
      events.data
        .filter((e) => e.status !== 'deleted' && isReleaseEvent(e.type))
        .map((e) => e.contract_code)
        .filter((v): v is string => Boolean(v)),
    );
    const active = contracts.data.filter((c) => {
      if (c.status === 'deleted') return false;
      if (!c.contract_code) return false;
      const cs = (c.contract_status ?? '').toString();
      const isProgressing = cs.includes('진행') || cs === '계약진행';
      if (!isProgressing) return false;
      return releasedCodes.has(c.contract_code);
    });

    const total = operating.length;
    const inUse = active.length;
    const idle = Math.max(0, total - inUse);
    const rate = total > 0 ? Math.round((inUse / total) * 100) : 0;
    return { total, inUse, idle, rate };
  }, [loading, assets.data, contracts.data, events.data]);

  /* ───── 카드 2: 미납 ───── */
  const overdue = useMemo(() => {
    if (loading) return null;
    const list = billings.data.filter((b) => {
      const amount = Number(b.amount ?? 0);
      const paid = Number(b.paid_total ?? 0);
      if (amount <= 0 || paid >= amount) return false;
      if (!b.due_date) return false;
      return b.due_date < t;
    });
    const totalRemain = list.reduce(
      (sum, b) => sum + (Number(b.amount ?? 0) - Number(b.paid_total ?? 0)),
      0,
    );
    const avgDays =
      list.length > 0
        ? Math.round(list.reduce((sum, b) => sum + diffDays(t, b.due_date ?? t), 0) / list.length)
        : 0;
    return { count: list.length, totalRemain, avgDays };
  }, [loading, billings.data, t]);

  /* ───── 카드 3: 반납스케줄 ───── */
  // 임계값: 임박(near) = contract_expiring_days / 4 (≥1), 일반(soon) = contract_expiring_days
  const expiringSoon = Math.max(1, alarm.contract_expiring_days);
  const expiringNear = Math.max(1, Math.round(expiringSoon / 4));
  const returnSchedule = useMemo(() => {
    if (loading) return null;
    const returnedCodes = new Set(
      events.data
        .filter((e) => e.status !== 'deleted' && isReturnEvent(e.type))
        .map((e) => e.contract_code)
        .filter((v): v is string => Boolean(v)),
    );
    let near = 0;
    let soon = 0;
    let expired = 0;
    for (const c of contracts.data) {
      if (c.status === 'deleted') continue;
      if (!c.contract_code) continue;
      const cs = (c.contract_status ?? '').toString();
      // 종료/해지된 계약은 제외
      if (cs.includes('해지') || cs.includes('완료')) continue;
      const end = computeContractEnd(c);
      if (!end) continue;
      if (end < t) {
        if (!returnedCodes.has(c.contract_code)) expired++;
      } else {
        const days = diffDays(end, t);
        if (days <= expiringNear) near++;
        else if (days <= expiringSoon) soon++;
      }
    }
    return { near, soon, expired };
  }, [loading, contracts.data, events.data, t, expiringNear, expiringSoon]);

  /* ───── 카드 4: 미결업무 ───── */
  const pending = useMemo(() => {
    if (loading) return null;
    const items = runGapCheck({
      assets: assets.data,
      contracts: contracts.data,
      billings: billings.data,
      events: events.data,
      extra: { insurances: insurances.data, tasks: tasks.data },
      alarm,
    });
    const grouped = groupByCategory(items);
    const total = items.reduce((s, it) => s + it.count, 0);
    return {
      total,
      finance: sumCount(grouped.재무),
      contract: sumCount(grouped.계약),
      asset: sumCount(grouped.자산),
      task: sumCount(grouped.업무),
    };
  }, [
    loading,
    assets.data,
    contracts.data,
    billings.data,
    events.data,
    insurances.data,
    tasks.data,
    alarm,
  ]);

  return (
    <>
      <div className="page-head">
        <i className="ph ph-chart-line" />
        <div className="title">대시보드</div>
        <div className="crumbs">› {nowLabel()} 기준</div>
      </div>

      {loading ? (
        <div
          style={{
            padding: 24,
            color: 'var(--c-text-muted)',
            textAlign: 'center',
            background: 'var(--c-surface)',
            border: '1px solid var(--c-border)',
          }}
        >
          <i className="ph ph-spinner spin" /> 대시보드 로드 중...
        </div>
      ) : (
        <div className="dashboard-grid">
          {/* 카드 1: 가동률 */}
          <DashboardCard
            icon="ph-gauge"
            label="전체 가동률"
            mainValue={`${utilization?.rate ?? 0}%`}
            subText={`운용 ${utilization?.total ?? 0}대 · 가동 ${utilization?.inUse ?? 0}대`}
            details={[
              { lbl: '운용', val: `${utilization?.total ?? 0}대` },
              { lbl: '가동중', val: `${utilization?.inUse ?? 0}대` },
              { lbl: '휴차', val: `${utilization?.idle ?? 0}대` },
            ]}
            onClick={() => router.push('/asset')}
          />

          {/* 카드 2: 미납 */}
          <DashboardCard
            icon="ph-warning-circle"
            label="미납"
            mainValue={`${overdue?.count ?? 0}건`}
            subText={`미수합계 ${fmt(Math.round(overdue?.totalRemain ?? 0))}원`}
            details={[
              { lbl: '미납건수', val: `${overdue?.count ?? 0}건` },
              {
                lbl: '평균 연체',
                val: overdue && overdue.count > 0 ? `D+${overdue.avgDays}` : '—',
              },
            ]}
            onClick={() => router.push('/contract?tab=overdue')}
          />

          {/* 카드 3: 반납스케줄 — 임계값은 시스템 설정의 contract_expiring_days 사용 */}
          <DashboardCard
            icon="ph-calendar-check"
            label="반납스케줄"
            mainValue={`${(returnSchedule?.near ?? 0) + (returnSchedule?.expired ?? 0)}건`}
            subText={`긴급(만기경과+D-${expiringNear}) 처리 필요`}
            details={[
              {
                lbl: '만기경과',
                val: `${returnSchedule?.expired ?? 0}건`,
                tone: 'danger',
              },
              {
                lbl: `D-${expiringNear}`,
                val: `${returnSchedule?.near ?? 0}건`,
                tone: 'warn',
              },
              { lbl: `D-${expiringSoon}`, val: `${returnSchedule?.soon ?? 0}건` },
            ]}
            onClick={() => router.push('/contract?tab=releaseReturn')}
          />

          {/* 카드 4: 미결업무 */}
          <DashboardCard
            icon="ph-push-pin"
            label="미결업무"
            mainValue={`${pending?.total ?? 0}건`}
            subText="4 카테고리 미결 합계"
            details={[
              { lbl: '재무', val: `${pending?.finance ?? 0}` },
              { lbl: '계약', val: `${pending?.contract ?? 0}` },
              { lbl: '자산', val: `${pending?.asset ?? 0}` },
              { lbl: '업무', val: `${pending?.task ?? 0}` },
            ]}
            onClick={() => router.push('/status/pending')}
          />
        </div>
      )}
    </>
  );
}

/* ═════════ DashboardCard ═════════ */

interface DetailItem {
  lbl: string;
  val: string;
  tone?: 'danger' | 'warn';
}

interface DashboardCardProps {
  icon: string;
  label: string;
  mainValue: string;
  subText: string;
  details: DetailItem[];
  onClick: () => void;
}

function DashboardCard({ icon, label, mainValue, subText, details, onClick }: DashboardCardProps) {
  return (
    <div
      className="dashboard-card"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      // biome-ignore lint/a11y/useSemanticElements: 카드 내부 데이터 영역의 시맨틱 우선
      role="button"
      tabIndex={0}
    >
      <div className="card-head">
        <i className={`ph ${icon} ico`} />
        <span>{label}</span>
      </div>
      <div className="card-main">{mainValue}</div>
      <div className="card-sub">{subText}</div>
      <div className="card-detail">
        {details.map((d) => (
          <div className="item" key={d.lbl}>
            <div className="lbl">{d.lbl}</div>
            <div
              className="val"
              style={
                d.tone === 'danger'
                  ? { color: 'var(--c-danger, #d33)' }
                  : d.tone === 'warn'
                    ? { color: 'var(--c-warn, #d97706)' }
                    : undefined
              }
            >
              {d.val}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═════════ helpers ═════════ */

function isReturnEvent(type: unknown): boolean {
  const s = (type ?? '').toString();
  return s.includes('반납') || s.toLowerCase().includes('return');
}

function isReleaseEvent(type: unknown): boolean {
  const s = (type ?? '').toString();
  return (
    s.includes('출고') ||
    s.toLowerCase().includes('release') ||
    s.toLowerCase().includes('delivery')
  );
}

function sumCount<T extends { count: number }>(list: readonly T[]): number {
  return list.reduce((s, it) => s + it.count, 0);
}

function diffDays(a: string, b: string): number {
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return 0;
  return Math.floor((da.getTime() - db.getTime()) / 86400000);
}

function nowLabel(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}
