'use client';

import { Workspace } from '@/components/shared/panel';
import { SimpleRtdbGrid } from '@/components/shared/simple-rtdb-grid';
import { typedColumn } from '@/lib/grid/typed-column';
import { fmtDate } from '@/lib/utils';
import type { ColDef } from 'ag-grid-community';

const cols: ColDef[] = [
  typedColumn('action', { headerName: '#', valueGetter: (p) => (p.node?.rowIndex ?? 0) + 1, width: 45, cellStyle: { color: 'var(--c-text-muted)' } }),
  typedColumn('text',   { headerName: '인감명', field: 'name', width: 160, cellStyle: { fontWeight: '600' } }),
  typedColumn('select', { headerName: '구분', field: 'seal_type', width: 100 }),
  typedColumn('text',   { headerName: '설명', field: 'description', flex: 1, minWidth: 200 }),
  typedColumn('date',   { headerName: '등록일', field: 'created_date', width: 100, valueFormatter: (p) => fmtDate(p.value as string) }),
  typedColumn('select', { headerName: '상태', field: 'status', width: 70 }),
];

export default function Page() {
  return (
    <Workspace layout="layout-1">
      <SimpleRtdbGrid
        path="seals"
        columnDefs={cols}
        storageKey="jpk.grid.admin.seal"
        emptyMessage="등록된 인감이 없습니다"
        title="인감 관리"
        subtitle="법인 인감 이미지"
        icon="ph-stamp"
        unit="개"
        exportFileName="인감"
      />
    </Workspace>
  );
}
