'use client';

import { useAssetByCarNumber, updateAssetField } from '@/lib/collections/rtdb/assets';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import { EditableField } from '@/components/shared/editable-field';
import { KpiCard } from '@/components/shared/kpi-card';
import { LifecycleStepper } from '@/components/entity/lifecycle-stepper';
import { PageHeader } from '@/components/shared/page-header';
import { computeTotalDue, today as todayStr } from '@/lib/date-utils';
import { fmt, fmtDate } from '@/lib/utils';
import { useMemo } from 'react';

// 17종 이벤트 타입별 Phosphor 아이콘 (기존 jpkerp home.js EVENT_META 계승)
const EVENT_META: Record<string, { icon: string; color: string; label: string }> = {
  contact: { icon: 'ph-phone', color: '#3b82f6', label: '응대' },
  delivery: { icon: 'ph-truck', color: '#10b981', label: '출고' },
  return: { icon: 'ph-arrow-u-down-left', color: '#059669', label: '반납' },
  force: { icon: 'ph-warning-octagon', color: '#dc2626', label: '강제회수' },
  transfer: { icon: 'ph-arrows-left-right', color: '#14b8a6', label: '이동' },
  key: { icon: 'ph-key', color: '#f59e0b', label: '키' },
  maint: { icon: 'ph-wrench', color: '#f97316', label: '정비' },
  maintenance: { icon: 'ph-wrench', color: '#f97316', label: '정비' },
  accident: { icon: 'ph-car-profile', color: '#ef4444', label: '사고' },
  repair: { icon: 'ph-hammer', color: '#ea580c', label: '수리' },
  penalty: { icon: 'ph-prohibit', color: '#b91c1c', label: '과태료' },
  product: { icon: 'ph-sparkle', color: '#8b5cf6', label: '상품화' },
  insurance: { icon: 'ph-shield-check', color: '#7c3aed', label: '보험' },
  collect: { icon: 'ph-envelope', color: '#2563eb', label: '미수조치' },
  wash: { icon: 'ph-drop', color: '#a855f7', label: '세차' },
  fuel: { icon: 'ph-gas-pump', color: '#c026d3', label: '주유' },
  bank_tx: { icon: 'ph-bank', color: '#059669', label: '통장' },
  card_tx: { icon: 'ph-credit-card', color: '#2563eb', label: '카드' },
};

type Contract = {
  _key?: string;
  contract_code?: string;
  contractor_name?: string;
  contractor_phone?: string;
  car_number?: string;
  start_date?: string;
  end_date?: string;
  rent_months?: number;
  rent_amount?: number;
  contract_status?: string;
  status?: string;
  [k: string]: unknown;
};

type Billing = {
  _key?: string;
  contract_code?: string;
  bill_count?: number;
  due_date?: string;
  amount?: number;
  paid_total?: number;
  status?: string;
  [k: string]: unknown;
};

type Event = {
  _key?: string;
  type?: string;
  date?: string;
  title?: string;
  amount?: number;
  car_number?: string;
  contract_code?: string;
  memo?: string;
  vendor?: string;
  [k: string]: unknown;
};

