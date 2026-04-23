'use client';

import { Workspace } from '@/components/shared/panel';
import { SimpleRtdbGrid } from '@/components/shared/simple-rtdb-grid';
import { typedColumn, rowNumColumn } from '@/lib/grid/typed-column';
import { fmtDate } from '@/lib/utils';
import type { ColDef } from 'ag-grid-community';

const cols: ColDef[] = [
  rowNumColumn(),
  typedColumn('text',   { headerName: '신청자', field: 'name', width: 90, cellStyle: { fontWeight: '600' } }),
  typedColumn('select', { headerName: '휴가구분', field: 'leave_type', width: 95 }),
  typedColumn('date',   { headerName: '시작일', field: 'start_date', width: 100, valueFormatter: (p) => fmtDate(p.value as string) }),
  typedColumn('date',   { headerName: '종료일', field: 'end_date', width: 100, valueFormatter: (p) => fmtDate(p.value as string) }),
  typedColumn('number', { headerName: '일수', field: 'days', width: 70, valueFormatter: (p) => (p.value ? `${p.value}일` : '-') }),
  typedColumn('text',   { headerName: '사유', field: 'reason', flex: 1, minWidth: 180 }),
  typedColumn('select', {
    headerName: '상태',
    field: 'status',
    width: 80,
    cellStyle: (p) => {
      const v = p.value as string;
      const color = v === '승인' ? 'var(--c-success)'
        : v === '반려' ? 'var(--c-danger)'
        : v === '대기' ? 'var(--c-warn)'
        : 'var(--c-text-muted)';
      return { color, fontWeight: '600' };
    },
  }),
  typedColumn('date', { headerName: '신청일', field: 'created_date', width: 100, valueFormatter: (p) => fmtDate(p.value as string) }),
];

export default function Page() {
  return (
    <Workspace layout="layout-1">
      <SimpleRtdbGrid
        path="leaves"
        columnDefs={cols}
        storageKey="jpk.grid.admin.leave"
        title="휴가 관리"
        subtitle="휴가 신청 · 승인"
        icon="ph-calendar-check"
        unit="건"
        exportFileName="휴가"
      />
    </Workspace>
  );
}
