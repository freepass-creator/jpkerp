'use client';

import { useEffect, useMemo, useRef, type Ref, type RefObject } from 'react';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import { JpkGrid, type JpkGridApi } from '@/components/shared/jpk-grid';
import { typedColumn, rowNumColumn } from '@/lib/grid/typed-column';
import { today, daysBetween } from '@/lib/date-utils';
import { fmt, fmtDate } from '@/lib/utils';
import type { ColDef } from 'ag-grid-community';

export type RtdbLoan = {
  _key?: string;
  car_number?: string;
  vin?: string;
  partner_code?: string;
  loan_company?: string;
  loan_principal?: number;
  loan_balance?: number;
  loan_paid?: number;
  monthly_payment?: number;
  interest_rate?: number;
  loan_start_date?: string;
  loan_end_date?: string;
  status?: string;
  [k: string]: unknown;
};

interface Props {
  gridRef?: RefObject<JpkGridApi<RtdbLoan> | null>;
  onCountChange?: (count: number) => void;
}

export function LoanClient({ gridRef: externalRef, onCountChange }: Props = {}) {
  const internalRef = useRef<JpkGridApi<RtdbLoan> | null>(null);
  const gridRef = externalRef ?? internalRef;
  const loans = useRtdbCollection<RtdbLoan>('loans');

  const rows = useMemo(() => {
    const t = today();
    return loans.data.map((l) => {
      const principal = Number(l.loan_principal) || 0;
      const balance = Number(l.loan_balance) || principal;
      const paid = principal - balance;
      const progress = principal ? Math.round((paid / principal) * 100) : 0;
      const days_to_end = l.loan_end_date ? daysBetween(t, l.loan_end_date) : null;
      return { ...l, _paid: paid, _progress: progress, _days_to_end: days_to_end };
    });
  }, [loans.data]);

  const cols = useMemo<ColDef[]>(
    () => [
      rowNumColumn(),
      typedColumn('select', { headerName: '회원사', field: 'partner_code', width: 75 }),
      typedColumn('text',   { headerName: '차량번호', field: 'car_number', width: 100, cellStyle: { fontWeight: '600' } }),
      typedColumn('select', { headerName: '금융사', field: 'loan_company', width: 110 }),
      typedColumn('number', { headerName: '원금', field: 'loan_principal', width: 120, valueFormatter: (p) => fmt(Number(p.value)) }),
      typedColumn('number', { headerName: '납부', field: '_paid', width: 110, valueFormatter: (p) => fmt(Number(p.value)), cellStyle: { textAlign: 'right', color: 'var(--c-success)', fontVariantNumeric: 'tabular-nums' } }),
      typedColumn('number', { headerName: '잔액', field: 'loan_balance', width: 120, valueFormatter: (p) => fmt(Number(p.value)), cellStyle: { textAlign: 'right', color: 'var(--c-warn)', fontVariantNumeric: 'tabular-nums', fontWeight: '600' } }),
      typedColumn('number', { headerName: '진행률', field: '_progress', width: 80, valueFormatter: (p) => `${p.value}%`, cellStyle: { textAlign: 'right' } }),
      typedColumn('number', { headerName: '월 납입', field: 'monthly_payment', width: 100, valueFormatter: (p) => fmt(Number(p.value)) }),
      typedColumn('number', { headerName: '이율', field: 'interest_rate', width: 70, valueFormatter: (p) => (p.value ? `${p.value}%` : '-') }),
      typedColumn('date',   { headerName: '시작일', field: 'loan_start_date', width: 100, valueFormatter: (p) => fmtDate(p.value as string) }),
      typedColumn('date',   { headerName: '만기일', field: 'loan_end_date', width: 100, valueFormatter: (p) => fmtDate(p.value as string) }),
      typedColumn('number', {
        headerName: '만기까지',
        field: '_days_to_end',
        width: 90,
        valueFormatter: (p) => (p.value === null ? '-' : Number(p.value) > 0 ? `D-${p.value}` : `D+${-Number(p.value)}`),
        cellStyle: (p) => {
          const v = Number(p.value);
          return {
            textAlign: 'right',
            fontWeight: '600',
            color: p.value === null ? 'var(--c-text-muted)' : v < 0 ? 'var(--c-danger)' : v <= 30 ? 'var(--c-warn)' : 'var(--c-success)',
          };
        },
      }),
    ],
    [],
  );

  useEffect(() => { onCountChange?.(rows.length); }, [rows.length, onCountChange]);

  if (loans.loading) {
    return (
      <div className="flex items-center justify-center gap-2 text-text-muted" style={{ height: '100%', minHeight: 200 }}>
        <i className="ph ph-spinner spin" /> 로드 중...
      </div>
    );
  }

  return <JpkGrid<RtdbLoan> ref={gridRef as Ref<JpkGridApi<RtdbLoan>>} columnDefs={cols} rowData={rows} getRowId={(d) => d._key ?? d.car_number ?? ''} storageKey="jpk.grid.loan" />;
}
