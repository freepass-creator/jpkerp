'use client';

import { EditDialog } from '@/components/shared/edit-dialog';
import type { JpkGridApi } from '@/components/shared/jpk-grid';
import { PenaltyBatchTool } from '@/components/v3/PenaltyBatchTool';
import { AlimtalkSendDialog, type AlimtalkTarget } from '@/components/v3/alimtalk-send-dialog';
import {
  AlertCard,
  AlertsPanel,
  ErrorBox,
  LoadingBox,
  PanelHeader,
  PlaceholderBlock,
  StatDot,
  StatSep,
  TableFoot,
  cellTd,
  cellTh,
} from '@/components/v3/panels';
import { useAuth } from '@/lib/auth/context';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import { computeContractEnd, today as todayStr } from '@/lib/date-utils';
import { saveEvent } from '@/lib/firebase/events';
import { sanitizeCarNumber } from '@/lib/format-input';
import type { RtdbAsset, RtdbBilling, RtdbContract, RtdbEvent } from '@/lib/types/rtdb-entities';
import type { AlertItem } from '@/lib/types/v3-ui';
import { fmt } from '@/lib/utils';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ReturnScheduleClient } from '../return-schedule/return-schedule-client';
import { ExpiringClient, type ExpiringRow } from '../status/expiring/expiring-client';
import { type IgRow, IgnitionClient } from '../status/ignition/ignition-client';
import { ContractClient, type ContractRow } from './contract-client';

type SubpageId =
  | 'contract-list'
  | 'contract-idle'
  | 'contract-overdue'
  | 'contract-release-return'
  | 'contract-accident'
  | 'contract-consultation'
  | 'contract-fine'
  | 'contract-terminated'
  | 'contract-ignition'
  | 'contract-expiring'
  | 'contract-return-schedule';

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
  { id: 'contract-ignition', label: '시동제어', action: '+ 제어 등록' },
  { id: 'contract-release-return', label: '출고·반납', action: '+ 출고/반납 등록' },
  { id: 'contract-return-schedule', label: '반납일정', action: '+ 반납 처리' },
  { id: 'contract-expiring', label: '만기도래', action: '' },
  { id: 'contract-accident', label: '사고관리', action: '+ 사고 접수' },
  { id: 'contract-consultation', label: '고객응대', action: '+ 응대 기록' },
  { id: 'contract-fine', label: '과태료', action: '+ 과태료 일괄' },
  { id: 'contract-terminated', label: '해지리스트', action: '' },
];

const TAB_CRUMB: Record<SubpageId, string> = {
  'contract-list': '계약목록',
  'contract-idle': '휴차풀',
  'contract-overdue': '미납관리',
  'contract-ignition': '시동제어',
  'contract-release-return': '출고·반납',
  'contract-return-schedule': '반납일정',
  'contract-expiring': '만기도래',
  'contract-accident': '사고관리',
  'contract-consultation': '고객응대',
  'contract-fine': '과태료',
  'contract-terminated': '해지리스트',
};

/** URL `?tab=` 약자 → 내부 SubpageId */
const TAB_ALIAS: Record<string, SubpageId> = {
  list: 'contract-list',
  idle: 'contract-idle',
  overdue: 'contract-overdue',
  ignition: 'contract-ignition',
  lock: 'contract-ignition',
  'engine-lock': 'contract-ignition',
  'release-return': 'contract-release-return',
  release: 'contract-release-return',
  return: 'contract-release-return',
  'return-schedule': 'contract-return-schedule',
  expiring: 'contract-expiring',
  expire: 'contract-expiring',
  accident: 'contract-accident',
  consultation: 'contract-consultation',
  fine: 'contract-fine',
  penalty: 'contract-fine',
  terminated: 'contract-terminated',
};

