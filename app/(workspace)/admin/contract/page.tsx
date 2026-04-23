'use client';

import { Workspace } from '@/components/shared/panel';
import { SimpleRtdbGrid } from '@/components/shared/simple-rtdb-grid';
import { typedColumn, rowNumColumn } from '@/lib/grid/typed-column';
import { fmtDate } from '@/lib/utils';
import type { ColDef } from 'ag-grid-community';

const cols: ColDef[] = [
  rowNumColumn(),
  typedColumn('text',   { headerName: '템플릿명', field: 'name', width: 200, cellStyle: { fontWeight: '600' } }),
  typedColumn('select', { headerName: '구분', field: 'template_type', width: 100 }),
  typedColumn('text',   { headerName: '설명', field: 'description', flex: 1, minWidth: 200 }),
  typedColumn('text',   { headerName: '파일명', field: 'file_name', width: 180, cellStyle: { color: 'var(--c-text-muted)' } }),
  typedColumn('date',   { headerName: '등록일', field: 'created_date', width: 100, valueFormatter: (p) => fmtDate(p.value as string) }),
  typedColumn('select', { headerName: '상태', field: 'status', width: 70 }),
];

export default function Page() {
  return (
    <Workspace layout="layout-1">
      <SimpleRtdbGrid
        path="contract_templates"
        columnDefs={cols}
        storageKey="jpk.grid.admin.contract"
        emptyMessage="등록된 계약서 템플릿이 없습니다"
        title="계약서 관리"
        subtitle="표준 계약서 템플릿"
        icon="ph-file-text"
        unit="종"
        exportFileName="계약서템플릿"
      />
    </Workspace>
  );
}
