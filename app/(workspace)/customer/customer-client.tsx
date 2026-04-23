'use client';

import { useEffect, useMemo, useRef, type Ref, type RefObject } from 'react';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import { JpkGrid, type JpkGridApi } from '@/components/shared/jpk-grid';
import { typedColumn, rowNumColumn } from '@/lib/grid/typed-column';
import { fmtDate } from '@/lib/utils';
import type { ColDef } from 'ag-grid-community';

export type RtdbCustomer = {
  _key?: string;
  customer_id?: string;
  partner_code?: string;
  name?: string;
  phone?: string;
  birth?: string;
  gender?: string;
  address?: string;
  license_no?: string;
  license_expiry?: string;
  email?: string;
  note?: string;
  created_at?: number;
  status?: string;
  [k: string]: unknown;
};

interface Props {
  gridRef?: RefObject<JpkGridApi<RtdbCustomer> | null>;
  onCountChange?: (count: number) => void;
}

export function CustomerClient({ gridRef: externalRef, onCountChange }: Props = {}) {
  const internalRef = useRef<JpkGridApi<RtdbCustomer> | null>(null);
  const gridRef = externalRef ?? internalRef;
  const customers = useRtdbCollection<RtdbCustomer>('customers');
  const contracts = useRtdbCollection<{ contractor_name?: string; car_number?: string; status?: string; [k: string]: unknown }>('contracts');

  const rows = useMemo(() => {
    // 계약 수 조인 (이름+연락처 기준)
    const contractCountByName = new Map<string, number>();
    for (const c of contracts.data) {
      if (c.status === 'deleted') continue;
      if (c.contractor_name) {
        contractCountByName.set(c.contractor_name, (contractCountByName.get(c.contractor_name) ?? 0) + 1);
      }
    }
    return customers.data.map((c) => ({
      ...c,
      _contract_count: c.name ? (contractCountByName.get(c.name) ?? 0) : 0,
    }));
  }, [customers.data, contracts.data]);

  const cols = useMemo<ColDef[]>(
    () => [
      rowNumColumn(),
      typedColumn('select', { headerName: '회원사', field: 'partner_code', width: 75 }),
      typedColumn('text',   { headerName: '이름', field: 'name', width: 90, cellStyle: { fontWeight: '600' } }),
      typedColumn('text',   { headerName: '연락처', field: 'phone', width: 120 }),
      typedColumn('text',   { headerName: '생년월일', field: 'birth', width: 95 }),
      typedColumn('select', { headerName: '성별', field: 'gender', width: 60 }),
      typedColumn('text',   { headerName: '주소', field: 'address', flex: 1, minWidth: 180 }),
      typedColumn('text',   { headerName: '면허번호', field: 'license_no', width: 130 }),
      typedColumn('date',   { headerName: '면허만기', field: 'license_expiry', width: 95, valueFormatter: (p) => fmtDate(p.value as string) }),
      typedColumn('text',   { headerName: '이메일', field: 'email', width: 160 }),
      typedColumn('number', {
        headerName: '계약수',
        field: '_contract_count',
        width: 70,
        valueFormatter: (p) => (p.value ? `${p.value}건` : '-'),
        cellStyle: (p) => ({ textAlign: 'right', color: Number(p.value) > 0 ? 'var(--c-primary)' : 'var(--c-text-muted)', fontWeight: Number(p.value) > 0 ? '600' : '400' }),
      }),
    ],
    [],
  );

  useEffect(() => { onCountChange?.(rows.length); }, [rows.length, onCountChange]);

  if (customers.loading) {
    return (
      <div className="flex items-center justify-center gap-2 text-text-muted" style={{ height: '100%', minHeight: 200 }}>
        <i className="ph ph-spinner spin" /> 로드 중...
      </div>
    );
  }

  return <JpkGrid<RtdbCustomer> ref={gridRef as Ref<JpkGridApi<RtdbCustomer>>} columnDefs={cols} rowData={rows} getRowId={(d) => d.customer_id ?? d._key ?? ''} storageKey="jpk.grid.customer" />;
}
