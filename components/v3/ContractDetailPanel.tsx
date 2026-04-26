'use client';

/**
 * 계약 상세 슬라이드 패널 (Phase 9)
 * - 우측 슬라이드 (520px) + 백드롭
 * - 계약 기본정보 + 그 계약의 events 시간순 타임라인
 * - 카테고리 필터 칩 (자산 타임라인과 동일)
 */

import { useRtdbCollection } from '@/lib/collections/rtdb';
import { computeContractEnd, computeTotalDue, today as todayStr } from '@/lib/date-utils';
import { metaFor } from '@/lib/event-meta';
import type { RtdbBilling, RtdbContract, RtdbEvent } from '@/lib/types/rtdb-entities';
import { fmt, fmtDate } from '@/lib/utils';
import { useEffect, useMemo, useState } from 'react';

interface Props {
  contract: RtdbContract | null;
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

export function ContractDetailPanel({ contract, onClose }: Props) {
  const events = useRtdbCollection<RtdbEvent>('events');
  const billings = useRtdbCollection<RtdbBilling>('billings');
  const [active, setActive] = useState<CategoryKey>('all');
  const [eventDetail, setEventDetail] = useState<RtdbEvent | null>(null);

  useEffect(() => {
    if (!contract) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [contract, onClose]);

  const code = contract?.contract_code;

  const cEvents = useMemo(() => {
    if (!code) return [] as RtdbEvent[];
    return events.data
      .filter((e) => e.contract_code === code)
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  }, [events.data, code]);

  const cBillings = useMemo(() => {
    if (!code) return [] as RtdbBilling[];
    return billings.data.filter((b) => b.contract_code === code);
  }, [billings.data, code]);

  const filtered = useMemo(() => {
    if (active === 'all') return cEvents;
    const types = CATEGORIES.find((c) => c.key === active)?.types ?? [];
    return cEvents.filter((e) => types.includes((e.type ?? '').toString()));
  }, [cEvents, active]);

  const counts = useMemo(() => {
    const out: Record<CategoryKey, number> = {
      all: cEvents.length,
      pay: 0,
      maint: 0,
      accident: 0,
      contact: 0,
      flow: 0,
      dispose: 0,
    };
    for (const e of cEvents) {
      const t = (e.type ?? '').toString();
      for (const c of CATEGORIES) {
        if (c.key === 'all') continue;
        if (c.types.includes(t)) out[c.key] += 1;
      }
    }
    return out;
  }, [cEvents]);

  const billingSummary = useMemo(() => {
    // 미수 = 결제일 지난 미납 / 결제대기 = 결제일 미도래 미납
    const t = todayStr();
    let total = 0;
    let paid = 0;
    let outstanding = 0;
    let overdueCount = 0;
    let pendingAmount = 0;
    let pendingCount = 0;
    for (const b of cBillings) {
      if (b.status === 'deleted') continue;
      const due = computeTotalDue(b);
      const p = Number(b.paid_total ?? 0);
      total += due;
      paid += p;
      if (p >= due) continue;
      if (!b.due_date) continue;
      if (b.due_date < t) {
        outstanding += due - p;
        overdueCount += 1;
      } else {
        pendingAmount += due - p;
        pendingCount += 1;
      }
    }
    return {
      total,
      paid,
      outstanding,
      overdueCount,
      pendingAmount,
      pendingCount,
      count: cBillings.filter((b) => b.status !== 'deleted').length,
    };
  }, [cBillings]);

  if (!contract) return null;

  const endDate = computeContractEnd(contract);
  const status = contract.contract_status ?? '—';

  return (
    <>
      <button type="button" className="detail-panel-backdrop" onClick={onClose} aria-label="닫기" />
      <aside
        className="detail-panel"
        // biome-ignore lint/a11y/useSemanticElements: <dialog>는 슬라이드 애니메이션과 layered z-index 호환성 문제로 <aside role="dialog"> 사용
        role="dialog"
        aria-label={`계약 ${contract.contract_code ?? ''} 상세`}
      >
        <div className="detail-panel-head">
          <div className="ident">
            <div className="car">{contract.car_number ?? '—'}</div>
            <div className="sub">
              {contract.contract_code ?? '—'} · {contract.contractor_name ?? '—'}
            </div>
          </div>
          <span className="status-pill">{status}</span>
          <button type="button" className="close" onClick={onClose} aria-label="닫기">
            <i className="ph ph-x" />
          </button>
        </div>

        <div className="detail-panel-body">
          <section className="detail-info">
            <div className="detail-info-head">계약 기본정보</div>
            <dl className="detail-info-grid">
              <div>
                <dt>회원사</dt>
                <dd>{contract.partner_code ?? '—'}</dd>
              </div>
              <div>
                <dt>계약자</dt>
                <dd>{contract.contractor_name ?? '—'}</dd>
              </div>
              <div>
                <dt>연락처</dt>
                <dd className="num">{contract.contractor_phone ?? '—'}</dd>
              </div>
              <div>
                <dt>상품</dt>
                <dd>{contract.product_type ?? '—'}</dd>
              </div>
              <div>
                <dt>시작일</dt>
                <dd className="num">{fmtDate(contract.start_date) || '—'}</dd>
              </div>
              <div>
                <dt>종료일</dt>
                <dd className="num">{fmtDate(endDate) || '—'}</dd>
              </div>
              <div>
                <dt>기간</dt>
                <dd>{contract.rent_months ? `${contract.rent_months}개월` : '—'}</dd>
              </div>
              <div>
                <dt>월 대여료</dt>
                <dd className="num">
                  {contract.rent_amount ? `${fmt(Number(contract.rent_amount))}원` : '—'}
                </dd>
              </div>
              <div>
                <dt>보증금</dt>
                <dd className="num">
                  {contract.deposit_amount ? `${fmt(Number(contract.deposit_amount))}원` : '—'}
                </dd>
              </div>
              <div>
                <dt>결제일</dt>
                <dd>{contract.auto_debit_day ?? '—'}</dd>
              </div>
            </dl>
          </section>

          {/* 청구 요약 */}
          <section className="detail-info">
            <div className="detail-info-head">청구 · 수납</div>
            <dl className="detail-info-grid">
              <div>
                <dt>회차</dt>
                <dd className="num">{billingSummary.count}건</dd>
              </div>
              <div>
                <dt>청구합계</dt>
                <dd className="num">{fmt(billingSummary.total)}원</dd>
              </div>
              <div>
                <dt>수납합계</dt>
                <dd className="num">{fmt(billingSummary.paid)}원</dd>
              </div>
              <div>
                <dt>미수</dt>
                <dd className={`num${billingSummary.outstanding > 0 ? ' is-danger' : ''}`}>
                  {fmt(billingSummary.outstanding)}원 ({billingSummary.overdueCount}건)
                </dd>
              </div>
              <div>
                <dt>결제대기</dt>
                <dd className="num">
                  {fmt(billingSummary.pendingAmount)}원 ({billingSummary.pendingCount}건)
                </dd>
              </div>
            </dl>
          </section>

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

          <section className="timeline">
            <div className="timeline-head">
              계약 타임라인
              <span className="muted">· {filtered.length}건</span>
            </div>
            {events.loading ? (
              <div className="timeline-empty">
                <i className="ph ph-spinner spin" /> 로드 중...
              </div>
            ) : filtered.length === 0 ? (
              <div className="timeline-empty">
                {cEvents.length === 0 ? '이 계약의 이벤트가 없습니다' : '해당 카테고리 이벤트 없음'}
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
