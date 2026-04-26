'use client';

import type { JpkGridApi } from '@/components/shared/jpk-grid';
import { ContractDetailPanel } from '@/components/v3/ContractDetailPanel';
import { PenaltyBatchTool } from '@/components/v3/PenaltyBatchTool';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import { computeContractEnd, today as todayStr } from '@/lib/date-utils';
import type { RtdbAsset, RtdbBilling, RtdbContract, RtdbEvent } from '@/lib/types/rtdb-entities';
import { fmt } from '@/lib/utils';
import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { ContractClient, type ContractRow } from './contract-client';

type SubpageId =
  | 'contract-list'
  | 'contract-idle'
  | 'contract-overdue'
  | 'contract-release-return'
  | 'contract-accident'
  | 'contract-consultation'
  | 'contract-fine'
  | 'contract-terminated';

interface TabSpec {
  id: SubpageId;
  label: string;
  action: string; // empty string => 버튼 숨김
  href?: string; // 신규 경로 (있으면 Link)
}

const TABS: TabSpec[] = [
  { id: 'contract-list', label: '계약목록', action: '+ 계약 신규', href: '/input?type=contract' },
  { id: 'contract-idle', label: '휴차풀', action: '+ 휴차 처리' },
  { id: 'contract-overdue', label: '미납관리', action: '+ 독촉 기록' },
  { id: 'contract-release-return', label: '출고·반납', action: '+ 출고/반납 등록' },
  { id: 'contract-accident', label: '사고관리', action: '+ 사고 접수' },
  { id: 'contract-consultation', label: '고객응대', action: '+ 응대 기록' },
  { id: 'contract-fine', label: '과태료', action: '+ 과태료 일괄' },
  { id: 'contract-terminated', label: '해지리스트', action: '' },
];

const TAB_CRUMB: Record<SubpageId, string> = {
  'contract-list': '계약목록',
  'contract-idle': '휴차풀',
  'contract-overdue': '미납관리',
  'contract-release-return': '출고·반납',
  'contract-accident': '사고관리',
  'contract-consultation': '고객응대',
  'contract-fine': '과태료',
  'contract-terminated': '해지리스트',
};

export default function ContractPage() {
  const gridRef = useRef<JpkGridApi<ContractRow> | null>(null);
  const [active, setActive] = useState<SubpageId>('contract-list');
  const [detailRow, setDetailRow] = useState<ContractRow | null>(null);
  const [count, setCount] = useState(0);

  const contracts = useRtdbCollection<RtdbContract>('contracts');
  const billings = useRtdbCollection<RtdbBilling>('billings');
  const assets = useRtdbCollection<RtdbAsset>('assets');
  const events = useRtdbCollection<RtdbEvent>('events');

  const alerts = useMemo(
    () => deriveContractAlerts(contracts.data, billings.data, events.data),
    [contracts.data, billings.data, events.data],
  );
  const stats = useMemo(
    () => deriveContractStats(contracts.data, billings.data),
    [contracts.data, billings.data],
  );
  const idleAlerts = useMemo(() => deriveIdleAlerts(assets.data), [assets.data]);
  const overdueAlerts = useMemo(
    () => deriveOverdueAlerts(billings.data, contracts.data),
    [billings.data, contracts.data],
  );

  const activeTab = TABS.find((t) => t.id === active) ?? TABS[0];

  return (
    <>
      <div className="page-head">
        <i className="ph ph-clipboard-text" />
        <div className="title">계약관리</div>
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
          {activeTab.action === '' ? null : activeTab.href ? (
            <Link
              href={activeTab.href}
              style={{
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                height: 24,
                padding: '0 8px',
                background: 'var(--c-accent)',
                color: 'var(--c-text-inv)',
                border: '1px solid var(--c-accent)',
              }}
            >
              {activeTab.action}
            </Link>
          ) : (
            <button type="button" disabled>
              {activeTab.action}
            </button>
          )}
        </div>
      </div>

      {active === 'contract-list' ? (
        <ContractListSubpage
          loading={contracts.loading}
          error={contracts.error}
          alerts={alerts}
          stats={stats}
          gridRef={gridRef}
          onCountChange={setCount}
          onRowClick={setDetailRow}
          count={count}
        />
      ) : active === 'contract-idle' ? (
        <IdleSubpage loading={assets.loading} rows={assets.data} alerts={idleAlerts} />
      ) : active === 'contract-overdue' ? (
        <OverdueSubpage loading={billings.loading} alerts={overdueAlerts} />
      ) : active === 'contract-fine' ? (
        <div className="v3-subpage is-active">
          <PenaltyBatchTool />
        </div>
      ) : (
        <PlaceholderSubpage label={activeTab.label} />
      )}

      <ContractDetailPanel contract={detailRow} onClose={() => setDetailRow(null)} />
    </>
  );
}

