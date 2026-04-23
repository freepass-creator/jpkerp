'use client';

import { useEffect, useMemo, useRef, type Ref, type RefObject } from 'react';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import { JpkGrid, type JpkGridApi } from '@/components/shared/jpk-grid';
import { JpkSetFilter } from '@/lib/grid/set-filter';
import { rowNumColumn } from '@/lib/grid/typed-column';
import { isActiveContract } from '@/lib/date-utils';
import type { RtdbAsset, RtdbContract } from '@/lib/types/rtdb-entities';
import { fmt } from '@/lib/utils';
import type { ColDef } from 'ag-grid-community';

export interface ProductRow {
  car_number: string;
  partner_code: string;
  model_name: string;
  sub_model: string;
  year: string | number;
  mileage: number | string;
  vehicle_status: string;
  source: string;
}

/**
 * 상품대기 = 활성 계약이 없어 출고 가능한 자산.
 * (freepasserp products 동기화는 Phase 2에서 Cloud Function으로 붙일 예정)
 */
interface Props {
  gridRef?: RefObject<JpkGridApi<ProductRow> | null>;
  onCountChange?: (count: number) => void;
}

export function ProductClient({ gridRef: externalRef, onCountChange }: Props = {}) {
  const internalRef = useRef<JpkGridApi<ProductRow> | null>(null);
  const gridRef = externalRef ?? internalRef;
  const assets = useRtdbCollection<RtdbAsset>('assets');
  const contracts = useRtdbCollection<RtdbContract>('contracts');

  const rows = useMemo<ProductRow[]>(() => {
    const active = new Set(
      contracts.data
        .filter((c) => isActiveContract(c))
        .map((c) => c.car_number)
        .filter(Boolean) as string[],
    );
    return assets.data
      .filter((a) => a.status !== 'deleted' && a.car_number && !active.has(a.car_number))
      .map<ProductRow>((a) => ({
        car_number: a.car_number ?? '-',
        partner_code: a.partner_code ?? '-',
        model_name: a.car_model ?? '',
        sub_model: a.detail_model ?? '',
        year: a.car_year ?? '',
        mileage: a.current_mileage ?? 0,
        vehicle_status: '출고가능',
        source: 'ERP',
      }));
  }, [assets.data, contracts.data]);

  const columnDefs = useMemo<ColDef<ProductRow>[]>(
    () =>
      [
        rowNumColumn<ProductRow>(),
        { headerName: '회사코드', field: 'partner_code', width: 85, filter: JpkSetFilter },
        { headerName: '차량번호', field: 'car_number', width: 100, cellStyle: { fontWeight: '600' } },
        { headerName: '모델', field: 'model_name', width: 130 },
        { headerName: '세부모델', field: 'sub_model', flex: 1, minWidth: 140 },
        { headerName: '연식', field: 'year', width: 70, filter: false, cellStyle: { textAlign: 'right' } },
        { headerName: '주행거리', field: 'mileage', width: 105, filter: false, cellStyle: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' }, valueFormatter: (p: { value: unknown }) => {
          const n = Number(p.value);
          return Number.isFinite(n) && n > 0 ? fmt(n) : '-';
        } },
        { headerName: '차량상태', field: 'vehicle_status', width: 90, filter: JpkSetFilter, cellStyle: { color: 'var(--c-success)', fontWeight: '600' } },
        { headerName: '출처', field: 'source', width: 70, filter: JpkSetFilter },
      ] as ColDef<ProductRow>[],
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
    <JpkGrid<ProductRow>
      ref={gridRef as Ref<JpkGridApi<ProductRow>>}
      columnDefs={columnDefs}
      rowData={rows}
      getRowId={(d) => d.car_number}
      storageKey="jpk.grid.status.product"
    />
  );
}
