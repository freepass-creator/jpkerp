'use client';

/**
 * 자산 상세 슬라이드 패널 (Phase 9 — 타임라인)
 * - 우측 슬라이드 (520px) + 백드롭
 * - 차량 기본정보 + events 시간순 타임라인
 * - 카테고리 필터 칩 (수납·정비·사고·응대·출고/반납·매각)
 */

import { useEffect, useMemo, useState } from 'react';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import type { RtdbEvent } from '@/lib/types/rtdb-entities';
import { metaFor } from '@/lib/event-meta';
import { fmt, fmtDate } from '@/lib/utils';

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
  const [active, setActive] = useState<CategoryKey>('all');

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
      pay: 0, maint: 0, accident: 0, contact: 0, flow: 0, dispose: 0,
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

  if (!asset) return null;

  const status = asset.asset_status ?? asset.status ?? '—';
  const carName = [asset.manufacturer, asset.car_model, asset.detail_model].filter(Boolean).join(' ') || '—';

  return (
    <>
      <div className="detail-panel-backdrop" onClick={onClose} />
      <aside className="detail-panel" role="dialog" aria-label={`${asset.car_number ?? ''} 상세`}>
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
          {/* 기본정보 요약 */}
          <section className="detail-info">
            <div className="detail-info-head">차량 기본정보</div>
            <dl className="detail-info-grid">
              <div><dt>회원사</dt><dd>{asset.partner_code ?? '—'}</dd></div>
              <div><dt>VIN</dt><dd className="num">{asset.vin ?? '—'}</dd></div>
              <div><dt>연식</dt><dd>{asset.car_year ?? '—'}</dd></div>
              <div><dt>연료</dt><dd>{asset.fuel_type ?? '—'}</dd></div>
              <div><dt>외장색</dt><dd>{asset.ext_color ?? '—'}</dd></div>
              <div><dt>주행거리</dt><dd className="num">{asset.current_mileage ? `${fmt(Number(asset.current_mileage))} km` : '—'}</dd></div>
              <div><dt>매입형태</dt><dd>{asset.buy_type ?? '—'}</dd></div>
              <div><dt>취득원가</dt><dd className="num">{asset.acquisition_cost ? `${fmt(Number(asset.acquisition_cost))}원` : '—'}</dd></div>
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
                {carEvents.length === 0 ? '이 차량의 이벤트가 없습니다' : '해당 카테고리 이벤트 없음'}
              </div>
            ) : (
              <div className="timeline-list">
                {filtered.map((e, i) => {
                  const meta = metaFor(e.type);
                  return (
                    <div key={e._key ?? i} className="timeline-row">
                      <div className="t-date num">{fmtDate(e.date) || '—'}</div>
                      <i className={`ph ${meta.icon} t-icon`} style={{ color: meta.color }} />
                      <div className="t-tag" style={{ color: meta.color }}>{meta.label}</div>
                      <div className="t-body">
                        <div className="t-title">
                          {e.title || meta.label}
                          {Number(e.amount) > 0 && (
                            <span className="t-amount num">{fmt(Number(e.amount))}원</span>
                          )}
                        </div>
                        {e.memo && <div className="t-memo">{e.memo}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </aside>
    </>
  );
}
