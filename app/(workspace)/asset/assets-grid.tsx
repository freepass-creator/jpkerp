'use client';

import { useEffect, useMemo, useRef, type Ref, type RefObject } from 'react';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import { JpkGrid, type JpkGridApi } from '@/components/shared/jpk-grid';
import { typedColumn, rowNumColumn } from '@/lib/grid/typed-column';
import type { ColDef } from 'ag-grid-community';

type Asset = {
  _key?: string;
  car_number?: string;
  partner_code?: string;
  // 제조사 스펙
  manufacturer?: string;
  car_model?: string;
  detail_model?: string;
  trim?: string;
  options?: string;
  ext_color?: string;
  int_color?: string;
  drive_type?: string;
  // 등록증 스펙
  vin?: string;
  car_year?: number | string;
  fuel_type?: string;
  displacement?: number | string;
  seats?: number | string;
  usage_type?: string;
  first_registration_date?: string;
  owner_name?: string;
  type_number?: string;
  engine_type?: string;
  status?: string;
  [k: string]: unknown;
};

interface AssetsGridProps {
  gridRef?: RefObject<JpkGridApi<Asset> | null>;
  onCountChange?: (count: number) => void;
}

export function AssetsGrid({ gridRef: externalRef, onCountChange }: AssetsGridProps = {}) {
  const internalRef = useRef<JpkGridApi<Asset> | null>(null);
  const gridRef = externalRef ?? internalRef;
  const assets = useRtdbCollection<Asset>('assets');

  useEffect(() => { onCountChange?.(assets.data.length); }, [assets.data.length, onCountChange]);

  const columnDefs = useMemo<ColDef<Asset>[]>(() => [
    // ── 차량 식별 ──
    rowNumColumn<Asset>({ width: 40, pinned: 'left' }),
    typedColumn('select', { headerName: '회사코드', field: 'partner_code', width: 80, pinned: 'left' }),
    typedColumn('text', { headerName: '차량번호', field: 'car_number', width: 90, pinned: 'left', cellStyle: { fontWeight: 600 } }),

    // ── 제조사 스펙 ──
    typedColumn('select', { headerName: '제조사', field: 'manufacturer', width: 80 }),
    typedColumn('select', { headerName: '모델', field: 'car_model', width: 100 }),
    typedColumn('text', { headerName: '세부모델', field: 'detail_model', width: 160 }),
    typedColumn('text', { headerName: '세부트림', field: 'trim', width: 100 }),
    typedColumn('text', { headerName: '선택옵션', field: 'options', width: 120 }),
    typedColumn('select', { headerName: '외장색', field: 'ext_color', width: 70 }),
    typedColumn('select', { headerName: '내장색', field: 'int_color', width: 70 }),
    typedColumn('select', { headerName: '구동', field: 'drive_type', width: 60 }),

    // ── 등록증 스펙 (등록증 반영 후 채워짐) ──
    typedColumn('text', { headerName: '차대번호', field: 'vin', width: 150 }),
    typedColumn('number', { headerName: '연식', field: 'car_year', width: 60 }),
    typedColumn('select', { headerName: '연료', field: 'fuel_type', width: 70 }),
    typedColumn('number', {
      headerName: '배기량',
      field: 'displacement',
      width: 70,
      valueFormatter: (p) => p.value ? `${Number(p.value).toLocaleString()}` : '',
    }),
    typedColumn('number', {
      headerName: '인승',
      field: 'seats',
      width: 50,
      valueFormatter: (p) => p.value ? `${p.value}` : '',
    }),
    typedColumn('select', { headerName: '용도', field: 'usage_type', width: 70 }),
    typedColumn('text', { headerName: '최초등록일', field: 'first_registration_date', width: 90 }),
    typedColumn('text', { headerName: '소유자', field: 'owner_name', width: 90 }),
    typedColumn('text', { headerName: '형식번호', field: 'type_number', width: 80 }),
    typedColumn('text', { headerName: '원동기', field: 'engine_type', width: 70 }),
  ], []);

  if (assets.loading) {
    return (
      <div className="h-full flex items-center justify-center gap-2 text-text-muted">
        <i className="ph ph-spinner spin" /> 차량 데이터 로드 중...
      </div>
    );
  }

  if (assets.error) {
    return (
      <div className="p-6">
        <div className="font-bold text-danger mb-1">데이터 로드 실패</div>
        <div className="text-text-sub">{assets.error.message}</div>
      </div>
    );
  }

  return (
    <div style={{ height: '100%' }}>
      <JpkGrid<Asset>
        ref={gridRef as Ref<JpkGridApi<Asset>>}
        columnDefs={columnDefs}
        rowData={assets.data}
        getRowId={(d) => d._key ?? d.car_number ?? ''}
        storageKey="jpk.grid.assets.v2"
        contextMenu={() => [
          { label: 'CSV 내보내기', icon: 'ph-download-simple', onClick: () => gridRef.current?.exportCsv('자산목록') },
          { label: '필터 초기화', icon: 'ph-funnel-x', onClick: () => gridRef.current?.resetFilters() },
        ]}
      />
    </div>
  );
}
