'use client';

import { useMemo, useRef, useState } from 'react';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import type { JpkGridApi } from '@/components/shared/jpk-grid';
import type { RtdbBilling, RtdbEvent } from '@/lib/types/rtdb-entities';
import { today as todayStr } from '@/lib/date-utils';
import { fmt } from '@/lib/utils';
import { LedgerClient } from './ledger-client';

type SubpageId = 'finance-list' | 'finance-daily' | 'finance-tax-invoice';

interface TabSpec {
  id: SubpageId;
  label: string;
  primaryAction: string;
  secondaryAction?: string;
}

const TABS: TabSpec[] = [
  { id: 'finance-list',        label: '입출금내역', primaryAction: '+ 거래 입력', secondaryAction: '+ 수기 입력' },
  { id: 'finance-daily',       label: '자금일보',   primaryAction: '+ 자금일보 작성' },
  { id: 'finance-tax-invoice', label: '세금계산서', primaryAction: '+ 계산서 발행' },
];

const TAB_CRUMB: Record<SubpageId, string> = {
  'finance-list':        '입출금내역',
  'finance-daily':       '자금일보',
  'finance-tax-invoice': '세금계산서',
};

export default function FinancePage() {
  const gridRef = useRef<JpkGridApi<RtdbEvent> | null>(null);
  const [active, setActive] = useState<SubpageId>('finance-list');
  const [count, setCount] = useState(0);

  const events = useRtdbCollection<RtdbEvent>('events');
  const billings = useRtdbCollection<RtdbBilling>('billings');

  const alerts = useMemo(
    () => deriveFinanceAlerts(events.data, billings.data),
    [events.data, billings.data],
  );
  const stats = useMemo(() => deriveFinanceStats(events.data), [events.data]);
  const dailyRows = useMemo(() => deriveDailyRows(events.data), [events.data]);

  const activeTab = TABS.find((t) => t.id === active) ?? TABS[0];

  return (
    <>
      <div className="page-head">
        <i className="ph ph-coins" />
        <div className="title">재무관리</div>
        <div className="crumbs">› {TAB_CRUMB[active]}</div>
      </div>

      <div className="v3-tabs">
        <div className="v3-tab-list">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`v3-tab ${active === t.id ? 'is-active' : ''}`}
              onClick={() => setActive(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="action">
          <button type="button" disabled>{activeTab.primaryAction}</button>
          {activeTab.secondaryAction && (
            <button
              type="button"
              disabled
              style={{
                background: 'var(--c-surface)',
                color: 'var(--c-text)',
                border: '1px solid var(--c-border)',
              }}
            >
              {activeTab.secondaryAction}
            </button>
          )}
        </div>
      </div>

      {active === 'finance-list' ? (
        <FinanceListSubpage
          loading={events.loading}
          error={events.error}
          alerts={alerts}
          stats={stats}
          gridRef={gridRef}
          onCountChange={setCount}
          count={count}
        />
      ) : active === 'finance-daily' ? (
        <DailyReportSubpage rows={dailyRows} loading={events.loading} />
      ) : (
        <TaxInvoiceSubpage />
      )}
    </>
  );
}

/* ── 입출금내역 sub-page ── */
function FinanceListSubpage({
  loading,
  error,
  alerts,
  stats,
  gridRef,
  onCountChange,
  count,
}: {
  loading: boolean;
  error: Error | null;
  alerts: AlertItem[];
  stats: FinanceStats;
  gridRef: React.RefObject<JpkGridApi<RtdbEvent> | null>;
  onCountChange: (n: number) => void;
  count: number;
}) {
  const isClear = alerts.length === 0;
  const totalAlerts = alerts.reduce((sum, a) => sum + a.count, 0);

  return (
    <div className="v3-subpage is-active">
      {/* 미결 패널 */}
      <div className={`v3-alerts ${isClear ? 'is-clear' : ''}`}>
        <div className="v3-alerts-head">
          <span className="dot" />
          <span className="title">{isClear ? '재무 미결 없음' : '재무 미결'}</span>
          <span className="count">
            {isClear ? '· 0건' : `· ${totalAlerts}건`}
          </span>
        </div>
        {!isClear && (
          <div className="v3-alerts-grid">
            {alerts.map((a) => (
              <div
                key={a.key}
                className={`v3-alert-card ${a.severity === 'danger' ? 'is-danger' : a.severity === 'info' ? 'is-info' : ''}`}
              >
                <i className={`ph ${a.icon} ico`} />
                <div className="body">
                  <div className="head">{a.head}</div>
                  <div className="desc">{a.desc}</div>
                </div>
                <button type="button" className="alert-btn">{a.actionLabel}</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AG Grid (LedgerClient wrap) */}
      <div className="v3-table-wrap">
        {loading ? (
          <div style={{ padding: 24, color: 'var(--c-text-muted)', textAlign: 'center' }}>
            <i className="ph ph-spinner spin" /> 입출금 데이터 로드 중...
          </div>
        ) : error ? (
          <div style={{ padding: 24 }}>
            <div style={{ fontWeight: 600, color: 'var(--c-err)', marginBottom: 4 }}>
              데이터 로드 실패
            </div>
            <div style={{ color: 'var(--c-text-sub)' }}>{error.message}</div>
          </div>
        ) : (
          <div className="v3-grid-host">
            <LedgerClient gridRef={gridRef} onCountChange={onCountChange} />
          </div>
        )}
      </div>

      {/* table-foot: 수입·지출·예수금 합계 */}
      <div className="v3-table-foot">
        <div>
          총 {count || stats.total}건
          <span className="sep">│</span>
          수입 <span style={{ color: 'var(--c-emerald)', fontWeight: 600 }}>+{fmt(stats.inflow)}</span>
          <span className="sep">│</span>
          지출 <span style={{ color: 'var(--c-err)', fontWeight: 600 }}>-{fmt(stats.outflow)}</span>
          <span className="sep">│</span>
          <span style={{ color: 'var(--c-text-muted)' }}>미매칭 {stats.unmatched}건</span>
        </div>
        <div style={{ color: 'var(--c-text-muted)' }}>
          행 클릭 시 거래 매칭
        </div>
      </div>
    </div>
  );
}

/* ── 자금일보 sub-page (placeholder + 일자별 합계) ── */
function DailyReportSubpage({
  rows,
  loading,
}: {
  rows: DailyRow[];
  loading: boolean;
}) {
  const tStr = todayStr();
  const todayWritten = rows.some((r) => r.date === tStr);

  return (
    <div className="v3-subpage is-active">
      <div className={`v3-alerts ${todayWritten ? 'is-clear' : ''}`}>
        <div className="v3-alerts-head">
          <span className="dot" />
          <span className="title">
            {todayWritten ? `자금일보 — ${tStr} 작성 완료` : '자금일보 미작성'}
          </span>
          <span className="count">
            {todayWritten
              ? `· ${rows.find((r) => r.date === tStr)?.count ?? 0}건 거래`
              : `· 오늘(${tStr}) 자금일보 필요`}
          </span>
        </div>
        {!todayWritten && (
          <div className="v3-alerts-grid">
            <div className="v3-alert-card is-danger">
              <i className="ph ph-coins ico" />
              <div className="body">
                <div className="head">오늘 자금일보 미작성</div>
                <div className="desc">
                  거래 입력 후 자금일보 작성 → 일자별 수입·지출 마감
                </div>
              </div>
              <button type="button" className="alert-btn">작성</button>
            </div>
          </div>
        )}
      </div>

      <div className="v3-table-wrap">
        {loading ? (
          <div style={{ padding: 24, color: 'var(--c-text-muted)', textAlign: 'center' }}>
            <i className="ph ph-spinner spin" /> 자금일보 데이터 로드 중...
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 24, color: 'var(--c-text-muted)', textAlign: 'center' }}>
            거래 데이터가 없습니다.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--c-bg-soft)', borderBottom: '1px solid var(--c-border)' }}>
                <th style={cellTh(96)}>일자</th>
                <th style={{ ...cellTh(96), textAlign: 'right' }}>수입</th>
                <th style={{ ...cellTh(96), textAlign: 'right' }}>지출</th>
                <th style={{ ...cellTh(96), textAlign: 'right' }}>순익</th>
                <th style={cellTh(64)}>거래수</th>
                <th style={cellTh(72)}>미매칭</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 60).map((r) => (
                <tr key={r.date} style={{ borderBottom: '1px solid var(--c-border)' }}>
                  <td style={cellTd()}>{r.date}</td>
                  <td style={{ ...cellTd(), textAlign: 'right', color: 'var(--c-emerald)', fontWeight: 600 }}>
                    +{fmt(r.inflow)}
                  </td>
                  <td style={{ ...cellTd(), textAlign: 'right', color: 'var(--c-err)', fontWeight: 600 }}>
                    -{fmt(r.outflow)}
                  </td>
                  <td style={{ ...cellTd(), textAlign: 'right', fontWeight: 600 }}>
                    {r.inflow - r.outflow >= 0 ? '+' : ''}
                    {fmt(r.inflow - r.outflow)}
                  </td>
                  <td style={cellTd()}>{r.count}</td>
                  <td style={{ ...cellTd(), color: r.unmatched > 0 ? 'var(--c-warn)' : 'var(--c-text-muted)' }}>
                    {r.unmatched}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="v3-table-foot">
        <div>
          최근 {Math.min(rows.length, 60)}일 일자별 거래 자동 집계
          <span className="sep">│</span>
          <span style={{ color: 'var(--c-text-muted)' }}>
            (자금일보 events 도입 전 — 거래 데이터 자동 derive)
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── 세금계산서 sub-page (placeholder) ── */
function TaxInvoiceSubpage() {
  return (
    <div className="v3-subpage is-active">
      <div className="v3-placeholder">
        <i className="ph ph-receipt" />
        <div className="title">세금계산서 준비 중</div>
        <div className="desc">
          billings 수납분 ↔ tax_invoice 이벤트 비교로 미발행 자동 추출 (홈택스 e세로 연동 예정)
        </div>
      </div>
    </div>
  );
}

/* ═════════ 미결 derive 로직 ═════════ */

type AlertSeverity = 'danger' | 'warn' | 'info';
interface AlertItem {
  key: string;
  severity: AlertSeverity;
  icon: string;
  head: string;
  desc: string;
  actionLabel: string;
  count: number;
}

function deriveFinanceAlerts(
  events: readonly RtdbEvent[],
  billings: readonly RtdbBilling[],
): AlertItem[] {
  const out: AlertItem[] = [];
  const tStr = todayStr();

  // 1) 자금일보 미작성 — 오늘 daily_finance_report 이벤트 없으면
  const todayReport = events.some(
    (e) => e.date === tStr && isDailyFinanceReport(e.type),
  );
  if (!todayReport) {
    out.push({
      key: 'no-daily-report',
      severity: 'danger',
      icon: 'ph-coins',
      head: '자금일보 미작성',
      desc: `오늘(${tStr}) 자금일보가 아직 작성되지 않음`,
      actionLabel: '작성',
      count: 1,
    });
  }

  // 2) 예수금 매칭 대기 — type='bank_tx' AND no contract_code AND no match
  const unmatchedDeposit = events.filter(
    (e) =>
      e.type === 'bank_tx' &&
      e.status !== 'deleted' &&
      Number(e.amount ?? 0) > 0 &&
      !nonEmpty(e.contract_code) &&
      e.match_status !== 'matched' &&
      e.match_status !== 'ignored',
  );
  if (unmatchedDeposit.length > 0) {
    const desc = unmatchedDeposit
      .slice(0, 3)
      .map((e) => `${e.title ?? '—'} ${fmt(Number(e.amount ?? 0))}`)
      .join(' · ');
    out.push({
      key: 'deposit-unmatched',
      severity: 'warn',
      icon: 'ph-link',
      head: `예수금 매칭 [${unmatchedDeposit.length}]`,
      desc:
        desc +
        (unmatchedDeposit.length > 3 ? ` 외 ${unmatchedDeposit.length - 3}건` : '') +
        ' — 신한 입금 중 미매칭',
      actionLabel: '매칭',
      count: unmatchedDeposit.length,
    });
  }

  // 3) 과태료 미처리 — type='penalty' AND status pending
  const pendingPenalty = events.filter(
    (e) =>
      e.type === 'penalty' &&
      e.status !== 'deleted' &&
      isPendingStatus(e.work_status ?? e.status),
  );
  if (pendingPenalty.length > 0) {
    out.push({
      key: 'penalty-pending',
      severity: 'info',
      icon: 'ph-file-text',
      head: `과태료 미처리 [${pendingPenalty.length}]`,
      desc:
        pendingPenalty
          .slice(0, 4)
          .map((e) => e.car_number ?? '—')
          .join(' · ') +
        (pendingPenalty.length > 4 ? ` 외 ${pendingPenalty.length - 4}건` : '') +
        ' (스캔 후 변경부과 대기)',
      actionLabel: '처리',
      count: pendingPenalty.length,
    });
  }

  // 4) 세금계산서 미발행 — billings 수납분 vs tax_invoice 이벤트 비교 (월별)
  // 간단 derive: 이번달 paid billings 중 tax_invoice 이벤트 없는 partner_code 그룹화
  const thisMonth = tStr.slice(0, 7); // YYYY-MM
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
    const paid = Number(b.paid_total ?? 0);
    if (paid <= 0) continue;
    if ((b.due_date ?? '').startsWith(thisMonth)) {
      partnersWithRevenue.add(b.partner_code);
    }
  }
  const unissued = Array.from(partnersWithRevenue).filter((p) => !issuedPartners.has(p));
  if (unissued.length > 0) {
    out.push({
      key: 'tax-invoice-unissued',
      severity: 'info',
      icon: 'ph-receipt',
      head: `세금계산서 미발행 [${unissued.length}]`,
      desc:
        unissued
          .slice(0, 4)
          .map((p) => `${p} ${thisMonth} 분`)
          .join(' · ') +
        (unissued.length > 4 ? ` 외 ${unissued.length - 4}건` : '') +
        ` — 마감 ${monthEnd(thisMonth)}`,
      actionLabel: '발행',
      count: unissued.length,
    });
  }

  return out;
}

interface FinanceStats {
  total: number;
  inflow: number;
  outflow: number;
  unmatched: number;
}

function deriveFinanceStats(events: readonly RtdbEvent[]): FinanceStats {
  let inflow = 0;
  let outflow = 0;
  let unmatched = 0;
  let total = 0;
  for (const e of events) {
    if (e.type !== 'bank_tx' && e.type !== 'card_tx') continue;
    if (e.status === 'deleted') continue;
    total += 1;
    const amt = Number(e.amount ?? 0);
    if (amt > 0) inflow += amt;
    else outflow += -amt;
    if (e.match_status !== 'matched') unmatched += 1;
  }
  return { total, inflow, outflow, unmatched };
}

interface DailyRow {
  date: string;
  inflow: number;
  outflow: number;
  count: number;
  unmatched: number;
}

function deriveDailyRows(events: readonly RtdbEvent[]): DailyRow[] {
  const map = new Map<string, DailyRow>();
  for (const e of events) {
    if (e.type !== 'bank_tx' && e.type !== 'card_tx') continue;
    if (e.status === 'deleted') continue;
    const date = (e.date ?? '').slice(0, 10);
    if (!date) continue;
    const r = map.get(date) ?? { date, inflow: 0, outflow: 0, count: 0, unmatched: 0 };
    const amt = Number(e.amount ?? 0);
    if (amt > 0) r.inflow += amt;
    else r.outflow += -amt;
    r.count += 1;
    if (e.match_status !== 'matched') r.unmatched += 1;
    map.set(date, r);
  }
  return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
}

/* ── helpers ── */

function isDailyFinanceReport(t: unknown): boolean {
  const s = (t ?? '').toString();
  return s === 'daily_finance_report' || s === 'fund_daily' || s.includes('자금일보');
}

function isPendingStatus(v: unknown): boolean {
  if (!nonEmpty(v)) return true; // 상태 비어있으면 미처리로 간주
  const s = String(v).toLowerCase();
  return (
    s.includes('pending') ||
    s.includes('대기') ||
    s.includes('미처리') ||
    s.includes('진행')
  );
}

function nonEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  return String(v).trim().length > 0;
}

function monthEnd(yyyymm: string): string {
  const [y, m] = yyyymm.split('-').map((s) => parseInt(s, 10));
  if (!y || !m) return yyyymm;
  const last = new Date(y, m, 0).getDate();
  return `${yyyymm}-${String(last).padStart(2, '0')}`;
}

function cellTh(width?: number): React.CSSProperties {
  return {
    padding: '6px 8px',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--c-text-sub)',
    textAlign: 'center',
    width,
  };
}

function cellTd(): React.CSSProperties {
  return {
    padding: '6px 8px',
    textAlign: 'center',
    color: 'var(--c-text)',
  };
}
