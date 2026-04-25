'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import type { JpkGridApi } from '@/components/shared/jpk-grid';
import { AssetsGrid } from './assets-grid';

type AssetRow = {
  _key?: string;
  car_number?: string;
  partner_code?: string;
  manufacturer?: string;
  car_model?: string;
  detail_model?: string;
  trim?: string;
  vin?: string;
  status?: string;
  insurance_id?: string;
  insurance_no?: string;
  registration_image?: string;
  buy_type?: string;
  loan_id?: string;
  [k: string]: unknown;
};

type SubpageId =
  | 'asset-list'
  | 'asset-insurance'
  | 'asset-repair'
  | 'asset-inspection'
  | 'asset-tax'
  | 'asset-disposal';

interface TabSpec {
  id: SubpageId;
  label: string;
  action: string;
}

const TABS: TabSpec[] = [
  { id: 'asset-list', label: '자산목록', action: '+ 자산 신규' },
  { id: 'asset-insurance', label: '보험', action: '+ 보험 등록' },
  { id: 'asset-repair', label: '수선', action: '+ 수선 등록' },
  { id: 'asset-inspection', label: '검사', action: '+ 검사 등록' },
  { id: 'asset-tax', label: '자동차세', action: '+ 납부 등록' },
  { id: 'asset-disposal', label: '처분', action: '+ 처분 등록' },
];

const TAB_CRUMB: Record<SubpageId, string> = {
  'asset-list': '자산목록',
  'asset-insurance': '보험',
  'asset-repair': '수선',
  'asset-inspection': '검사',
  'asset-tax': '자동차세',
  'asset-disposal': '처분',
};