export default function ContractPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') ?? '';
  // filterParam은 향후 sub-tab 내부 필터링에 사용 (locked / late / pending 등) — 현재는 표시만
  const filterParam = searchParams.get('filter') ?? '';
  const initialTab = TAB_ALIAS[tabParam] ?? 'contract-list';

  const gridRef = useRef<JpkGridApi<ContractRow> | null>(null);
  const [active, setActive] = useState<SubpageId>(initialTab);
  const [count, setCount] = useState(0);

  const contracts = useRtdbCollection<RtdbContract>('contracts');
  const billings = useRtdbCollection<RtdbBilling>('billings');
  const assets = useRtdbCollection<RtdbAsset>('assets');
  const events = useRtdbCollection<RtdbEvent>('events');

  // biome-ignore lint/correctness/useExhaustiveDependencies: tabParam만 추적
  useEffect(() => {
    const next = TAB_ALIAS[tabParam];
    if (next && next !== active) setActive(next);
  }, [tabParam]);

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
  const [idleModalOpen, setIdleModalOpen] = useState(false);

  /** sub-tab [+] 버튼 클릭 → 라우팅 또는 모달 */
  const handleAction = () => {
    switch (active) {
      case 'contract-idle':
        setIdleModalOpen(true);
        break;
      case 'contract-overdue':
        router.push('/operation?tab=eungdae&topic=미납독촉&filter=overdue');
        break;
      case 'contract-ignition':
        // 시동제어 등록은 미납 → 독촉 → 제어 흐름으로 작업 (현재는 toast 안내)
        toast.info('시동제어 등록은 미납관리 탭의 행에서 처리하세요');
        break;
      case 'contract-release-return':
        router.push('/operation?tab=chulgo');
        break;
      case 'contract-return-schedule':
        router.push('/operation?tab=banab');
        break;
      case 'contract-accident':
        router.push('/operation?tab=sago');
        break;
      case 'contract-consultation':
        router.push('/operation?tab=eungdae');
        break;
      case 'contract-fine':
        // 같은 탭 내 PenaltyBatchTool — 별도 액션 없음
        toast.info('아래 일괄 도구를 사용하세요');
        break;
      default:
        break;
    }
  };

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
            <Link href={activeTab.href}>{activeTab.action}</Link>
          ) : (
            <button type="button" onClick={handleAction}>
              {activeTab.action}
            </button>
          )}
        </div>
      </div>

      <IdleProcessDialog open={idleModalOpen} onClose={() => setIdleModalOpen(false)} />

      {active === 'contract-list' ? (
        <ContractListSubpage
          loading={contracts.loading}
          error={contracts.error}
          alerts={alerts}
          stats={stats}
          gridRef={gridRef}
          onCountChange={setCount}
          count={count}
        />
      ) : active === 'contract-idle' ? (
        <IdleSubpage loading={assets.loading} rows={assets.data} alerts={idleAlerts} />
      ) : active === 'contract-overdue' ? (
        <OverdueSubpage loading={billings.loading} alerts={overdueAlerts} filter={filterParam} />
      ) : active === 'contract-ignition' ? (
        <IgnitionSubpage />
      ) : active === 'contract-expiring' ? (
        <ExpiringSubpage />
      ) : active === 'contract-return-schedule' ? (
        <ReturnScheduleSubpage />
      ) : active === 'contract-fine' ? (
        <div className="v3-subpage is-active">
          <PenaltyBatchTool />
        </div>
      ) : (
        <PlaceholderSubpage label={activeTab.label} />
      )}
    </>
  );
}

/* ── 시동제어 sub-page (action_status='시동제어' 계약) ── */
function IgnitionSubpage() {
  const igGridRef = useRef<JpkGridApi<IgRow> | null>(null);
  const [igCount, setIgCount] = useState(0);
  const igAlerts = useMemo<AlertItem[]>(() => {
    if (igCount === 0) return [];
    return [
      {
        key: 'ignition-active',
        severity: 'warn',
        icon: 'ph-lock',
        head: `시동제어 중 ${igCount}건`,
        desc: '미납 누적으로 제어된 차량 — 입금 확인 후 해제 처리',
        actionLabel: '확인',
        count: igCount,
      },
    ];
  }, [igCount]);
  return (
    <div className="v3-subpage is-active">
      <AlertsPanel
        alerts={igAlerts}
        clearTitle="시동제어 차량 없음"
        pendingTitle="시동제어"
        pendingCountLabel={`· ${igCount}건 제어 중`}
      />
      <div className="v3-table-wrap">
        <div className="v3-grid-host">
          <IgnitionClient gridRef={igGridRef} onCountChange={setIgCount} />
        </div>
      </div>
      <TableFoot trailing="차량·계약자·미납회수·연체일 — 입금 확인 후 제어해제">
        총 {igCount}건
      </TableFoot>
    </div>
  );
}

