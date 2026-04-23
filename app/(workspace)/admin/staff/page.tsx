'use client';

import { Workspace } from '@/components/shared/panel';
import { SimpleRtdbGrid } from '@/components/shared/simple-rtdb-grid';
import { typedColumn, rowNumColumn } from '@/lib/grid/typed-column';
import type { ColDef } from 'ag-grid-community';

const ROLE_META: Record<string, { label: string; color: string }> = {
  superadmin: { label: '최고관리자', color: 'var(--c-danger)' },
  admin: { label: '관리자', color: 'var(--c-primary)' },
  staff: { label: '직원', color: 'var(--c-text)' },
  pending: { label: '승인대기', color: 'var(--c-warn)' },
};

const cols: ColDef[] = [
  rowNumColumn(),
  typedColumn('text',   { headerName: '이름', field: 'name', width: 100, cellStyle: { fontWeight: '600' } }),
  typedColumn('text',   { headerName: '이메일', field: 'email', width: 180 }),
  typedColumn('text',   { headerName: '연락처', field: 'phone', width: 120 }),
  typedColumn('select', {
    headerName: '권한',
    field: 'role',
    width: 100,
    cellStyle: (p) => ({ color: ROLE_META[p.value as string]?.color ?? 'var(--c-text)', fontWeight: '600' }),
    valueFormatter: (p) => ROLE_META[p.value as string]?.label ?? (p.value as string) ?? '-',
  }),
  typedColumn('select', { headerName: '부서', field: 'department', width: 100 }),
  typedColumn('select', { headerName: '직책', field: 'position', width: 90 }),
  typedColumn('date',   { headerName: '입사일', field: 'join_date', width: 100 }),
  typedColumn('select', { headerName: '상태', field: 'status', width: 70 }),
];

export default function Page() {
  return (
    <Workspace layout="layout-1">
      <SimpleRtdbGrid
        path="users"
        columnDefs={cols}
        storageKey="jpk.grid.admin.staff"
        title="직원 관리"
        subtitle="등록 직원 · 권한 · 부서"
        icon="ph-users-three"
        unit="명"
        exportFileName="직원"
      />
    </Workspace>
  );
}
