'use client';

/**
 * 자산 상세 슬라이드 패널 (Phase 9 — 타임라인)
 * - 우측 슬라이드 (520px) + 백드롭
 * - 차량 기본정보 + events 시간순 타임라인
 * - 카테고리 필터 칩 (수납·정비·사고·응대·출고/반납·매각)
 */

import { useRtdbCollection } from '@/lib/collections/rtdb';
import { computeContractEnd, computeTotalDue, today as todayStr } from '@/lib/date-utils';
import { metaFor } from '@/lib/event-meta';
import type { RtdbBilling, RtdbContract, RtdbEvent } from '@/lib/types/rtdb-entities';
import { fmt, fmtDate } from '@/lib/utils';
import { useEffect, useMemo, useState } from 'react';

interface AssetSummary {
  _key?: string;
  car_number?: string;
  manufacturer?: string;
  car_model?: string;
  detail_model?: string;
  status?: string;
  asset_status?: string;
  partner_code?: string;
  vin?: string;
  car_year?: number | string;
  current_mileage?: number | string;
  acquisition_cost?: number | string;
  buy_type?: string;
  ext_color?: string;
  fuel_type?: string;
  [k: string]: unknown;
}

interface Props {
  asset: AssetSummary | null;
  onClose: () => void;
}

type CategoryKey = 'all' | 'pay' | 'maint' | 'accident' | 'contact' | 'flow' | 'dispose';

const CATEGORIES: { key: CategoryKey; label: string; types: string[] }[] = [
  { key: 'all', label: '전체', types: [] },
  { key: 'pay', label: '수납', types: ['bank_tx', 'card_tx', 'collect'] },
  { key: 'maint', label: '정비', types: ['maint', 'maintenance', 'repair', 'wash', 'fuel'] },
  { key: 'accident', label: '사고', types: ['accident', 'penalty'] },
  { key: 'contact', label: '응대', types: ['contact'] },
  { key: 'flow', label: '출고/반납', types: ['delivery', 'return', 'force', 'transfer', 'key'] },
  { key: 'dispose', label: '매각', types: ['product', 'insurance'] },
];

