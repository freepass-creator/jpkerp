'use client';

import { useEffect, useMemo, useRef, type Ref, type RefObject } from 'react';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import { JpkGrid, type JpkGridApi } from '@/components/shared/jpk-grid';
import { JpkSetFilter } from '@/lib/grid/set-filter';
import { normalizeDate, computeContractEnd, today, daysBetween, computeTotalDue } from '@/lib/date-utils';
import type { RtdbAsset, RtdbBilling, RtdbContract, RtdbEvent } from '@/lib/types/rtdb-entities';
import { fmt } from '@/lib/utils';
import type { ColDef } from 'ag-grid-community';

type Loan = { _key?: string; car_number?: string; vin?: string; loan_company?: string; loan_principal?: number; loan_balance?: number; loan_end_date?: string; status?: string; [k: string]: unknown };
type Insurance = { _key?: string; car_number?: string; insurance_company?: string; end_date?: string; start_date?: string; age_limit?: string; driver_range?: string; premium?: number; status?: string; [k: string]: unknown };

export interface OpRow {
  partner_code: string;
  car_number: string;
  model: string;
  contract_status_disp: string;

  // 손익 요약
  total_revenue: number;
  maint_cost: number;
  accident_cost: number;
  total_cost: number;
  profit: number;

  // 할부
  loan_principal: number;
  loan_paid: number;
  loan_balance: number;
  loan_company: string;
  loan_days_to_end: number | null;

  // 미납
  unpaid_count: number;
  unpaid_amount: number;
  max_overdue_days: number;

  // 계약
  contractor_name: string;
  contractor_phone: string;
  rent_amount: number;
  auto_debit_day: string | number;
  contract_end: string;
  days_to_end: number | null;
  action_status: string;

  // 보험
  insurance_company: string;
  insurance_days_to_end: number | null;
  age_limit: string;
  insurance_premium: number;

  // 운영 부가
  current_mileage: number;
  fuel_cost: number;
  wash_cost: number;
  penalty_cost: number;
  delivery_cost: number;
  last_maint_date: string;
}

interface OperationReportClientProps {
  gridRef?: RefObject<JpkGridApi<OpRow> | null>;
  onCountChange?: (count: number) => void;
}

