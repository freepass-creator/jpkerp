'use client';

import { useMemo } from 'react';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import { JpkGrid } from '@/components/shared/jpk-grid';
import { typedColumn, rowNumColumn, MONO_CELL_STYLE } from '@/lib/grid/typed-column';
import { computeContractEnd, today, daysBetween, normalizeDate } from '@/lib/date-utils';
import type { RtdbContract } from '@/lib/types/rtdb-entities';
import { fmtDate } from '@/lib/utils';
import type { ColDef } from 'ag-grid-community';

interface ReturnRow {
  contract_code: string;
  partner_code: string;
  car_number: string;
  contractor_name: string;
  contractor_phone: string;
  end_date: string;
  d_day: number;
  rent_months: number;
  start_date: string;
}

/**
 * 반납 일정 — 활성 계약 중 만기일 기준 앞으로 3개월 이내.
 */
export function ReturnScheduleClient() {
  const contracts = useRtdbCollection<RtdbContract>('contracts');

  const rows = useMemo<ReturnRow[]>(() => {
    const t = today();
    const limit = new Date(t);
    limit.setMonth(limit.getMonth() + 3);
    const limitStr = limit.toISOString().slice(0, 10);

    return contracts.data
      .filter((c) => {
        if (c.status === 'deleted') return false;
        if (!c.contractor_name?.trim()) return false;
        const end = computeContractEnd(c);
        return end && end >= t && end <= limitStr;
      })
      .map((c) => {
        const end = computeContractEnd(c);
        return {
          contract_code: c.contract_code ?? '',
          partner_code: c.partner_code ?? '-',
          car_number: c.car_number ?? '-',
          contractor_name: c.contractor_name ?? '-',
          contractor_phone: c.contractor_phone ?? '-',
          end_date: end,
          d_day: daysBetween(t, end),
          rent_months: Number(c.rent_months) || 0,
          start_date: normalizeDate(c.start_date),
        };
      })
      .sort((a, b) => a.d_day - b.d_day);
  }, [contracts.data]);

  const cols = useMemo<ColDef<ReturnRow>[]>(
    () => [
      rowNumColumn(),
      typedColumn('date',   { headerName: '반납 예정일', field: 'end_date', width: 110, valueFormatter: (p) => fmtDate(p.value as string), sort: 'asc' }),
      typedColumn('number', {
        headerName: 'D-day',
        field: 'd_day',
        width: 80,
        cellStyle: (p) => {
          const v = Number(p.value);
          return {
            textAlign: 'right',
            fontWeight: '600',
            color: v <= 7 ? 'var(--c-danger)' : v <= 30 ? 'var(--c-warn)' : 'var(--c-text-sub)',
          };
        },
        valueFormatter: (p) => `D-${p.value}`,
      }),
      typedColumn('select', { headerName: '회원사', field: 'partner_code', width: 75 }),
      typedColumn('text',   { headerName: '차량번호', field: 'car_number', width: 100, cellStyle: { fontWeight: '600' } }),
      typedColumn('text',   { headerName: '계약자', field: 'contractor_name', width: 90 }),
      typedColumn('text',   { headerName: '연락처', field: 'contractor_phone', width: 115 }),
      typedColumn('number', { headerName: '계약기간', field: 'rent_months', width: 80, valueFormatter: (p) => (p.value ? `${p.value}개월` : '-') }),
      typedColumn('date',   { headerName: '시작일', field: 'start_date', width: 100, valueFormatter: (p) => fmtDate(p.value as string) }),
      typedColumn('text',   { headerName: '계약코드', field: 'contract_code', width: 130, cellStyle: MONO_CELL_STYLE }),
    ],
    [],
  );

  if (contracts.loading) {
    return (
      <div className="flex items-center justify-center gap-2 text-text-muted" style={{ height: '100%', minHeight: 200 }}>
        <i className="ph ph-spinner spin" /> 로드 중...
      </div>
    );
  }

  return (
    <JpkGrid<ReturnRow>
      columnDefs={cols}
      rowData={rows}
      getRowId={(d) => d.contract_code}
      storageKey="jpk.grid.return-schedule"
    />
  );
}
