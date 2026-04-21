'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import { useRecentCars } from '@/lib/hooks/useRecentCars';
import { CarNumberPicker } from '@/components/form/car-number-picker';
import { computeContractEnd, daysBetween, today, computeTotalDue } from '@/lib/date-utils';
import { metaFor } from '@/lib/event-meta';
import { fmt, fmtDate } from '@/lib/utils';
import type { RtdbAsset, RtdbBilling, RtdbContract, RtdbEvent } from '@/lib/types/rtdb-entities';

function MobileScanInner() {
  const sp = useSearchParams();
  const initialQ = sp.get('q') ?? '';
  const [q, setQ] = useState(initialQ);
  const recent = useRecentCars();

  const assets = useRtdbCollection<RtdbAsset>('assets');
  const contracts = useRtdbCollection<RtdbContract>('contracts');
  const billings = useRtdbCollection<RtdbBilling>('billings');
  const events = useRtdbCollection<RtdbEvent>('events');

  useEffect(() => {
    if (initialQ) recent.push(initialQ);
  }, [initialQ, recent]);

  const matched = useMemo(() => {
    const cn = q.trim();
    if (!cn) return null;
    const asset = assets.data.find((a) => a.car_number === cn);
    if (!asset) return null;
    const contract = contracts.data.find(
      (c) => c.car_number === cn && c.status !== 'deleted' && c.contractor_name?.trim(),
    );
    const end = contract ? computeContractEnd(contract) : '';
    const dDay = end ? daysBetween(today(), end) : null;

    let unpaidAmt = 0;
    let unpaidCount = 0;
    if (contract?.contract_code) {
      const t = today();
      for (const b of billings.data) {
        if (b.contract_code !== contract.contract_code) continue;
        const due = computeTotalDue(b);
        const paid = Number(b.paid_total) || 0;
        if (paid < due && b.due_date && b.due_date < t) {
          unpaidAmt += due - paid;
          unpaidCount++;
        }
      }
    }

    const evs = events.data
      .filter((e) => e.car_number === cn && e.status !== 'deleted')
      .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))
      .slice(0, 10);

    return { asset, contract, dDay, end, unpaidAmt, unpaidCount, evs };
  }, [q, assets.data, contracts.data, billings.data, events.data]);

  return (
    <div>
      <div className="m-title">차량 조회</div>
      <div className="m-subtitle">차량번호 입력 → 계약·이력 확인</div>

      <CarNumberPicker
        value={q}
        onChange={(v) => setQ(v)}
        placeholder="예: 98고1234"
        autoFocus
      />

      {/* 검색 결과 */}
      {matched && (
        <div style={{ marginTop: 16 }}>
          <div className="m-card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
              <span className="text-[18px]" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
                {matched.asset.car_number}
              </span>
              {matched.asset.partner_code && (
                <span className="text-text-sub text-base">{matched.asset.partner_code}</span>
              )}
            </div>
            <div className="text-base text-text-sub">
              {[matched.asset.manufacturer, matched.asset.detail_model ?? matched.asset.car_model, matched.asset.car_year]
                .filter(Boolean).join(' ')}
            </div>
          </div>

          {matched.contract ? (
            <div className="m-card" style={{ marginBottom: 12 }}>
              <div className="text-xl" style={{ fontWeight: 600 }}>{matched.contract.contractor_name}</div>
              <div className="text-base text-text-sub" style={{ marginTop: 2 }}>
                {matched.contract.contractor_phone && (
                  <a href={`tel:${matched.contract.contractor_phone}`} className="text-primary" style={{ textDecoration: 'none' }}>
                    📞 {matched.contract.contractor_phone}
                  </a>
                )}
              </div>
              <div className="text-xs text-text-muted" style={{ marginTop: 6 }}>
                {fmtDate(matched.contract.start_date)} ~ {fmtDate(matched.end)}
                {matched.contract.rent_months && ` · ${matched.contract.rent_months}개월`}
                {matched.dDay !== null && matched.dDay <= 30 && (
                  <span style={{ marginLeft: 6, color: matched.dDay < 0 ? 'var(--c-danger)' : 'var(--c-warn)', fontWeight: 600 }}>
                    {matched.dDay < 0 ? `만기 ${-matched.dDay}일 경과` : `D-${matched.dDay}`}
                  </span>
                )}
              </div>
              {matched.unpaidCount > 0 && (
                <div className="text-base text-danger" style={{ marginTop: 8, fontWeight: 600 }}>
                  미납 {fmt(matched.unpaidAmt)}원 ({matched.unpaidCount}회)
                </div>
              )}
            </div>
          ) : (
            <div className="m-card text-warn" style={{ marginBottom: 12 }}>
              활성 계약 없음 (휴차)
            </div>
          )}

          <div className="m-section-title">최근 이력 {matched.evs.length}건</div>
          {matched.evs.length === 0 ? (
            <div className="m-card text-text-muted text-xs">이력 없음</div>
          ) : (
            matched.evs.map((e) => {
              const meta = metaFor(e.type ?? '');
              return (
                <div key={e._key} className="m-list-item" style={{ cursor: 'default' }}>
                  <i className={`ph ${meta.icon}`} style={{ color: meta.color }} />
                  <div className="m-list-item-body">
                    <div className="m-list-item-label text-base">
                      {e.title ?? meta.label}
                    </div>
                    <div className="m-list-item-sub">
                      {fmtDate(e.date)} · {meta.label}
                      {e.amount ? ` · ${fmt(Number(e.amount))}원` : ''}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 최근 차량 (picker 드롭다운이 자동완성 담당) */}
      {!matched && recent.list.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="m-section-title">최근 차량</div>
          {recent.list.map((c) => (
            <button
              key={c}
              type="button"
              className="m-list-item"
              onClick={() => setQ(c)}
              style={{ width: '100%', border: '1px solid var(--c-border)', textAlign: 'left' }}
            >
              <i className="ph ph-car" />
              <div className="m-list-item-body">
                <div className="m-list-item-label">{c}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


export default function MobileScan() {
  return <Suspense><MobileScanInner /></Suspense>;
}