export function OperationReportClient({ gridRef: externalRef, onCountChange }: OperationReportClientProps = {}) {
  const internalRef = useRef<JpkGridApi<OpRow> | null>(null);
  const gridRef = externalRef ?? internalRef;
  const assets = useRtdbCollection<RtdbAsset>('assets');
  const contracts = useRtdbCollection<RtdbContract>('contracts');
  const billings = useRtdbCollection<RtdbBilling>('billings');
  const events = useRtdbCollection<RtdbEvent>('events');
  const loans = useRtdbCollection<Loan>('loans');
  const insurances = useRtdbCollection<Insurance>('insurances');

  const rows = useMemo<OpRow[]>(() => {
    const t = today();
    const activeContractByCar = new Map<string, RtdbContract>();
    for (const c of contracts.data) {
      if (c.status === 'deleted') continue;
      if (!c.contractor_name?.trim()) continue;
      if (!c.car_number) continue;
      const s = normalizeDate(c.start_date);
      if (!s || s > t) continue;
      const e = computeContractEnd(c);
      if (e && e < t) continue;
      const prev = activeContractByCar.get(c.car_number);
      if (!prev || String(c.start_date ?? '').localeCompare(String(prev.start_date ?? '')) > 0) {
        activeContractByCar.set(c.car_number, c);
      }
    }

    const contractCodesByCar = new Map<string, Set<string>>();
    for (const c of contracts.data) {
      if (!c.car_number) continue;
      const set = contractCodesByCar.get(c.car_number) ?? new Set();
      if (c.contract_code) set.add(c.contract_code);
      contractCodesByCar.set(c.car_number, set);
    }

    const billingsByCar = new Map<string, RtdbBilling[]>();
    for (const b of billings.data) {
      const carCodes = Array.from(contractCodesByCar.entries())
        .find(([, codes]) => b.contract_code && codes.has(b.contract_code));
      const car = carCodes?.[0] ?? (b.car_number as string | undefined);
      if (!car) continue;
      (billingsByCar.get(car) ?? billingsByCar.set(car, []).get(car)!).push(b);
    }

    const eventsByCar = new Map<string, RtdbEvent[]>();
    for (const e of events.data) {
      if (!e.car_number) continue;
      (eventsByCar.get(e.car_number) ?? eventsByCar.set(e.car_number, []).get(e.car_number)!).push(e);
    }

    return assets.data
      .filter((a) => a.status !== 'deleted' && a.car_number)
      .map<OpRow>((a) => {
        const car = a.car_number!;
        const active = activeContractByCar.get(car);
        const carBills = billingsByCar.get(car) ?? [];
        const carEvents = eventsByCar.get(car) ?? [];

        let totalPaid = 0;
        let unpaid_count = 0;
        let unpaid_amount = 0;
        let max_overdue = 0;
        for (const b of carBills) {
          const due = computeTotalDue(b);
          const paid = Number(b.paid_total) || 0;
          totalPaid += paid;
          if (paid < due && b.due_date && b.due_date < t) {
            unpaid_count++;
            unpaid_amount += due - paid;
            const od = daysBetween(b.due_date, t);
            if (od > max_overdue) max_overdue = od;
          }
        }

        const sumByType = (type: string) =>
          carEvents
            .filter((e) => e.type === type)
            .reduce((s, e) => s + (Number(e.amount) || 0), 0);

        const maint_cost = sumByType('maint') + sumByType('maintenance');
        const accident_cost = sumByType('accident');
        const wash_cost = sumByType('wash');
        const fuel_cost = sumByType('fuel');
        const penalty_cost = sumByType('penalty');
        const delivery_cost = sumByType('delivery') + sumByType('transfer');

        const loan = loans.data.find((l) => l.car_number === car || l.vin === a.vin);
        const loan_principal = Number(loan?.loan_principal) || 0;
        const loan_balance = Number(loan?.loan_balance) || loan_principal;
        const loan_paid = loan_principal - loan_balance;

        const ins = insurances.data
          .filter((i) => i.car_number === car && i.status !== '해지')
          .sort((x, y) => String(y.start_date ?? '').localeCompare(String(x.start_date ?? '')))[0];
        const insurance_premium = Number(ins?.premium) || 0;

        const total_cost =
          maint_cost + accident_cost + wash_cost + fuel_cost + penalty_cost +
          delivery_cost + insurance_premium;
        const profit = totalPaid - total_cost;

        const end = active ? computeContractEnd(active) : '';
        const mileageFromEvents = carEvents.map((e) => Number(e.mileage) || 0).filter((n) => n > 0);

        return {
          partner_code: a.partner_code ?? '-',
          car_number: car,
          model: `${a.manufacturer ?? ''} ${a.car_model ?? ''} ${a.car_year ?? ''}`.trim() || '-',
          contract_status_disp: active
            ? '가동중'
            : 'asset_status' in a
              ? String((a as { asset_status?: string }).asset_status ?? '휴차')
              : '휴차',

          total_revenue: totalPaid,
          maint_cost,
          accident_cost,
          total_cost,
          profit,

          loan_principal,
          loan_paid,
          loan_balance,
          loan_company: loan?.loan_company ?? '-',
          loan_days_to_end: loan?.loan_end_date ? daysBetween(t, loan.loan_end_date) : null,

          unpaid_count,
          unpaid_amount,
          max_overdue_days: max_overdue,

          contractor_name: active?.contractor_name ?? '-',
          contractor_phone: active?.contractor_phone ?? '-',
          rent_amount: Number(active?.rent_amount) || 0,
          auto_debit_day: (active as { auto_debit_day?: string | number })?.auto_debit_day ?? '-',
          contract_end: end || '-',
          days_to_end: end ? daysBetween(t, end) : null,
          action_status: active?.action_status ?? '-',

          insurance_company: ins?.insurance_company ?? '-',
          insurance_days_to_end: ins?.end_date ? daysBetween(t, ins.end_date) : null,
          age_limit: ins?.age_limit ?? '-',
          insurance_premium,

          current_mileage: mileageFromEvents.length
            ? Math.max(...mileageFromEvents)
            : Number((a as { mileage?: number }).mileage) || Number(a.current_mileage) || 0,
          fuel_cost,
          wash_cost,
          penalty_cost,
          delivery_cost,
          last_maint_date:
            carEvents
              .filter((e) => (e.type === 'maint' || e.type === 'maintenance') && e.date)
              .sort((x, y) => String(y.date ?? '').localeCompare(String(x.date ?? '')))[0]?.date ??
            '-',
        };
      });
  }, [assets.data, contracts.data, billings.data, events.data, loans.data, insurances.data]);

  const money = (color?: string): Partial<ColDef<OpRow>> => ({
    filter: false,
    cellStyle: { textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: color ?? 'var(--c-text)' },
    valueFormatter: (p: { value: unknown }) => (p.value ? fmt(Number(p.value)) : '-'),
  });
  const days = (): Partial<ColDef<OpRow>> => ({
    filter: false,
    cellStyle: (p: { value: unknown }) => {
      const v = Number(p.value);
      const color = p.value === null ? 'var(--c-text-muted)'
        : v < 0 ? 'var(--c-danger)'
        : v <= 7 ? '#ea580c'
        : v <= 30 ? 'var(--c-warn)'
        : 'var(--c-success)';
      return { textAlign: 'right', fontWeight: '600', color };
    },
    valueFormatter: (p: { value: unknown }) => (p.value === null || p.value === undefined ? '-' : Number(p.value) > 0 ? `D-${p.value}` : Number(p.value) === 0 ? '오늘' : `D+${-Number(p.value)}`),
  });

  const columnDefs = useMemo<ColDef<OpRow>[]>(
    () =>
      [
        // 식별 (고정)
        { headerName: '회원사', field: 'partner_code', width: 80, pinned: 'left', filter: JpkSetFilter },
        { headerName: '차량번호', field: 'car_number', width: 100, pinned: 'left', cellStyle: { fontWeight: '600' } },
        { headerName: '차종', field: 'model', width: 180, pinned: 'left' },
        { headerName: '계약상태', field: 'contract_status_disp', width: 90, pinned: 'left', filter: JpkSetFilter, cellStyle: (p: { value: unknown }) => ({ fontWeight: '600', color: p.value === '가동중' ? 'var(--c-success)' : p.value === '휴차' ? 'var(--c-text-muted)' : 'var(--c-warn)' }) },

        // 손익
        { headerName: '총 매출액', field: 'total_revenue', width: 120, ...money('var(--c-success)') },
        { headerName: '총 정비비', field: 'maint_cost', width: 110, ...money() },
        { headerName: '총 수리비', field: 'accident_cost', width: 110, ...money() },
        { headerName: '총 운영비', field: 'total_cost', width: 120, ...money('var(--c-danger)') },
        {
          headerName: '총 순익',
          field: 'profit',
          width: 130,
          filter: false,
          cellStyle: (p: { value: unknown }) => ({
            textAlign: 'right',
            fontWeight: '700',
            fontVariantNumeric: 'tabular-nums',
            color: Number(p.value) > 0 ? 'var(--c-success)' : Number(p.value) < 0 ? 'var(--c-danger)' : 'var(--c-text-muted)',
          }),
          valueFormatter: (p: { value: unknown }) => fmt(Number(p.value)),
        },

        // 할부
        { headerName: '총 할부금', field: 'loan_principal', width: 120, ...money() },
        { headerName: '할부 납부', field: 'loan_paid', width: 110, ...money('var(--c-success)') },
        { headerName: '할부 잔액', field: 'loan_balance', width: 110, ...money('var(--c-warn)') },
        { headerName: '금융사', field: 'loan_company', width: 100, filter: JpkSetFilter },
        { headerName: '할부 만기', field: 'loan_days_to_end', width: 90, ...days() },

        // 미납
        { headerName: '미납 회차', field: 'unpaid_count', width: 80, filter: false, cellStyle: (p: { value: unknown }) => ({ textAlign: 'right', fontWeight: Number(p.value) ? '700' : '400', color: Number(p.value) ? 'var(--c-danger)' : 'var(--c-text-muted)' }), valueFormatter: (p: { value: unknown }) => (p.value ? `${p.value}회` : '-') },
        { headerName: '미납액', field: 'unpaid_amount', width: 110, ...money('var(--c-danger)') },
        { headerName: '미납 일수', field: 'max_overdue_days', width: 90, filter: false, cellStyle: (p: { value: unknown }) => ({ textAlign: 'right', fontWeight: Number(p.value) ? '700' : '400', color: Number(p.value) > 30 ? 'var(--c-danger)' : Number(p.value) > 7 ? '#ea580c' : Number(p.value) > 0 ? 'var(--c-warn)' : 'var(--c-text-muted)' }), valueFormatter: (p: { value: unknown }) => (p.value ? `${p.value}일` : '-') },

        // 계약
        { headerName: '계약자', field: 'contractor_name', width: 90 },
        { headerName: '연락처', field: 'contractor_phone', width: 120 },
        { headerName: '월 대여료', field: 'rent_amount', width: 100, ...money() },
        { headerName: '결제일', field: 'auto_debit_day', width: 60, filter: false, cellStyle: { textAlign: 'center' } },
        { headerName: '계약 종료', field: 'contract_end', width: 100 },
        { headerName: '계약 잔여', field: 'days_to_end', width: 90, ...days() },
        { headerName: '조치상태', field: 'action_status', width: 90, filter: JpkSetFilter },

        // 보험
        { headerName: '보험사', field: 'insurance_company', width: 100, filter: JpkSetFilter },
        { headerName: '보험 만기', field: 'insurance_days_to_end', width: 90, ...days() },
        { headerName: '연령한정', field: 'age_limit', width: 90, filter: JpkSetFilter },
        { headerName: '보험료', field: 'insurance_premium', width: 100, ...money() },

        // 운영 부가
        { headerName: '주행거리', field: 'current_mileage', width: 110, filter: false, cellStyle: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' }, valueFormatter: (p: { value: unknown }) => (p.value ? `${fmt(Number(p.value))}km` : '-') },
        { headerName: '주유비', field: 'fuel_cost', width: 100, ...money() },
        { headerName: '세차비', field: 'wash_cost', width: 100, ...money() },
        { headerName: '과태료', field: 'penalty_cost', width: 100, ...money() },
        { headerName: '탁송비', field: 'delivery_cost', width: 100, ...money() },
        { headerName: '마지막 정비', field: 'last_maint_date', width: 100 },
      ] as ColDef<OpRow>[],
    [],
  );

  useEffect(() => { onCountChange?.(rows.length); }, [rows.length, onCountChange]);

  if (assets.loading) {
    return (
      <div className="flex items-center justify-center gap-2 text-text-muted" style={{ height: '100%', minHeight: 200 }}>
        <i className="ph ph-spinner spin" /> 로드 중...
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <div className="flex-1 min-h-0">
        <JpkGrid<OpRow>
          ref={gridRef as Ref<JpkGridApi<OpRow>>}
          columnDefs={columnDefs}
          rowData={rows}
          getRowId={(d) => d.car_number}
          storageKey="jpk.grid.status.operation"
          contextMenu={() => [
            { label: 'CSV 내보내기', icon: 'ph-download-simple', onClick: () => gridRef.current?.exportCsv('통합리포트') },
            { label: '필터 초기화', icon: 'ph-funnel-x', onClick: () => gridRef.current?.resetFilters() },
            { label: '컬럼 자동조정', icon: 'ph-arrows-out-line-horizontal', onClick: () => gridRef.current?.autoSizeAllColumns() },
          ]}
        />
      </div>
    </div>
  );
}
