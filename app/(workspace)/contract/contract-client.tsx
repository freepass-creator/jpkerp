'use client';

import { useEffect, useMemo, useRef, type Ref, type RefObject } from 'react';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import { JpkGrid, type JpkGridApi } from '@/components/shared/jpk-grid';
import { typedColumn, rowNumColumn, MONO_CELL_STYLE } from '@/lib/grid/typed-column';
import { computeContractEnd, normalizeDate } from '@/lib/date-utils';
import type { RtdbContract } from '@/lib/types/rtdb-entities';
import { fmt, fmtDate } from '@/lib/utils';
import type { ColDef } from 'ag-grid-community';

export interface ContractRow extends RtdbContract {
  _end_date?: string;
  _expired_days?: number;
}

interface Props {
  gridRef?: RefObject<JpkGridApi<ContractRow> | null>;
  onCountChange?: (count: number) => void;
  onRowClick?: (row: ContractRow) => void;
}

export function ContractClient({ gridRef: externalRef, onCountChange, onRowClick }: Props = {}) {
  const internalRef = useRef<JpkGridApi<ContractRow> | null>(null);
  const gridRef = externalRef ?? internalRef;
  const contracts = useRtdbCollection<RtdbContract>('contracts');

  const rows = useMemo<ContractRow[]>(() => {
    const today = new Date().toISOString().slice(0, 10);
    return contracts.data.map((c) => {
      const end = computeContractEnd(c);
      const expired = end && end < today && c.contract_status !== '계약해지';
      const days = expired ? Math.floor((Date.now() - new Date(end).getTime()) / 86400000) : 0;
      return { ...c, _end_date: end, _expired_days: days };
    });
  }, [contracts.data]);

  const cols = useMemo<ColDef<ContractRow>[]>(
    () => [
      rowNumColumn(),
      typedColumn('select', { headerName: '회원사', field: 'partner_code', width: 75 }),
      typedColumn('text',   { headerName: '계약코드', field: 'contract_code', width: 125, cellStyle: MONO_CELL_STYLE }),
      typedColumn('text',   { headerName: '차량번호', field: 'car_number', width: 100, cellStyle: { fontWeight: '600' } }),
      typedColumn('text',   { headerName: '계약자', field: 'contractor_name', width: 90 }),
      typedColumn('text',   { headerName: '연락처', field: 'contractor_phone', width: 115 }),
      typedColumn('select', { headerName: '계약상태', field: 'contract_status', width: 85, cellStyle: (p) => {
        const v = p.value as string;
        const color = v === '계약진행' ? 'var(--c-success)'
          : v === '계약대기' ? 'var(--c-primary)'
          : v === '계약해지' ? 'var(--c-danger)'
          : 'var(--c-text-muted)';
        return { color, fontWeight: '600' };
      } }),
      typedColumn('select', { headerName: '상품', field: 'product_type', width: 80 }),
      typedColumn('date',   { headerName: '시작일', field: 'start_date', width: 95, valueFormatter: (p) => fmtDate(normalizeDate(p.value as string)) }),
      typedColumn('date',   { headerName: '종료일', field: '_end_date', width: 95, valueFormatter: (p) => fmtDate(p.value as string) }),
      typedColumn('number', { headerName: '기간', field: 'rent_months', width: 65, valueFormatter: (p) => (p.value ? `${p.value}개월` : '-') }),
      typedColumn('number', { headerName: '월 대여료', field: 'rent_amount', width: 100, valueFormatter: (p) => fmt(Number(p.value)) }),
      typedColumn('number', { headerName: '보증금', field: 'deposit_amount', width: 100, valueFormatter: (p) => fmt(Number(p.value)) }),
      typedColumn('select', { headerName: '결제일', field: 'auto_debit_day', width: 65 }),
      typedColumn('select', { headerName: '조치상태', field: 'action_status', width: 85 }),
      typedColumn('number', {
        headerName: '만기후',
        field: '_expired_days',
        width: 75,
        valueFormatter: (p) => (Number(p.value) > 0 ? `+${p.value}일` : '-'),
        cellStyle: (p) => {
          const v = Number(p.value);
          return {
            textAlign: 'right',
            color: v > 0 ? 'var(--c-danger)' : 'var(--c-text-muted)',
            fontWeight: v > 0 ? '600' : '400',
          };
        },
      }),
    ],
    [],
  );

  useEffect(() => { onCountChange?.(rows.length); }, [rows.length, onCountChange]);

  if (contracts.loading) {
    return (
      <div className="flex items-center justify-center gap-2 text-text-muted" style={{ height: '100%', minHeight: 200 }}>
        <i className="ph ph-spinner spin" /> 로드 중...
      </div>
    );
  }

  return (
    <JpkGrid<ContractRow>
      ref={gridRef as Ref<JpkGridApi<ContractRow>>}
      columnDefs={cols}
      rowData={rows}
      getRowId={(d) => d.contract_code ?? d._key ?? ''}
      storageKey="jpk.grid.contract"
      onRowClicked={onRowClick}
    />
  );
}