/* ── 만기도래 sub-page (3개월 이내 만기 계약) ── */
function ExpiringSubpage() {
  const exGridRef = useRef<JpkGridApi<ExpiringRow> | null>(null);
  const [exCount, setExCount] = useState(0);
  return (
    <div className="v3-subpage is-active">
      <div className="v3-alerts">
        <PanelHeader
          icon="ph-calendar-x"
          title="만기 도래"
          count={`· ${exCount}건 (D-day 임박순)`}
        />
      </div>
      <div className="v3-table-wrap">
        <div className="v3-grid-host">
          <ExpiringClient gridRef={exGridRef} onCountChange={setExCount} />
        </div>
      </div>
      <TableFoot trailing="기간 필터로 1·2·3·6개월 범위 조정 가능">총 {exCount}건</TableFoot>
    </div>
  );
}

/* ── 반납일정 sub-page (3개월 이내 반납 예정 계약) ── */
function ReturnScheduleSubpage() {
  return (
    <div className="v3-subpage is-active">
      <div className="v3-alerts">
        <PanelHeader icon="ph-arrow-u-down-left" title="반납 일정" count="· 3개월 이내 만기 계약" />
      </div>
      <div className="v3-table-wrap">
        <div className="v3-grid-host">
          <ReturnScheduleClient />
        </div>
      </div>
      <TableFoot trailing="만기일 기준 D-day 정렬 — 반납 처리는 출고·반납 탭에서">
        활성 계약 만기 도래
      </TableFoot>
    </div>
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
  count,
}: {
  loading: boolean;
  error: Error | null;
  alerts: AlertItem[];
  stats: ContractStats;
  gridRef: React.RefObject<JpkGridApi<ContractRow> | null>;
  onCountChange: (n: number) => void;
  count: number;
}) {
  return (
    <div className="v3-subpage is-active">
      <AlertsPanel alerts={alerts} clearTitle="계약 미결 없음" pendingTitle="계약 미결" />

      <div className="v3-table-wrap">
        {loading ? (
          <LoadingBox label="계약 데이터 로드 중..." />
        ) : error ? (
          <ErrorBox error={error} />
        ) : (
          <div className="v3-grid-host">
            <ContractClient gridRef={gridRef} onCountChange={onCountChange} />
          </div>
        )}
      </div>

      <TableFoot>
        총 {count || stats.total}건
        <StatSep />
        <StatDot variant="active" />
        대여중 {stats.active}
        <StatSep />
        <StatDot variant="repair" />
        시동제어 {stats.engineLock}
        <StatSep />
        <StatDot variant="sale" />
        미납·반납지연 {stats.overdueOrLate}
        <StatSep />
        <StatDot variant="idle" />
        출고대기 {stats.waitingRelease}
      </TableFoot>
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
        <PanelHeader title="휴차풀" count={`· ${idleRows.length}대 (4 sub-status)`} />
        <div className="v3-alerts-grid">
          <AlertCard
            alert={{
              key: 'preparing',
              severity: 'info',
              icon: 'ph-wrench',
              head: `상품화중 [${alerts.preparing}]`,
              desc: '재임대 준비 작업 진행 (정비·청소·촬영)',
              actionLabel: '목록',
              count: alerts.preparing,
            }}
          />
          <AlertCard
            alert={{
              key: 'waiting',
              severity: 'warn',
              icon: 'ph-bed',
              head: `차고지 대기 [${alerts.waiting}]`,
              desc: '반납 후 결정 미정',
              actionLabel: '결정',
              count: alerts.waiting,
            }}
          />
          <AlertCard
            alert={{
              key: 'ready',
              severity: 'info',
              icon: 'ph-check-circle',
              head: `상품완료 [${alerts.ready}]`,
              desc: 'freepass-v2 노출 중 — 영업 대기',
              actionLabel: '노출',
              count: alerts.ready,
            }}
          />
          <AlertCard
            alert={{
              key: 'disposal',
              severity: 'danger',
              icon: 'ph-currency-krw',
              head: `매각 대기 [${alerts.disposal}]`,
              desc: '처분 진행 필요',
              actionLabel: '매각',
              count: alerts.disposal,
            }}
          />
        </div>
      </div>

      <div className="v3-table-wrap">
        {loading ? (
          <LoadingBox label="휴차 데이터 로드 중..." />
        ) : idleRows.length === 0 ? (
          <LoadingBox label="휴차 차량이 없습니다." />
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

      <TableFoot>
        총 {idleRows.length}대
        <StatSep />
        상품화중 {alerts.preparing}
        <StatSep />
        차고지대기 {alerts.waiting}
        <StatSep />
        상품완료 {alerts.ready}
        <StatSep />
        매각대기 {alerts.disposal}
      </TableFoot>
    </div>
  );
}

/* ── 미납관리 sub-page ── */
function OverdueSubpage({
  loading,
  alerts,
  filter,
}: {
  loading: boolean;
  alerts: OverdueAlertGroup;
  filter?: string;
}) {
  // filter='locked' → 시동제어 카드 강조 hint (현재는 표시만, 미래 행 필터에 활용)
  void filter;
  const [atTarget, setAtTarget] = useState<AlimtalkTarget | null>(null);
  const overdueAlertItems = useMemo<AlertItem[]>(() => {
    const out: AlertItem[] = [];
    if (alerts.severeCount > 0) {
      out.push({
        key: 'severe',
        severity: 'danger',
        icon: 'ph-warning',
        head: `D+30 초과 [${alerts.severeCount}]`,
        desc: alerts.severeDesc || '해당 없음',
        actionLabel: '독촉',
        count: alerts.severeCount,
      });
    }
    if (alerts.midCount > 0) {
      out.push({
        key: 'mid',
        severity: 'warn',
        icon: 'ph-clock',
        head: `D+7~30 [${alerts.midCount}]`,
        desc: alerts.midDesc || '해당 없음',
        actionLabel: '독촉',
        count: alerts.midCount,
      });
    }
    if (alerts.lockedCount > 0) {
      out.push({
        key: 'locked',
        severity: 'danger',
        icon: 'ph-lock',
        head: `시동제어 중 [${alerts.lockedCount}]`,
        desc: alerts.lockedDesc || '해당 없음',
        actionLabel: '확인',
        count: alerts.lockedCount,
      });
    }
    return out;
  }, [alerts]);
  const total = alerts.severeCount + alerts.midCount;

  return (
    <div className="v3-subpage is-active">
      <AlertsPanel
        alerts={overdueAlertItems}
        clearTitle="미납 없음"
        pendingTitle="미납관리"
        pendingCountLabel={`· ${total}건 미납 + ${alerts.lockedCount}건 시동제어`}
      />

      <div className="v3-table-wrap">
        {loading ? (
          <LoadingBox label="미납 데이터 로드 중..." />
        ) : alerts.rows.length === 0 ? (
          <LoadingBox label="미납 청구가 없습니다." />
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
                <th style={cellTh(86)}>조치</th>
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
                  <td style={{ ...cellTd(), padding: '4px 6px' }}>
                    <button
                      type="button"
                      onClick={() =>
                        setAtTarget({
                          contract_code: r.contract_code,
                          car_number: r.car_number,
                          contractor_name: r.contractor_name,
                          contractor_phone: r.contractor_phone,
                          unpaid_total: r.outstanding,
                          bill_count: r.bill_count,
                          max_days: r.daysOver,
                        })
                      }
                      style={{
                        fontSize: 11,
                        padding: '2px 8px',
                        border: '1px solid var(--c-border)',
                        background: 'var(--c-surface)',
                        color: 'var(--c-text)',
                        borderRadius: 2,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                      }}
                      title={
                        r.contractor_phone
                          ? `${r.contractor_name ?? ''} ${r.contractor_phone}`
                          : '알림톡 발송'
                      }
                    >
                      <i className="ph ph-chat-text" />
                      알림톡
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <TableFoot>
        총 {alerts.rows.length}건
        <StatSep />
        D+30 초과 {alerts.severeCount}
        <StatSep />
        D+7~30 {alerts.midCount}
        <StatSep />
        시동제어 {alerts.lockedCount}
      </TableFoot>

      <AlimtalkSendDialog
        open={atTarget !== null}
        target={atTarget}
        onClose={() => setAtTarget(null)}
      />
    </div>
  );
}

/* ── 미구현 sub-page placeholder ── */
function PlaceholderSubpage({ label }: { label: string }) {
  return (
    <div className="v3-subpage is-active">
      <PlaceholderBlock
        title={`${label} 준비 중`}
        desc={`계약 단위로 통합된 ${label} 관리 화면을 구현 중입니다.`}
      />
    </div>
  );
}

/* ── 휴차 처리 모달 (commodify | idle 이벤트 push) ── */
function IdleProcessDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const [carNumber, setCarNumber] = useState('');
  const [kind, setKind] = useState<'idle' | 'commodify'>('idle');
  const [reason, setReason] = useState('');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setCarNumber('');
    setKind('idle');
    setReason('');
    setMemo('');
  };

  const onSave = async () => {
    if (!carNumber) {
      toast.error('차량번호를 입력하세요');
      return;
    }
    setBusy(true);
    try {
      await saveEvent({
        type: kind, // 'idle' or 'commodify'
        date: todayStr(),
        title: kind === 'commodify' ? '상품화 처리' : '휴차 처리',
        car_number: sanitizeCarNumber(carNumber),
        memo: [reason, memo].filter(Boolean).join(' / ') || undefined,
        handler_uid: user?.uid,
        handler: user?.displayName ?? user?.email ?? undefined,
      });
      toast.success(kind === 'commodify' ? '상품화 처리 완료' : '휴차 처리 완료');
      reset();
      onClose();
    } catch (e) {
      toast.error(`저장 실패: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <EditDialog
      open={open}
      title="휴차 처리"
      subtitle="차량 상태를 휴차/상품화로 변경"
      onClose={() => {
        reset();
        onClose();
      }}
      onSave={onSave}
      saving={busy}
      width={460}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label>
          <div style={dialogLbl()}>차량번호 *</div>
          <input
            type="text"
            value={carNumber}
            onChange={(e) => setCarNumber(e.target.value)}
            placeholder="12가 3456"
            style={dialogInput()}
          />
        </label>
        <label>
          <div style={dialogLbl()}>종류</div>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as 'idle' | 'commodify')}
            style={dialogInput()}
          >
            <option value="idle">휴차 (운행 중지)</option>
            <option value="commodify">상품화 (재임대 준비)</option>
          </select>
        </label>
        <label>
          <div style={dialogLbl()}>사유</div>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="만기반납 / 사고복귀 / 정비대기 등"
            style={dialogInput()}
          />
        </label>
        <label>
          <div style={dialogLbl()}>메모</div>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={2}
            style={dialogInput()}
          />
        </label>
      </div>
    </EditDialog>
  );
}

function dialogLbl(): React.CSSProperties {
  return { fontSize: 11, color: 'var(--c-text-sub)', marginBottom: 2, fontWeight: 600 };
}
function dialogInput(): React.CSSProperties {
  return {
    width: '100%',
    padding: '6px 8px',
    border: '1px solid var(--c-border)',
    background: 'var(--c-surface)',
    color: 'var(--c-text)',
    fontFamily: 'inherit',
    fontSize: 13,
    borderRadius: 2,
  };
}

/* ═════════ 미결 derive 로직 ═════════ */

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
  contractor_name?: string;
  contractor_phone?: string;
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
  const contractByCode = new Map<string, RtdbContract>();
  for (const c of contracts) {
    if (c.contract_code) contractByCode.set(c.contract_code, c);
  }
  const rows: OverdueRow[] = [];
  for (const b of billings) {
    const amount = Number(b.amount ?? 0);
    const paid = Number(b.paid_total ?? 0);
    if (amount <= 0 || paid >= amount) continue;
    if (!b.due_date || b.due_date >= tStr) continue;
    const c = b.contract_code ? contractByCode.get(b.contract_code) : undefined;
    rows.push({
      key: b._key ?? `${b.contract_code}-${b.bill_count}`,
      contract_code: b.contract_code ?? '—',
      bill_count: b.bill_count,
      car_number: b.car_number ?? c?.car_number,
      contractor_name: c?.contractor_name,
      contractor_phone: c?.contractor_phone,
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