/* ── 계약목록 sub-page ── */
function ContractListSubpage({
  loading,
  error,
  alerts,
  stats,
  gridRef,
  onCountChange,
  onRowClick,
  count,
}: {
  loading: boolean;
  error: Error | null;
  alerts: AlertItem[];
  stats: ContractStats;
  gridRef: React.RefObject<JpkGridApi<ContractRow> | null>;
  onCountChange: (n: number) => void;
  onRowClick: (r: ContractRow) => void;
  count: number;
}) {
  const isClear = alerts.length === 0;
  const totalAlerts = alerts.reduce((sum, a) => sum + a.count, 0);

  return (
    <div className="v3-subpage is-active">
      <div className={`v3-alerts ${isClear ? 'is-clear' : ''}`}>
        <div className="v3-alerts-head">
          <span className="dot" />
          <span className="title">{isClear ? '계약 미결 없음' : '계약 미결'}</span>
          <span className="count">{isClear ? '· 0건' : `· ${totalAlerts}건`}</span>
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
                <button type="button" className="alert-btn">
                  {a.actionLabel}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="v3-table-wrap">
        {loading ? (
          <div style={{ padding: 24, color: 'var(--c-text-muted)', textAlign: 'center' }}>
            <i className="ph ph-spinner spin" /> 계약 데이터 로드 중...
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
            <ContractClient
              gridRef={gridRef}
              onCountChange={onCountChange}
              onRowClick={onRowClick}
            />
          </div>
        )}
      </div>

      <div className="v3-table-foot">
        <div>
          총 {count || stats.total}건<span className="sep">│</span>
          <span className="stat-dot active" />
          대여중 {stats.active}
          <span className="sep">│</span>
          <span className="stat-dot repair" />
          시동제어 {stats.engineLock}
          <span className="sep">│</span>
          <span className="stat-dot sale" />
          미납·반납지연 {stats.overdueOrLate}
          <span className="sep">│</span>
          <span className="stat-dot idle" />
          출고대기 {stats.waitingRelease}
        </div>
        <div style={{ color: 'var(--c-text-muted)' }}>행 클릭 시 계약 편집</div>
      </div>
    </div>
  );
}

