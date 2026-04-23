'use client';

import { useEffect, useMemo, useRef, type Ref, type RefObject } from 'react';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import { JpkGrid, type JpkGridApi } from '@/components/shared/jpk-grid';
import { typedColumn, rowNumColumn } from '@/lib/grid/typed-column';
import { computeTotalDue, today, daysBetween } from '@/lib/date-utils';
import type { RtdbBilling, RtdbContract } from '@/lib/types/rtdb-entities';
import { fmt, fmtDate } from '@/lib/utils';
import type { ColDef } from 'ag-grid-community';

export interface BillRow {
  _key?: string;
  billing_id?: string;
  contract_code?: string;
  partner_code: string;
  car_number: string;
  contractor_name: string;
  bill_count: number;
  due_date: string;
  amount: number;
  paid_total: number;
  unpaid: number;
  overdue_days: number;
  status: string;
}

interface Props {
  gridRef?: RefObject<JpkGridApi<BillRow> | null>;
  onCountChange?: (count: number) => void;
}

export function BillingClient({ gridRef: externalRef, onCountChange }: Props = {}) {
  const internalRef = useRef<JpkGridApi<BillRow> | null>(null);
  const gridRef = externalRef ?? internalRef;
  const billings = useRtdbCollection<RtdbBilling>('billings');
  const contracts = useRtdbCollection<RtdbContract>('contracts');

  const rows = useMemo<BillRow[]>(() => {
    const t = today();
    const byCode = new Map<string, RtdbContract>();
    for (const c of contracts.data) if (c.contract_code) byCode.set(c.contract_code, c);

    return billings.data.map((b) => {
      const due = computeTotalDue(b);
      const paid = Number(b.paid_total) || 0;
      const unpaid = Math.max(0, due - paid);
      const c = b.contract_code ? byCode.get(b.contract_code) : undefined;
      const overdue_days = b.due_date && b.due_date < t && unpaid > 0 ? daysBetween(b.due_date, t) : 0;
      const status = paid >= due ? '완납' : unpaid > 0 && b.due_date && b.due_date < t ? '연체' : paid > 0 ? '부분입금' : '청구대기';
      return {
        _key: b._key,
        billing_id: (b.billing_id as string) ?? b._key,
        contract_code: b.contract_code,
        partner_code: c?.partner_code ?? '-',
        car_number: c?.car_number ?? ((b.car_number as string) ?? '-'),
        contractor_name: c?.contractor_name ?? '-',
        bill_count: Number(b.bill_count) || 0,
        due_date: b.due_date ?? '',
        amount: due,
        paid_total: paid,
        unpaid,
        overdue_days,
        status,
      };
    });
  }, [billings.data, contracts.data]);

  const cols = useMemo<ColDef<BillRow>[]>(
    () => [
      rowNumColumn(),
      typedColumn('select', { headerName: '회원사', field: 'partner_code', width: 75 }),
      typedColumn('text',   { headerName: '차량번호', field: 'car_number', width: 100, cellStyle: { fontWeight: '600' } }),
      typedColumn('text',   { headerName: '계약자', field: 'contractor_name', width: 90 }),
      typedColumn('number', { headerName: '회차', field: 'bill_count', width: 60, valueFormatter: (p) => (p.value ? `${p.value}회` : '-') }),
      typedColumn('date',   { headerName: '납기일', field: 'due_date', width: 100, valueFormatter: (p) => fmtDate(p.value as string) }),
      typedColumn('number', { headerName: '청구액', field: 'amount', width: 110, valueFormatter: (p) => fmt(Number(p.value)) }),
      typedColumn('number', { headerName: '입금액', field: 'paid_total', width: 110, valueFormatter: (p) => fmt(Number(p.value)), cellStyle: { textAlign: 'right', color: 'var(--c-success)', fontVariantNumeric: 'tabular-nums' } }),
      typedColumn('number', { headerName: '미납액', field: 'unpaid', width: 110, valueFormatter: (p) => (Number(p.value) ? fmt(Number(p.value)) : '-'), cellStyle: (p) => ({ textAlign: 'right', color: Number(p.value) ? 'var(--c-danger)' : 'var(--c-text-muted)', fontWeight: Number(p.value) ? '600' : '400', fontVariantNumeric: 'tabular-nums' }) }),
      typedColumn('number', {
        headerName: '연체일',
        field: 'overdue_days',
        width: 75,
        valueFormatter: (p) => (Number(p.value) ? `${p.value}일` : '-'),
        cellStyle: (p) => {
          const v = Number(p.value);
          return {
            textAlign: 'right',
            fontWeight: v ? '600' : '400',
            color: !v ? 'var(--c-text-muted)' : v >= 30 ? 'var(--c-danger)' : v >= 7 ? 'var(--c-warn)' : 'var(--c-text-sub)',
          };
        },
      }),
      typedColumn('select', {
        headerName: '상태',
        field: 'status',
        width: 85,
        cellStyle: (p) => {
          const v = p.value as string;
          const color = v === '완납' ? 'var(--c-success)'
            : v === '연체' ? 'var(--c-danger)'
            : v === '부분입금' ? 'var(--c-warn)'
            : 'var(--c-text-muted)';
          return { color, fontWeight: '600' };
        },
      }),
    ],
    [],
  );

  useEffect(() => { onCountChange?.(rows.length); }, [rows.length, onCountChange]);

  if (billings.loading) {
    return (
      <div className="flex items-center justify-center gap-2 text-text-muted" style={{ height: '100%', minHeight: 200 }}>
        <i className="ph ph-spinner spin" /> 로드 중...
      </div>
    );
  }

  return <JpkGrid<BillRow> ref={gridRef as Ref<JpkGridApi<BillRow>>} columnDefs={cols} rowData={rows} getRowId={(d) => d._key ?? `${d.contract_code}-${d.bill_count}`} storageKey="jpk.grid.billing" />;
}
