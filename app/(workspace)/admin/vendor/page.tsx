'use client';

import { Workspace } from '@/components/shared/panel';
import { SimpleRtdbGrid } from '@/components/shared/simple-rtdb-grid';
import { typedColumn, rowNumColumn } from '@/lib/grid/typed-column';
import type { ColDef } from 'ag-grid-community';

const cols: ColDef[] = [
  rowNumColumn(),
  typedColumn('text',   { headerName: '거래처명', field: 'vendor_name', width: 140, cellStyle: { fontWeight: '600' } }),
  typedColumn('select', { headerName: '업종', field: 'vendor_type', width: 90 }),
  typedColumn('text',   { headerName: '담당자', field: 'contact_name', width: 90 }),
  typedColumn('text',   { headerName: '연락처', field: 'phone', width: 115 }),
  typedColumn('text',   { headerName: '주소', field: 'address', flex: 1, minWidth: 180 }),
  typedColumn('text',   { headerName: '사업자번호', field: 'biz_no', width: 120 }),
  typedColumn('text',   { headerName: '계좌', field: 'bank_account', width: 140 }),
  typedColumn('text',   { headerName: '비고', field: 'note', width: 160 }),
];

export default function Page() {
  return (
    <Workspace layout="layout-1">
      <SimpleRtdbGrid
        path="vendors"
        columnDefs={cols}
        storageKey="jpk.grid.admin.vendor"
        title="거래처 관리"
        subtitle="정비·보험·세차 등 협력사"
        icon="ph-briefcase"
        unit="곳"
        exportFileName="거래처"
      />
    </Workspace>
  );
}