/* ── 휴차풀 sub-page ── */
function IdleSubpage({
  loading,
  rows,
  alerts,
}: {
  loading: boolean;
  rows: readonly RtdbAsset[];
  alerts: IdleAlertGroup;
}) {
  const idleRows = useMemo(
    () => rows.filter((r) => isIdleStatus(r.asset_status ?? r.status)),
    [rows],
  );

  return (
    <div className="v3-subpage is-active">
      <div className="v3-alerts">
        <div className="v3-alerts-head">
          <span className="dot" />
          <span className="title">휴차풀</span>
          <span className="count">· {idleRows.length}대 (4 sub-status)</span>
        </div>
        <div className="v3-alerts-grid">
          <div className="v3-alert-card is-info">
            <i className="ph ph-wrench ico" />
            <div className="body">
              <div className="head">상품화중 [{alerts.preparing}]</div>
              <div className="desc">재임대 준비 작업 진행 (정비·청소·촬영)</div>
            </div>
            <button type="button" className="alert-btn">
              목록
            </button>
          </div>
          <div className="v3-alert-card">
            <i className="ph ph-bed ico" />
            <div className="body">
              <div className="head">차고지 대기 [{alerts.waiting}]</div>
              <div className="desc">반납 후 결정 미정</div>
            </div>
            <button type="button" className="alert-btn">
              결정
            </button>
          </div>
          <div className="v3-alert-card is-info">
            <i className="ph ph-check-circle ico" />
            <div className="body">
              <div className="head">상품완료 [{alerts.ready}]</div>
              <div className="desc">freepass-v2 노출 중 — 영업 대기</div>
            </div>
            <button type="button" className="alert-btn">
              노출
            </button>
          </div>
          <div className="v3-alert-card is-danger">
            <i className="ph ph-currency-krw ico" />
            <div className="body">
              <div className="head">매각 대기 [{alerts.disposal}]</div>
              <div className="desc">처분 진행 필요</div>
            </div>
            <button type="button" className="alert-btn">
              매각
            </button>
          </div>
        </div>
      </div>

      <div className="v3-table-wrap">
        {loading ? (
          <div style={{ padding: 24, color: 'var(--c-text-muted)', textAlign: 'center' }}>
            <i className="ph ph-spinner spin" /> 휴차 데이터 로드 중...
          </div>
        ) : idleRows.length === 0 ? (
          <div style={{ padding: 24, color: 'var(--c-text-muted)', textAlign: 'center' }}>
            휴차 차량이 없습니다.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr
                style={{
                  background: 'var(--c-bg-soft)',
                  borderBottom: '1px solid var(--c-border)',
                }}
              >
                <th style={cellTh(64)}>차량번호</th>
                <th style={{ ...cellTh(), textAlign: 'left' }}>차종</th>
                <th style={cellTh(60)}>회원사</th>
                <th style={cellTh(96)}>상태</th>
                <th style={{ ...cellTh(), textAlign: 'left' }}>다음 액션</th>
              </tr>
            </thead>
            <tbody>
              {idleRows.slice(0, 100).map((r, i) => (
                <tr key={r._key ?? i} style={{ borderBottom: '1px solid var(--c-border)' }}>
                  <td style={cellTd()}>{r.car_number ?? '—'}</td>
                  <td style={{ ...cellTd(), textAlign: 'left' }}>
                    {[r.manufacturer, r.car_model, r.detail_model].filter(Boolean).join(' ') || '—'}
                  </td>
                  <td style={cellTd()}>{r.partner_code ?? '—'}</td>
                  <td style={cellTd()}>{r.asset_status ?? r.status ?? '—'}</td>
                  <td style={{ ...cellTd(), textAlign: 'left', color: 'var(--c-text-muted)' }}>
                    {r.disposal_reason || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="v3-table-foot">
        <div>
          총 {idleRows.length}대<span className="sep">│</span>
          상품화중 {alerts.preparing}
          <span className="sep">│</span>
          차고지대기 {alerts.waiting}
          <span className="sep">│</span>
          상품완료 {alerts.ready}
          <span className="sep">│</span>
          매각대기 {alerts.disposal}
        </div>
      </div>
    </div>
  );
}

/* ── 미납관리 sub-page ── */
function OverdueSubpage({
  loading,
  alerts,
}: {
  loading: boolean;
  alerts: OverdueAlertGroup;
}) {
  const isClear = alerts.severeCount === 0 && alerts.midCount === 0 && alerts.lockedCount === 0;
  const total = alerts.severeCount + alerts.midCount;

  return (
    <div className="v3-subpage is-active">
      <div className={`v3-alerts ${isClear ? 'is-clear' : ''}`}>
        <div className="v3-alerts-head">
          <span className="dot" />
          <span className="title">{isClear ? '미납 없음' : '미납관리'}</span>
          <span className="count">
            {isClear ? '· 0건' : `· ${total}건 미납 + ${alerts.lockedCount}건 시동제어`}
          </span>
        </div>
        {!isClear && (
          <div className="v3-alerts-grid">
            <div className="v3-alert-card is-danger">
              <i className="ph ph-warning ico" />
              <div className="body">
                <div className="head">D+30 초과 [{alerts.severeCount}]</div>
                <div className="desc">{alerts.severeDesc || '해당 없음'}</div>
              </div>
              <button type="button" className="alert-btn">
                독촉
              </button>
            </div>
            <div className="v3-alert-card">
              <i className="ph ph-clock ico" />
              <div className="body">
                <div className="head">D+7~30 [{alerts.midCount}]</div>
                <div className="desc">{alerts.midDesc || '해당 없음'}</div>
              </div>
              <button type="button" className="alert-btn">
                독촉
              </button>
            </div>
            <div className="v3-alert-card is-danger">
              <i className="ph ph-lock ico" />
              <div className="body">
                <div className="head">시동제어 중 [{alerts.lockedCount}]</div>
                <div className="desc">{alerts.lockedDesc || '해당 없음'}</div>
              </div>
              <button type="button" className="alert-btn">
                확인
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="v3-table-wrap">
        {loading ? (
          <div style={{ padding: 24, color: 'var(--c-text-muted)', textAlign: 'center' }}>
            <i className="ph ph-spinner spin" /> 미납 데이터 로드 중...
          </div>
        ) : alerts.rows.length === 0 ? (
          <div style={{ padding: 24, color: 'var(--c-text-muted)', textAlign: 'center' }}>
            미납 청구가 없습니다.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr
                style={{
                  background: 'var(--c-bg-soft)',
                  borderBottom: '1px solid var(--c-border)',
                }}
              >
                <th style={cellTh(96)}>계약코드</th>
                <th style={cellTh(72)}>회차</th>
                <th style={cellTh(96)}>차량번호</th>
                <th style={cellTh(112)}>만기일</th>
                <th style={{ ...cellTh(96), textAlign: 'right' }}>청구액</th>
                <th style={{ ...cellTh(96), textAlign: 'right' }}>미수액</th>
                <th style={cellTh(72)}>경과</th>
              </tr>
            </thead>
            <tbody>
              {alerts.rows.slice(0, 100).map((r) => (
                <tr key={r.key} style={{ borderBottom: '1px solid var(--c-border)' }}>
                  <td style={cellTd()}>{r.contract_code}</td>
                  <td style={cellTd()}>{r.bill_count ?? '—'}</td>
                  <td style={cellTd()}>{r.car_number ?? '—'}</td>
                  <td style={cellTd()}>{r.due_date}</td>
                  <td style={{ ...cellTd(), textAlign: 'right' }}>{fmt(r.amount)}</td>
                  <td
                    style={{
                      ...cellTd(),
                      textAlign: 'right',
                      color: 'var(--c-err)',
                      fontWeight: 600,
                    }}
                  >
                    {fmt(r.outstanding)}
                  </td>
                  <td
                    style={{
                      ...cellTd(),
                      color: r.daysOver > 30 ? 'var(--c-err)' : 'var(--c-warn)',
                    }}
                  >
                    D+{r.daysOver}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="v3-table-foot">
        <div>
          총 {alerts.rows.length}건<span className="sep">│</span>
          D+30 초과 {alerts.severeCount}
          <span className="sep">│</span>
          D+7~30 {alerts.midCount}
          <span className="sep">│</span>
          시동제어 {alerts.lockedCount}
        </div>
      </div>
    </div>
  );
}

/* ── 미구현 sub-page placeholder ── */
function PlaceholderSubpage({ label }: { label: string }) {
  return (
    <div className="v3-subpage is-active">
      <div className="v3-placeholder">
        <i className="ph ph-hourglass-medium" />
        <div className="title">{label} 준비 중</div>
        <div className="desc">계약 단위로 통합된 {label} 관리 화면을 구현 중입니다.</div>
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

function deriveContractAlerts(
  contracts: readonly RtdbContract[],
  billings: readonly RtdbBilling[],
  events: readonly RtdbEvent[],
): AlertItem[] {
  const out: AlertItem[] = [];
  const tStr = todayStr();

  // 1) 미납 발생 (billings.paid_total < amount AND due_date < today)
  const overdueBills = billings.filter((b) => {
    const amount = Number(b.amount ?? 0);
    const paid = Number(b.paid_total ?? 0);
    if (amount <= 0) return false;
    if (paid >= amount) return false;
    if (!b.due_date) return false;
    return b.due_date < tStr;
  });
  if (overdueBills.length > 0) {
    const desc = overdueBills
      .slice(0, 3)
      .map((b) => {
        const days = daysAfter(b.due_date);
        const remain = Number(b.amount ?? 0) - Number(b.paid_total ?? 0);
        return `${b.contract_code ?? '—'} D+${days} ${fmt(remain)}`;
      })
      .join(' · ');
    out.push({
      key: 'overdue',
      severity: 'danger',
      icon: 'ph-warning',
      head: `미납 발생 ${overdueBills.length}건`,
      desc: desc + (overdueBills.length > 3 ? ` 외 ${overdueBills.length - 3}건` : ''),
      actionLabel: '독촉',
      count: overdueBills.length,
    });
  }

  // 2) 시동제어 중 (action_status === '시동제어')
  const engineLocked = contracts.filter((c) =>
    (c.action_status ?? '').toString().includes('시동제어'),
  );
  if (engineLocked.length > 0) {
    out.push({
      key: 'engine-lock',
      severity: 'warn',
      icon: 'ph-lock',
      head: `시동제어 중 ${engineLocked.length}건`,
      desc:
        engineLocked
          .slice(0, 3)
          .map((c) => c.car_number ?? c.contract_code ?? '—')
          .join(' · ') + (engineLocked.length > 3 ? ` 외 ${engineLocked.length - 3}건` : ''),
      actionLabel: '확인',
      count: engineLocked.length,
    });
  }

  // 3) 반납 지연 (만기 경과 + return event 없음, contract_status not 종료/해지)
  const returnedCodes = new Set(
    events
      .filter((e) => isReturnEvent(e.type))
      .map((e) => e.contract_code)
      .filter((v): v is string => Boolean(v)),
  );
  const lateReturn = contracts.filter((c) => {
    if (!c.contract_code) return false;
    if (isTerminatedStatus(c.contract_status)) return false;
    const end = computeContractEnd(c);
    if (!end || end >= tStr) return false;
    return !returnedCodes.has(c.contract_code);
  });
  if (lateReturn.length > 0) {
    out.push({
      key: 'late-return',
      severity: 'danger',
      icon: 'ph-tray-arrow-down',
      head: `반납 지연 ${lateReturn.length}건`,
      desc:
        lateReturn
          .slice(0, 3)
          .map((c) => {
            const end = computeContractEnd(c);
            return `${c.car_number ?? c.contract_code} D+${daysAfter(end)}`;
          })
          .join(' · ') + (lateReturn.length > 3 ? ` 외 ${lateReturn.length - 3}건` : ''),
      actionLabel: '처리',
      count: lateReturn.length,
    });
  }

  // 4) 출고 대기 (계약 상태가 진행/대기인데 release event 없음)
  const releasedCodes = new Set(
    events
      .filter((e) => isReleaseEvent(e.type))
      .map((e) => e.contract_code)
      .filter((v): v is string => Boolean(v)),
  );
  const pendingRelease = contracts.filter((c) => {
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
      key: 'pending-release',
      severity: 'info',
      icon: 'ph-paper-plane-tilt',
      head: `출고 대기 ${pendingRelease.length}건`,
      desc:
        pendingRelease
          .slice(0, 3)
          .map((c) => `${c.contract_code} ${c.contractor_name ?? ''}`.trim())
          .join(' · ') + (pendingRelease.length > 3 ? ` 외 ${pendingRelease.length - 3}건` : ''),
      actionLabel: '출고',
      count: pendingRelease.length,
    });
  }

  return out;
}

interface ContractStats {
  total: number;
  active: number;
  engineLock: number;
  overdueOrLate: number;
  waitingRelease: number;
}

function deriveContractStats(
  contracts: readonly RtdbContract[],
  billings: readonly RtdbBilling[],
): ContractStats {
  const tStr = todayStr();
  let active = 0;
  let engineLock = 0;
  let waitingRelease = 0;
  for (const c of contracts) {
    const status = (c.contract_status ?? '').toString();
    if ((c.action_status ?? '').toString().includes('시동제어')) engineLock += 1;
    if (status.includes('진행') || status.includes('대여')) active += 1;
    if (status.includes('대기')) waitingRelease += 1;
  }
  // overdueOrLate: 미납 발생 또는 만기 경과
  const overdueContracts = new Set<string>();
  for (const b of billings) {
    const amount = Number(b.amount ?? 0);
    const paid = Number(b.paid_total ?? 0);
    if (amount <= 0 || paid >= amount) continue;
    if (!b.due_date || b.due_date >= tStr) continue;
    if (b.contract_code) overdueContracts.add(b.contract_code);
  }
  for (const c of contracts) {
    if (isTerminatedStatus(c.contract_status)) continue;
    const end = computeContractEnd(c);
    if (end && end < tStr) {
      if (c.contract_code) overdueContracts.add(c.contract_code);
    }
  }
  return {
    total: contracts.length,
    active,
    engineLock,
    overdueOrLate: overdueContracts.size,
    waitingRelease,
  };
}

interface IdleAlertGroup {
  preparing: number;
  waiting: number;
  ready: number;
  disposal: number;
}

function deriveIdleAlerts(rows: readonly RtdbAsset[]): IdleAlertGroup {
  let preparing = 0;
  let waiting = 0;
  let ready = 0;
  let disposal = 0;
  for (const r of rows) {
    const s = (r.asset_status ?? r.status ?? '').toString();
    if (!isIdleStatus(s)) continue;
    if (s.includes('상품화')) preparing += 1;
    else if (s.includes('상품완료') || s.includes('노출')) ready += 1;
    else if (s.includes('매각')) disposal += 1;
    else waiting += 1; // 휴차/차고지
  }
  return { preparing, waiting, ready, disposal };
}

interface OverdueRow {
  key: string;
  contract_code: string;
  bill_count?: number;
  car_number?: string;
  due_date: string;
  amount: number;
  outstanding: number;
  daysOver: number;
}

interface OverdueAlertGroup {
  severeCount: number;
  midCount: number;
  lockedCount: number;
  severeDesc: string;
  midDesc: string;
  lockedDesc: string;
  rows: OverdueRow[];
}

function deriveOverdueAlerts(
  billings: readonly RtdbBilling[],
  contracts: readonly RtdbContract[],
): OverdueAlertGroup {
  const tStr = todayStr();
  const rows: OverdueRow[] = [];
  for (const b of billings) {
    const amount = Number(b.amount ?? 0);
    const paid = Number(b.paid_total ?? 0);
    if (amount <= 0 || paid >= amount) continue;
    if (!b.due_date || b.due_date >= tStr) continue;
    rows.push({
      key: b._key ?? `${b.contract_code}-${b.bill_count}`,
      contract_code: b.contract_code ?? '—',
      bill_count: b.bill_count,
      car_number: b.car_number,
      due_date: b.due_date,
      amount,
      outstanding: amount - paid,
      daysOver: daysAfter(b.due_date),
    });
  }
  rows.sort((a, b) => b.daysOver - a.daysOver);

  const severe = rows.filter((r) => r.daysOver > 30);
  const mid = rows.filter((r) => r.daysOver >= 7 && r.daysOver <= 30);
  const locked = contracts.filter((c) => (c.action_status ?? '').toString().includes('시동제어'));

  return {
    severeCount: severe.length,
    midCount: mid.length,
    lockedCount: locked.length,
    severeDesc:
      severe
        .slice(0, 4)
        .map((r) => `${r.contract_code} ${fmt(r.outstanding)}`)
        .join(' · ') + (severe.length > 4 ? ` 외 ${severe.length - 4}건` : ''),
    midDesc:
      mid
        .slice(0, 4)
        .map((r) => `${r.contract_code} ${fmt(r.outstanding)}`)
        .join(' · ') + (mid.length > 4 ? ` 외 ${mid.length - 4}건` : ''),
    lockedDesc:
      locked
        .slice(0, 4)
        .map((c) => c.car_number ?? c.contract_code ?? '—')
        .join(' · ') + (locked.length > 4 ? ` 외 ${locked.length - 4}건` : ''),
    rows,
  };
}

/* ── helpers ── */

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

function isIdleStatus(v: unknown): boolean {
  const s = (v ?? '').toString();
  return (
    s.includes('휴차') ||
    s.includes('상품화') ||
    s.includes('상품완료') ||
    s.includes('차고지') ||
    s.includes('매각대기') ||
    s.includes('매각예정')
  );
}

function daysAfter(date?: string): number {
  if (!date) return 0;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
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
