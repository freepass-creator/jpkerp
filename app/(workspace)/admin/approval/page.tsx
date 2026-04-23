'use client';

import { Workspace } from '@/components/shared/panel';
import { SimpleRtdbGrid } from '@/components/shared/simple-rtdb-grid';
import { typedColumn, rowNumColumn, MONO_CELL_STYLE } from '@/lib/grid/typed-column';
import { fmtDate } from '@/lib/utils';
import type { ColDef } from 'ag-grid-community';

const cols: ColDef[] = [
  rowNumColumn(),
  typedColumn('text',   { headerName: '결재번호', field: 'approval_no', width: 140, cellStyle: MONO_CELL_STYLE }),
  typedColumn('select', { headerName: '구분', field: 'approval_type', width: 110 }),
  typedColumn('text',   { headerName: '제목', field: 'title', flex: 1, minWidth: 220, cellStyle: { fontWeight: '600' } }),
  typedColumn('text',   { headerName: '기안자', field: 'drafter', width: 90 }),
  typedColumn('date',   { headerName: '기안일', field: 'drafted_at', width: 100, valueFormatter: (p) => fmtDate(p.value as string) }),
  typedColumn('select', {
    headerName: '상태',
    field: 'status',
    width: 90,
    cellStyle: (p) => {
      const v = p.value as string;
      const color = v === '승인' ? 'var(--c-success)'
        : v === '반려' ? 'var(--c-danger)'
        : v === '대기' || v === '진행중' ? 'var(--c-warn)'
        : 'var(--c-text-muted)';
      return { color, fontWeight: '600' };
    },
  }),
  typedColumn('text', { headerName: '현재결재자', field: 'current_approver', width: 110 }),
];

export default function Page() {
  return (
    <Workspace layout="layout-1">
      <SimpleRtdbGrid
        path="approvals"
        columnDefs={cols}
        storageKey="jpk.grid.admin.approval"
        emptyMessage="진행중인 결재가 없습니다"
        title="전자결재"
        subtitle="품의 · 기안 · 승인"
        icon="ph-check-square"
        unit="건"
        exportFileName="결재"
      />
    </Workspace>
  );
}