export function AssetProfileClient({ carNumber }: { carNumber: string }) {
  const { asset, loading, error } = useAssetByCarNumber(carNumber);
  const contracts = useRtdbCollection<Contract>('contracts');
  const events = useRtdbCollection<Event>('events');
  const billings = useRtdbCollection<Billing>('billings');

  const carContracts = useMemo(
    () =>
      contracts.data
        .filter((c) => c.car_number === carNumber && c.status !== 'deleted')
        .sort((a, b) => (b.start_date ?? '').localeCompare(a.start_date ?? '')),
    [contracts.data, carNumber],
  );

  const currentContract = carContracts[0];

  const carEvents = useMemo(
    () =>
      events.data
        .filter((e) => e.car_number === carNumber)
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')),
    [events.data, carNumber],
  );

  const carBillings = useMemo(() => {
    if (!currentContract?.contract_code) return [] as Billing[];
    return billings.data.filter((b) => b.contract_code === currentContract.contract_code);
  }, [billings.data, currentContract?.contract_code]);

  const stats = useMemo(() => {
    const revenue = carBillings.reduce((s, b) => s + (Number(b.paid_total) || 0), 0);
    const cost = carEvents.reduce((s, e) => {
      if (['maint', 'maintenance', 'repair', 'accident', 'wash', 'fuel', 'penalty'].includes(e.type ?? ''))
        return s + (Number(e.amount) || 0);
      return s;
    }, 0);
    // 미수 = 결제일 지난 미납만 / 결제대기는 별도 카운트
    const t = todayStr();
    let overdueCount = 0;
    let pendingCount = 0;
    for (const b of carBillings) {
      if (b.status === 'deleted') continue;
      const due = computeTotalDue(b);
      const paid = Number(b.paid_total ?? 0);
      if (paid >= due) continue;
      if (!b.due_date) continue;
      if (b.due_date < t) overdueCount += 1;
      else pendingCount += 1;
    }
    return { revenue, cost, profit: revenue - cost, overdueCount, pendingCount };
  }, [carBillings, carEvents]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center gap-2 text-text-muted">
        <i className="ph ph-spinner spin" />
        <span>차량 정보 불러오는 중...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="panel p-4">
          <div className="font-bold text-danger">데이터 로드 실패</div>
          <div className="text-text-sub">{error.message}</div>
        </div>
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-text-muted">
        <div>차량 {carNumber}을 찾을 수 없습니다</div>
        <div className="text-xs">기존 jpkerp RTDB에 존재하는 차량번호를 확인하세요</div>
      </div>
    );
  }

  const save = (field: string) => async (v: string) => {
    await updateAssetField(asset._key, field, v);
  };

  const saveNumber = (field: string) => async (v: string) => {
    const n = Number(String(v).replace(/,/g, ''));
    await updateAssetField(asset._key, field, Number.isFinite(n) ? n : 0);
  };

  const lifecycle: Parameters<typeof LifecycleStepper>[0]['current'] =
    currentContract?.contract_status === '계약진행'
      ? 'operating'
      : carEvents.some((e) => e.type === 'delivery')
        ? 'delivered'
        : currentContract
          ? 'contracted'
          : 'acquired';

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <PageHeader
        title={`🚗 ${asset.car_number}`}
        subtitle={`${asset.manufacturer ?? ''} ${asset.car_model ?? ''} · ${currentContract?.contractor_name ?? '계약 없음'}`}
      />

      <div className="border-b border-border bg-surface">
        <LifecycleStepper current={lifecycle} />
      </div>

      <div className="p-6 space-y-5">
        {/* 손익 */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="누적 매출" value={`${fmt(stats.revenue)}원`} tone="success" />
          <KpiCard label="누적 지출" value={`${fmt(stats.cost)}원`} />
          <KpiCard
            label="손익"
            value={`${stats.profit >= 0 ? '+' : ''}${fmt(stats.profit)}원`}
            tone={stats.profit >= 0 ? 'primary' : 'danger'}
          />
          <KpiCard
            label="미수"
            value={`${stats.overdueCount}건`}
            tone={stats.overdueCount > 0 ? 'warn' : undefined}
          />
        </section>

        {/* 기본 정보 — 인라인 편집 */}
        <section className="panel">
          <div className="h-9 border-b border-border flex items-center px-4 text-xs font-bold text-text-sub">
            기본 정보
            <span className="ml-2 font-normal text-text-muted">
              · 필드 클릭 → 자동 저장
            </span>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <EditableField label="차량번호" value={asset.car_number ?? ''} onSave={save('car_number')} readOnly />
            <EditableField label="제조사" value={asset.manufacturer ?? ''} onSave={save('manufacturer')} />
            <EditableField label="모델" value={asset.car_model ?? ''} onSave={save('car_model')} />
            <EditableField label="세부모델" value={asset.detail_model ?? ''} onSave={save('detail_model')} />
            <EditableField label="연식" value={String(asset.car_year ?? '')} type="number" numeric onSave={saveNumber('car_year')} />
            <EditableField label="연료" value={asset.fuel_type ?? ''} onSave={save('fuel_type')} />
            <EditableField label="외장색" value={asset.ext_color ?? ''} onSave={save('ext_color')} />
            <EditableField label="주행거리" value={String(asset.current_mileage ?? '')} type="number" numeric onSave={saveNumber('current_mileage')} />
            <EditableField label="회원사" value={asset.partner_code ?? ''} onSave={save('partner_code')} />
            <EditableField label="최종정비일" value={asset.last_maint_date ?? ''} type="date" onSave={save('last_maint_date')} />
            <EditableField label="최초등록일" value={asset.first_registration_date ?? ''} type="date" onSave={save('first_registration_date')} />
            <EditableField label="취득원가" value={String(asset.acquisition_cost ?? '')} type="number" numeric onSave={saveNumber('acquisition_cost')} />
          </div>
        </section>

        {/* 타임라인 */}
        <section>
          <div className="font-bold mb-3 flex items-center gap-2">
            운영 타임라인
            <span className="text-xs text-text-muted font-normal">· 최근 20건</span>
          </div>
          {carEvents.length === 0 ? (
            <div className="panel p-8 text-center text-text-muted">
              이 차량의 운영이력이 없습니다
            </div>
          ) : (
            <div className="panel">
              {carEvents.slice(0, 20).map((e, i) => {
                const meta = EVENT_META[e.type ?? ''] ?? {
                  icon: 'ph-file-text',
                  color: '#a8a29e',
                  label: e.type ?? '-',
                };
                return (
                  <div
                    key={e._key}
                    className={`flex items-start gap-3 px-4 py-2 ${i > 0 ? 'border-t border-border' : ''}`}
                  >
                    <div className="text-xs text-text-muted w-14 pt-0.5 num">
                      {fmtDate(e.date)}
                    </div>
                    <i
                      className={`ph ${meta.icon} mt-0.5 flex-shrink-0 text-[14px]`} style={{ color: meta.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="truncate">
                        {e.title || meta.label}
                        {e.amount ? (
                          <span className="text-text-muted ml-2 text-xs num">
                            {fmt(e.amount)}원
                          </span>
                        ) : null}
                      </div>
                      {e.memo && (
                        <div className="text-xs text-text-muted truncate">{e.memo}</div>
                      )}
                    </div>
                    <span
                      className="badge"
                      style={{ color: meta.color, backgroundColor: `${meta.color}15` }}
                    >
                      {meta.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