export default function AssetPage() {
  const gridRef = useRef<JpkGridApi<AssetRow> | null>(null);
  const [active, setActive] = useState<SubpageId>('asset-list');
  const assets = useRtdbCollection<AssetRow>('assets');

  const stats = useMemo(() => deriveStats(assets.data), [assets.data]);
  const alerts = useMemo(() => deriveAlerts(assets.data), [assets.data]);

  const activeTab = TABS.find((t) => t.id === active) ?? TABS[0];
  const isList = active === 'asset-list';

  return (
    <>
      <div className="page-head">
        <i className="ph ph-car-simple" />
        <div className="title">자산관리</div>
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
          {isList ? (
            <Link
              href="/input?type=asset"
              className=""
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

      {isList ? (
        <AssetListSubpage
          loading={assets.loading}
          error={assets.error}
          alerts={alerts}
          stats={stats}
          gridRef={gridRef}
        />
      ) : (
        <PlaceholderSubpage label={activeTab.label} />
      )}
    </>
  );
}

/* ── 자산목록 sub-page ── */
function AssetListSubpage({
  loading,
  error,
  alerts,
  stats,
  gridRef,
}: {
  loading: boolean;
  error: Error | null;
  alerts: AlertItem[];
  stats: AssetStats;
  gridRef: React.RefObject<JpkGridApi<AssetRow> | null>;
}) {
  const isClear = alerts.length === 0;
  const totalAlerts = alerts.reduce((sum, a) => sum + a.count, 0);

  return (
    <div className="v3-subpage is-active">
      {/* 미결 패널 */}
      <div className={`v3-alerts ${isClear ? 'is-clear' : ''}`}>
        <div className="v3-alerts-head">
          <span className="dot" />
          <span className="title">{isClear ? '자산 데이터 정상' : '자산 데이터 미결'}</span>
          <span className="count">
            {isClear ? '· 0건' : `· ${totalAlerts}건 (입력 미완성)`}
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

      {/* AG Grid wrapped in v3 table panel */}
      <div className="v3-table-wrap">
        {loading ? (
          <div style={{ padding: 24, color: 'var(--c-text-muted)', textAlign: 'center' }}>
            <i className="ph ph-spinner spin" /> 차량 데이터 로드 중...
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
            <AssetsGrid gridRef={gridRef} />
          </div>
        )}
      </div>

      {/* table-foot: 총 N대 + 상태별 카운트 */}
      <div className="v3-table-foot">
        <div>
          총 {stats.total}대
          <span className="sep">│</span>
          <span className="stat-dot active" />대여중 {stats.active}
          <span className="sep">│</span>
          <span className="stat-dot idle" />휴차 {stats.idle}
          <span className="sep">│</span>
          <span className="stat-dot repair" />수선중 {stats.repair}
          <span className="sep">│</span>
          <span className="stat-dot sale" />매각예정 {stats.sale}
        </div>
        <div style={{ color: 'var(--c-text-muted)' }}>
          행 클릭 시 차량 프로필
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
        <div className="desc">차량 단위로 통합된 {label} 관리 화면을 구현 중입니다.</div>
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

function deriveAlerts(rows: readonly AssetRow[]): AlertItem[] {
  const out: AlertItem[] = [];

  // 1) 차종 매칭 안 됨 (제조사 OR 차종 모델 미입력)
  const noModel = rows.filter(
    (r) => !nonEmpty(r.manufacturer) || !nonEmpty(r.car_model),
  );
  if (noModel.length > 0) {
    out.push({
      key: 'no-model',
      severity: 'danger',
      icon: 'ph-car-profile',
      head: `차종 매칭 안 됨 ${noModel.length}대`,
      desc: noModel
        .slice(0, 3)
        .map((r) => r.car_number ?? '(번호없음)')
        .join(' · ') + (noModel.length > 3 ? ` 외 ${noModel.length - 3}대` : ''),
      actionLabel: '보완',
      count: noModel.length,
    });
  }

  // 2) VIN 미입력
  const noVin = rows.filter((r) => !nonEmpty(r.vin));
  if (noVin.length > 0) {
    out.push({
      key: 'no-vin',
      severity: 'danger',
      icon: 'ph-hash',
      head: `VIN 미입력 ${noVin.length}대`,
      desc: noVin
        .slice(0, 3)
        .map((r) => r.car_number ?? '(번호없음)')
        .join(' · ') + (noVin.length > 3 ? ` 외 ${noVin.length - 3}대` : ''),
      actionLabel: '입력',
      count: noVin.length,
    });
  }

  // 3) 보험 미등록
  const noIns = rows.filter(
    (r) => !nonEmpty(r.insurance_id) && !nonEmpty(r.insurance_no),
  );
  if (noIns.length > 0) {
    out.push({
      key: 'no-insurance',
      severity: 'warn',
      icon: 'ph-shield-check',
      head: `보험 미등록 ${noIns.length}대`,
      desc: '신규 등록 후 보험 정보 미연결',
      actionLabel: '등록',
      count: noIns.length,
    });
  }

  // 4) 할부 매입 차량인데 스케줄 없음
  const loanMissing = rows.filter(
    (r) => isLoanBuy(r.buy_type) && !nonEmpty(r.loan_id),
  );
  if (loanMissing.length > 0) {
    out.push({
      key: 'no-loan',
      severity: 'warn',
      icon: 'ph-chart-bar',
      head: `할부 정보 미등록 ${loanMissing.length}대`,
      desc: loanMissing
        .slice(0, 2)
        .map((r) => r.car_number ?? '(번호없음)')
        .join(' · ') + ' (할부 매입인데 스케줄 없음)',
      actionLabel: '등록',
      count: loanMissing.length,
    });
  }

  // 5) 등록증 사진 없음
  const noReg = rows.filter((r) => !nonEmpty(r.registration_image));
  if (noReg.length > 0) {
    out.push({
      key: 'no-reg-image',
      severity: 'info',
      icon: 'ph-file-text',
      head: `등록증 사진 없음 ${noReg.length}대`,
      desc: noReg
        .slice(0, 3)
        .map((r) => r.car_number ?? '(번호없음)')
        .join(' · ') + (noReg.length > 3 ? ` 외 ${noReg.length - 3}대` : ''),
      actionLabel: '업로드',
      count: noReg.length,
    });
  }

  return out;
}

interface AssetStats {
  total: number;
  active: number;
  idle: number;
  repair: number;
  sale: number;
}

function deriveStats(rows: readonly AssetRow[]): AssetStats {
  let active = 0;
  let idle = 0;
  let repair = 0;
  let sale = 0;
  for (const r of rows) {
    const s = (r.status ?? '').toString();
    if (matches(s, ['대여중', '운행중', 'active'])) active += 1;
    else if (matches(s, ['수선중', '수리중', 'repair'])) repair += 1;
    else if (matches(s, ['매각예정', '매각', 'sale'])) sale += 1;
    else idle += 1; // 휴차·미상은 idle 버킷
  }
  return { total: rows.length, active, idle, repair, sale };
}

function nonEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  const s = String(v).trim();
  return s.length > 0;
}

function isLoanBuy(v: unknown): boolean {
  if (!nonEmpty(v)) return false;
  const s = String(v).trim();
  return s.includes('할부') || s.toLowerCase() === 'loan' || s.includes('리스');
}

function matches(value: string, needles: readonly string[]): boolean {
  const v = value.toLowerCase();
  return needles.some((n) => v.includes(n.toLowerCase()));
}
