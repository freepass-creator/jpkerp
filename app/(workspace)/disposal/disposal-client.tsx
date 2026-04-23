'use client';

import { useEffect, useMemo, useRef, type Ref, type RefObject } from 'react';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import { JpkGrid, type JpkGridApi } from '@/components/shared/jpk-grid';
import { typedColumn, rowNumColumn } from '@/lib/grid/typed-column';
import type { RtdbAsset } from '@/lib/types/rtdb-entities';
import { fmt, fmtDate } from '@/lib/utils';
import type { ColDef } from 'ag-grid-community';

export type DisposalRow = RtdbAsset & {
  asset_status?: string;
  disposed_at?: string;
  disposal_price?: number;
  acquisition_cost?: number;
  _profit?: number;
};

interface Props {
  gridRef?: RefObject<JpkGridApi<DisposalRow> | null>;
  onCountChange?: (count: number) => void;
}

/** 매각 차량 — asset_status === '매각' OR disposal event 있음 */
export function DisposalClient({ gridRef: externalRef, onCountChange }: Props = {}) {
  const internalRef = useRef<JpkGridApi<DisposalRow> | null>(null);
  const gridRef = externalRef ?? internalRef;
  const assets = useRtdbCollection<DisposalRow>('assets');

  const rows = useMemo(() => {
    return assets.data
      .filter((a) => a.status !== 'deleted' && (a.asset_status === '매각' || a.asset_status === '매각대기' || a.disposed_at))
      .map((a) => ({
        ...a,
        _profit:
          (Number(a.disposal_price) || 0) - (Number(a.acquisition_cost) || 0),
      }));
  }, [assets.data]);

  const cols = useMemo<ColDef[]>(
    () => [
      rowNumColumn(),
      typedColumn('select', { headerName: '회원사', field: 'partner_code', width: 85 }),
      typedColumn('text',   { headerName: '차량번호', field: 'car_number', width: 100, cellStyle: { fontWeight: '600' } }),
      typedColumn('text',   { headerName: '모델', field: 'car_model', width: 140 }),
      typedColumn('text',   { headerName: '세부모델', field: 'detail_model', width: 140 }),
      typedColumn('number', { headerName: '연식', field: 'car_year', width: 70 }),
      typedColumn('select', { headerName: '상태', field: 'asset_status', width: 90, cellStyle: { color: 'var(--c-danger)', fontWeight: '600' } }),
      typedColumn('date',   { headerName: '매각일', field: 'disposed_at', width: 100, valueFormatter: (p) => fmtDate(p.value as string) }),
      typedColumn('number', { headerName: '취득원가', field: 'acquisition_cost', width: 120, valueFormatter: (p) => (p.value ? fmt(Number(p.value)) : '-') }),
      typedColumn('number', { headerName: '매각가', field: 'disposal_price', width: 120, valueFormatter: (p) => (p.value ? fmt(Number(p.value)) : '-') }),
      typedColumn('number', {
        headerName: '매각손익',
        field: '_profit',
        width: 130,
        valueFormatter: (p) => {
          const n = Number(p.value);
          return n > 0 ? `+${fmt(n)}` : n < 0 ? fmt(n) : '-';
        },
        cellStyle: (p) => {
          const n = Number(p.value);
          return {
            textAlign: 'right',
            fontVariantNumeric: 'tabular-nums',
            fontWeight: n !== 0 ? '700' : '400',
            color: n > 0 ? 'var(--c-success)' : n < 0 ? 'var(--c-danger)' : 'var(--c-text-muted)',
          };
        },
      }),
    ],
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

  return <JpkGrid<DisposalRow> ref={gridRef as Ref<JpkGridApi<DisposalRow>>} columnDefs={cols} rowData={rows} getRowId={(d) => d._key ?? d.car_number ?? ''} storageKey="jpk.grid.disposal" />;
}
