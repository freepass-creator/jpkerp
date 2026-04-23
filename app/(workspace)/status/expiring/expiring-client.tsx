'use client';

import { useEffect, useMemo, useRef, useState, type Ref, type RefObject } from 'react';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import { JpkGrid, type JpkGridApi } from '@/components/shared/jpk-grid';
import { JpkSetFilter } from '@/lib/grid/set-filter';
import { rowNumColumn } from '@/lib/grid/typed-column';
import { normalizeDate, computeContractEnd, today, daysBetween } from '@/lib/date-utils';
import type { RtdbAsset, RtdbContract } from '@/lib/types/rtdb-entities';
import { fmtDate } from '@/lib/utils';
import type { ColDef } from 'ag-grid-community';

export interface ExpiringRow {
  contract_code: string;
  contractor_name: string;
  contractor_phone: string;
  car_number: string;
  detail_model: string;
  partner_code: string;
  start_date: string;
  end_date: string;
  rent_months: number | string;
  d_day: number;
  contract_status: string;
}

interface Props {
  gridRef?: RefObject<JpkGridApi<ExpiringRow> | null>;
  onCountChange?: (count: number) => void;
}

export function ExpiringClient({ gridRef: externalRef, onCountChange }: Props = {}) {
  const internalRef = useRef<JpkGridApi<ExpiringRow> | null>(null);
  const gridRef = externalRef ?? internalRef;
  const assets = useRtdbCollection<RtdbAsset>('assets');
  const contracts = useRtdbCollection<RtdbContract>('contracts');
  const [rangeMonths, setRangeMonths] = useState(3);

  const rows = useMemo<ExpiringRow[]>(() => {
    const t = today();
    const limit = new Date(t);
    limit.setMonth(limit.getMonth() + rangeMonths);
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
        const asset = assets.data.find((a) => a.car_number === c.car_number);
        return {
          contract_code: c.contract_code ?? '',
          contractor_name: c.contractor_name ?? '-',
          contractor_phone: c.contractor_phone ?? '',
          car_number: c.car_number ?? '-',
          detail_model: asset?.detail_model ?? asset?.car_model ?? '',
          partner_code: c.partner_code ?? asset?.partner_code ?? '-',
          start_date: normalizeDate(c.start_date),
          end_date: end,
          rent_months: c.rent_months ?? '',
          d_day: daysBetween(t, end),
          contract_status: c.contract_status ?? '',
        };
      })
      .sort((a, b) => a.d_day - b.d_day);
  }, [assets.data, contracts.data, rangeMonths]);

  useEffect(() => { onCountChange?.(rows.length); }, [rows.length, onCountChange]);

  const columnDefs = useMemo<ColDef<ExpiringRow>[]>(
    () =>
      [
        rowNumColumn<ExpiringRow>(),
        { headerName: '회사코드', field: 'partner_code', width: 80, filter: JpkSetFilter },
        { headerName: '계약자', field: 'contractor_name', width: 85 },
        { headerName: '연락처', field: 'contractor_phone', width: 110 },
        { headerName: '차량번호', field: 'car_number', width: 95, cellStyle: { fontWeight: '600' } },
        { headerName: '세부모델', field: 'detail_model', flex: 1, minWidth: 140 },
        { headerName: '계약기간', field: 'rent_months', width: 75, filter: false, cellStyle: { textAlign: 'right' }, valueFormatter: (p: { value: unknown }) => (p.value ? `${p.value}개월` : '-') },
        { headerName: '시작일', field: 'start_date', width: 90, valueFormatter: (p: { value: unknown }) => fmtDate(p.value as string) },
        { headerName: '종료일', field: 'end_date', width: 90, valueFormatter: (p: { value: unknown }) => fmtDate(p.value as string) },
        {
          headerName: 'D-day',
          field: 'd_day',
          width: 75,
          filter: false,
          sort: 'asc',
          cellStyle: (p: { value: unknown }) => {
            const v = Number(p.value);
            return {
              textAlign: 'right',
              fontWeight: '600',
              color: v <= 7 ? 'var(--c-danger)' : v <= 30 ? 'var(--c-warn)' : 'var(--c-text-sub)',
            };
          },
          valueFormatter: (p: { value: unknown }) => `D-${p.value}`,
        },
      ] as ColDef<ExpiringRow>[],
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
    <div className="flex flex-col" style={{ height: '100%' }}>
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
        <span className="text-xs text-text-muted">기간</span>
        {[1, 2, 3, 6].map((m) => (
          <button
            key={m}
            type="button"
            className={`btn btn-sm ${rangeMonths === m ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setRangeMonths(m)}
          >
            {m}개월
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        <JpkGrid<ExpiringRow>
          ref={gridRef as Ref<JpkGridApi<ExpiringRow>>}
          columnDefs={columnDefs}
          rowData={rows}
          getRowId={(d) => d.contract_code || d.car_number}
          storageKey="jpk.grid.status.expiring"
        />
      </div>
    </div>
  );
}
