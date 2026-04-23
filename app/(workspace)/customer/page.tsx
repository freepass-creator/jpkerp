'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Workspace } from '@/components/shared/panel';
import { SimpleRtdbGrid } from '@/components/shared/simple-rtdb-grid';
import { typedColumn, rowNumColumn } from '@/lib/grid/typed-column';
import { fmtDate } from '@/lib/utils';
import type { ColDef } from 'ag-grid-community';
import type { RtdbCustomer } from './customer-client';
import { CustomerEditDialog } from './customer-edit-dialog';

const cols: ColDef<RtdbCustomer>[] = [
  rowNumColumn<RtdbCustomer>(),
  typedColumn('text',   { headerName: '이름', field: 'name', width: 90 }),
  typedColumn('text',   { headerName: '연락처', field: 'phone', width: 115 }),
  typedColumn('text',   { headerName: '생년월일', field: 'birth', width: 100 }),
  typedColumn('select', { headerName: '성별', field: 'gender', width: 60 }),
  typedColumn('text',   { headerName: '면허번호', field: 'license_no', width: 130 }),
  typedColumn('date',   { headerName: '면허만기', field: 'license_expiry', width: 100, valueFormatter: (p) => fmtDate(p.value as string) }),
  typedColumn('select', { headerName: '회원사', field: 'partner_code', width: 90 }),
  typedColumn('text',   { headerName: '주소', field: 'address', flex: 1, minWidth: 200 }),
  typedColumn('select', { headerName: '상태', field: 'status', width: 70 }),
];

export default function Page() {
  const [editing, setEditing] = useState<RtdbCustomer | null>(null);

  return (
    <Workspace layout="layout-1">
      <SimpleRtdbGrid<RtdbCustomer>
        path="customers"
        columnDefs={cols}
        storageKey="jpk.grid.customer"
        title="고객 관리"
        subtitle="행 클릭 → 편집"
        icon="ph-user-list"
        unit="명"
        exportFileName="고객목록"
        onRowClick={(row) => setEditing(row)}
        primaryActions={
          <Link href="/input?type=customer" className="btn btn-sm btn-primary" style={{ textDecoration: 'none' }}>
            <i className="ph ph-plus" />새 고객
          </Link>
        }
      />
      <CustomerEditDialog record={editing} onClose={() => setEditing(null)} />
    </Workspace>
  );
}
