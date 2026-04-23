'use client';

import { useEffect, useMemo, useRef, type Ref, type RefObject } from 'react';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import { JpkGrid, type JpkGridApi } from '@/components/shared/jpk-grid';
import { typedColumn, rowNumColumn } from '@/lib/grid/typed-column';
import { today, daysBetween } from '@/lib/date-utils';
import { fmt, fmtDate } from '@/lib/utils';
import type { ColDef } from 'ag-grid-community';

export type RtdbInsurance = {
  _key?: string;
  car_number?: string;
  partner_code?: string;
  insurance_company?: string;
  policy_no?: string;
  start_date?: string;
  end_date?: string;
  premium?: number;
  age_limit?: string;
  driver_range?: string;
  deductible?: number;
  coverage?: string;
  contract_type?: string;
  status?: string;
  [k: string]: unknown;
};

interface Props {
  gridRef?: RefObject<JpkGridApi<RtdbInsurance> | null>;
  onCountChange?: (count: number) => void;
}

export function InsuranceClient({ gridRef: externalRef, onCountChange }: Props = {}) {
  const internalRef = useRef<JpkGridApi<RtdbInsurance> | null>(null);
  const gridRef = externalRef ?? internalRef;
  const insurances = useRtdbCollection<RtdbInsurance>('insurances');

  const rows = useMemo(() => {
    const t = today();
    return insurances.data.map((i) => {
      const row: Record<string, unknown> = {
        ...i,
        _days_to_end: i.end_date ? daysBetween(t, i.end_date) : null,
      };
      // installments JSON → flat 컬럼 (inst_1_date, inst_1_amount, ...)
      let inst: Array<{ seq: number; date: string; amount: number }> = [];
      if (typeof i.installments === 'string' && i.installments) {
        try { inst = JSON.parse(i.installments); } catch { /* */ }
      } else if (Array.isArray(i.installments)) {
        inst = i.installments as typeof inst;
      }
      for (const entry of inst) {
        row[`inst_${entry.seq}_date`] = entry.date;
        row[`inst_${entry.seq}_amount`] = entry.amount;
      }
      // 1회차 날짜 fallback: 보험 개시일
      if (!row.inst_1_date && i.start_date) {
        row.inst_1_date = i.start_date;
      }
      return row;
    });
  }, [insurances.data]);

  /** 금액 콤마 (예: 1388610 → 1,388,610) */
  const fmtW = (n: number | null | undefined): string => {
    if (n == null || Number.isNaN(n) || n === 0) return '-';
    return Number(n).toLocaleString('ko-KR');
  };

  const cols = useMemo<ColDef[]>(
    () => [
      rowNumColumn({ width: 40 }),
      // ── 주요 항목 ──
      typedColumn('text',   { headerName: '차량번호', field: 'car_number', width: 95, cellStyle: { fontWeight: '600' }, pinned: 'left' }),
      typedColumn('text',   { headerName: '차명', field: 'car_name', width: 150 }),
      typedColumn('select', { headerName: '보험사', field: 'insurance_company', width: 120 }),
      typedColumn('date',   { headerName: '개시일', field: 'start_date', width: 90, valueFormatter: (p) => fmtDate(p.value as string) }),
      typedColumn('date',   { headerName: '만기일', field: 'end_date', width: 90, valueFormatter: (p) => fmtDate(p.value as string) }),
      typedColumn('number', {
        headerName: '만기까지',
        field: '_days_to_end',
        width: 80,
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
      typedColumn('number', { headerName: '총보험료', field: 'premium', width: 90, valueFormatter: (p) => fmtW(Number(p.value)) }),
      typedColumn('number', { headerName: '납입액', field: 'paid', width: 90, valueFormatter: (p) => fmtW(Number(p.value)) }),
      typedColumn('select', { headerName: '연령', field: 'age_limit', width: 90 }),
      typedColumn('select', { headerName: '운전범위', field: 'driver_range', width: 90 }),
      // ── 분납·이체 ──
      typedColumn('text',   { headerName: '분납', field: 'installment_method', width: 100 }),
      typedColumn('text',   { headerName: '이체은행', field: 'auto_debit_bank', width: 80 }),
      typedColumn('text',   { headerName: '이체계좌', field: 'auto_debit_account', width: 110, cellStyle: { fontFamily: 'var(--font-mono)', fontSize: 10 } }),
      // 분납 스케줄 1~6회차
      ...([1,2,3,4,5,6] as const).flatMap((n) => [
        typedColumn('date',   { headerName: `${n}회 납부일`, field: `inst_${n}_date`, width: 85, valueFormatter: (p) => fmtDate(p.value as string) }),
        typedColumn('number', { headerName: `${n}회 금액`, field: `inst_${n}_amount`, width: 85, valueFormatter: (p) => fmtW(Number(p.value)) }),
      ]),
      // ── 담보·차량 상세 ──
      typedColumn('number', { headerName: '자기부담', field: 'deductible', width: 85, valueFormatter: (p) => fmtW(Number(p.value)) }),
      typedColumn('text',   { headerName: '담보', field: 'coverage', width: 250 }),
      typedColumn('number', { headerName: '차량가액', field: 'car_value', width: 85, valueFormatter: (p) => fmtW(Number(p.value)) }),
      typedColumn('number', { headerName: '연식', field: 'year', width: 60 }),
      typedColumn('number', { headerName: '배기량', field: 'cc', width: 70, valueFormatter: (p) => { const v = Number(p.value); return v ? v.toLocaleString() + 'cc' : '-'; } }),
      typedColumn('number', { headerName: '정원', field: 'seats', width: 55 }),
      // ── 기타 ──
      typedColumn('select', { headerName: '회원사', field: 'partner_code', width: 75 }),
      typedColumn('text',   { headerName: '증권번호', field: 'policy_no', width: 170, cellStyle: { fontFamily: 'var(--font-mono)', fontSize: 10 } }),
      typedColumn('select', { headerName: '구분', field: 'doc_type', width: 70 }),
      typedColumn('select', { headerName: '계약구분', field: 'contract_type', width: 80 }),
    ],
    [],
  );

  useEffect(() => { onCountChange?.(rows.length); }, [rows.length, onCountChange]);

  if (insurances.loading) {
    return (
      <div className="flex items-center justify-center gap-2 text-text-muted" style={{ height: '100%', minHeight: 200 }}>
        <i className="ph ph-spinner spin" /> 로드 중...
      </div>
    );
  }

  return <JpkGrid<RtdbInsurance> ref={gridRef as Ref<JpkGridApi<RtdbInsurance>>} columnDefs={cols} rowData={rows} getRowId={(d) => d._key ?? d.policy_no ?? ''} storageKey="jpk.grid.insurance" />;
}