export function AssetDetailPanel({ asset, onClose }: Props) {
  const events = useRtdbCollection<RtdbEvent>('events');
  const contracts = useRtdbCollection<RtdbContract>('contracts');
  const billings = useRtdbCollection<RtdbBilling>('billings');
  const [active, setActive] = useState<CategoryKey>('all');
  const [eventDetail, setEventDetail] = useState<RtdbEvent | null>(null);

  // ESC 닫기
  useEffect(() => {
    if (!asset) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [asset, onClose]);

  const carNumber = asset?.car_number;
  const carEvents = useMemo(() => {
    if (!carNumber) return [] as RtdbEvent[];
    return events.data
      .filter((e) => e.car_number === carNumber)
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  }, [events.data, carNumber]);

  const filtered = useMemo(() => {
    if (active === 'all') return carEvents;
    const types = CATEGORIES.find((c) => c.key === active)?.types ?? [];
    return carEvents.filter((e) => types.includes((e.type ?? '').toString()));
  }, [carEvents, active]);

  const counts = useMemo(() => {
    const out: Record<CategoryKey, number> = {
      all: carEvents.length,
      pay: 0,
      maint: 0,
      accident: 0,
      contact: 0,
      flow: 0,
      dispose: 0,
    };
    for (const e of carEvents) {
      const t = (e.type ?? '').toString();
      for (const c of CATEGORIES) {
        if (c.key === 'all') continue;
        if (c.types.includes(t)) out[c.key] += 1;
      }
    }
    return out;
  }, [carEvents]);

  // 자산 요약 — 미수 / 보유개월 / 사고건수 / 과태료
  const carBillings = useMemo<RtdbBilling[]>(() => {
    if (!carNumber) return [];
    return billings.data.filter((b) => b.car_number === carNumber);
  }, [billings.data, carNumber]);

  const summary = useMemo(() => {
    // 미수 = 결제일 지난 미납만 (결제대기 회차는 제외)
    const t = todayStr();
    let outstanding = 0;
    let pendingAmount = 0;
    for (const b of carBillings) {
      if (b.status === 'deleted') continue;
      const due = computeTotalDue(b);
      const paid = Number(b.paid_total ?? 0);
      if (paid >= due) continue;
      if (!b.due_date) continue;
      if (b.due_date < t) outstanding += due - paid;
      else pendingAmount += due - paid;
    }
    // 보유개월 — first_registration_date 또는 가장 빠른 계약 시작일 기준
    const firstReg =
      typeof asset?.first_registration_date === 'string'
        ? asset.first_registration_date
        : undefined;
    const candidateDates = [firstReg];
    for (const c of contracts.data) {
      if (c.car_number === carNumber && c.start_date) candidateDates.push(c.start_date);
    }
    const earliest = candidateDates
      .filter((d): d is string => !!d)
      .map((d) => d.slice(0, 10))
      .sort()[0];
    let holdMonths = 0;
    if (earliest) {
      const d = new Date(earliest);
      const now = new Date();
      holdMonths = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
      if (holdMonths < 0) holdMonths = 0;
    }
    const accidentCount = carEvents.filter((e) => e.type === 'accident').length;
    const penaltyCount = carEvents.filter((e) => e.type === 'penalty').length;
    return { outstanding, pendingAmount, holdMonths, accidentCount, penaltyCount };
  }, [carBillings, carEvents, contracts.data, carNumber, asset?.first_registration_date]);

  if (!asset) return null;

  const status = asset.asset_status ?? asset.status ?? '—';
  const carName =
    [asset.manufacturer, asset.car_model, asset.detail_model].filter(Boolean).join(' ') || '—';

  return (
    <>
      <button type="button" className="detail-panel-backdrop" onClick={onClose} aria-label="닫기" />
      <aside
        className="detail-panel"
        // biome-ignore lint/a11y/useSemanticElements: <dialog>는 슬라이드 애니메이션과 layered z-index 호환성 문제로 <aside role="dialog"> 사용
        role="dialog"
        aria-label={`${asset.car_number ?? ''} 상세`}
      >
        <div className="detail-panel-head">
          <div className="ident">
            <div className="car">{asset.car_number ?? '—'}</div>
            <div className="sub">{carName}</div>
          </div>
          <span className="status-pill">{status}</span>
          <button type="button" className="close" onClick={onClose} aria-label="닫기">
            <i className="ph ph-x" />
          </button>
        </div>

        <div className="detail-panel-body">
          {/* 자산 요약 chips */}
          <div className="detail-summary-row">
            <SummaryChip
              icon="ph-receipt-x"
              label="미수"
              value={summary.outstanding > 0 ? `${fmt(summary.outstanding)}원` : '0원'}
              danger={summary.outstanding > 0}
            />
            <SummaryChip
              icon="ph-clock"
              label="보유"
              value={summary.holdMonths > 0 ? `${summary.holdMonths}개월` : '—'}
            />
            <SummaryChip
              icon="ph-car-profile"
              label="사고"
              value={`${summary.accidentCount}건`}
              danger={summary.accidentCount > 0}
            />
            <SummaryChip icon="ph-prohibit" label="과태료" value={`${summary.penaltyCount}건`} />
          </div>

          {/* 기본정보 요약 */}
          <section className="detail-info">
            <div className="detail-info-head">차량 기본정보</div>
            <dl className="detail-info-grid">
              <div>
                <dt>회원사</dt>
                <dd>{asset.partner_code ?? '—'}</dd>
              </div>
              <div>
                <dt>VIN</dt>
                <dd className="num">{asset.vin ?? '—'}</dd>
              </div>
              <div>
                <dt>연식</dt>
                <dd>{asset.car_year ?? '—'}</dd>
              </div>
              <div>
                <dt>연료</dt>
                <dd>{asset.fuel_type ?? '—'}</dd>
              </div>
              <div>
                <dt>외장색</dt>
                <dd>{asset.ext_color ?? '—'}</dd>
              </div>
              <div>
                <dt>주행거리</dt>
                <dd className="num">
                  {asset.current_mileage ? `${fmt(Number(asset.current_mileage))} km` : '—'}
                </dd>
              </div>
              <div>
                <dt>매입형태</dt>
                <dd>{asset.buy_type ?? '—'}</dd>
              </div>
              <div>
                <dt>취득원가</dt>
                <dd className="num">
                  {asset.acquisition_cost ? `${fmt(Number(asset.acquisition_cost))}원` : '—'}
                </dd>
              </div>
            </dl>
          </section>

          {/* 카테고리 필터 칩 */}
          <div className="timeline-filter">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                className={`chip ${active === c.key ? 'is-active' : ''}`}
                onClick={() => setActive(c.key)}
              >
                {c.label}
                {counts[c.key] > 0 && <span className="cnt">{counts[c.key]}</span>}
              </button>
            ))}
          </div>

          {/* 타임라인 */}
          <section className="timeline">
            <div className="timeline-head">
              운영 타임라인
              <span className="muted">· {filtered.length}건</span>
            </div>
            {events.loading ? (
              <div className="timeline-empty">
                <i className="ph ph-spinner spin" /> 로드 중...
              </div>
            ) : filtered.length === 0 ? (
              <div className="timeline-empty">
                {carEvents.length === 0
                  ? '이 차량의 이벤트가 없습니다'
                  : '해당 카테고리 이벤트 없음'}
              </div>
            ) : (
              <div className="timeline-list">
                {filtered.map((e, i) => {
                  const meta = metaFor(e.type);
                  return (
                    <button
                      key={e._key ?? i}
                      type="button"
                      className="timeline-row is-clickable"
                      onClick={() => setEventDetail(e)}
                    >
                      <div className="t-date num">{fmtDate(e.date) || '—'}</div>
                      <i className={`ph ${meta.icon} t-icon`} style={{ color: meta.color }} />
                      <div className="t-tag" style={{ color: meta.color }}>
                        {meta.label}
                      </div>
                      <div className="t-body">
                        <div className="t-title">
                          {e.title || meta.label}
                          {Number(e.amount) > 0 && (
                            <span className="t-amount num">{fmt(Number(e.amount))}원</span>
                          )}
                        </div>
                        {e.memo && <div className="t-memo">{e.memo}</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </aside>
      <EventDetailModal event={eventDetail} onClose={() => setEventDetail(null)} />
    </>
  );
}

function SummaryChip({
  icon,
  label,
  value,
  danger,
}: {
  icon: string;
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className={`detail-summary-chip${danger ? ' is-danger' : ''}`}>
      <i className={`ph ${icon}`} />
      <span className="lbl">{label}</span>
      <span className="val num">{value}</span>
    </div>
  );
}

function EventDetailModal({ event, onClose }: { event: RtdbEvent | null; onClose: () => void }) {
  useEffect(() => {
    if (!event) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [event, onClose]);

  if (!event) return null;
  const meta = metaFor(event.type);
  // 우선 표시할 키 — 빈 값/내부 키는 제외
  const skipKeys = new Set([
    '_key',
    'created_at',
    'updated_at',
    'status',
    'dedup_key',
    'raw_key',
    'event_code',
  ]);
  const entries = Object.entries(event)
    .filter(([k, v]) => !skipKeys.has(k) && v !== null && v !== undefined && v !== '')
    .filter(([, v]) => typeof v !== 'object' || Array.isArray(v));

  return (
    <>
      <button type="button" className="event-modal-backdrop" onClick={onClose} aria-label="닫기" />
      <div
        className="event-modal"
        // biome-ignore lint/a11y/useSemanticElements: layered modal에서 dialog element는 z-index 충돌
        role="dialog"
        aria-label="이벤트 상세"
      >
        <div className="event-modal-head">
          <i className={`ph ${meta.icon}`} style={{ color: meta.color }} />
          <span className="lbl">{meta.label}</span>
          <span className="when">{fmtDate(event.date) || '—'}</span>
          <button type="button" className="close" onClick={onClose} aria-label="닫기">
            <i className="ph ph-x" />
          </button>
        </div>
        <div className="event-modal-body">
          {event.title && <div className="event-modal-title">{event.title}</div>}
          {Number(event.amount) > 0 && (
            <div className="event-modal-amount num">{fmt(Number(event.amount))}원</div>
          )}
          {event.memo && <div className="event-modal-memo">{event.memo}</div>}
          <dl className="event-modal-grid">
            {entries.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{Array.isArray(v) ? v.join(', ') : String(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </>
  );
}
