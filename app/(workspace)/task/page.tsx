'use client';

import Link from 'next/link';
import { Workspace } from '@/components/shared/panel';
import { SimpleRtdbGrid } from '@/components/shared/simple-rtdb-grid';
import { typedColumn, rowNumColumn } from '@/lib/grid/typed-column';
import { fmtDate } from '@/lib/utils';
import type { ColDef } from 'ag-grid-community';

interface TaskRow extends Record<string, unknown> {
  _key?: string;
  title?: string;
  assignee_name?: string;
  assignee_uid?: string;
  car_number?: string;
  due_date?: string;
  priority?: string;
  state?: string;
  memo?: string;
  created_at?: number;
}

const PRIORITY_COLORS: Record<string, string> = {
  긴급: 'var(--c-danger)',
  높음: 'var(--c-warn)',
  보통: 'var(--c-text)',
  낮음: 'var(--c-text-muted)',
};

const STATE_COLORS: Record<string, string> = {
  대기: 'var(--c-text-muted)',
  진행중: 'var(--c-primary)',
  완료: 'var(--c-success)',
  보류: 'var(--c-warn)',
};

const cols: ColDef<TaskRow>[] = [
  rowNumColumn<TaskRow>(),
  typedColumn('text',   { headerName: '제목', field: 'title', flex: 1, minWidth: 220, cellStyle: { fontWeight: '600' } }),
  typedColumn('text',   { headerName: '담당자', field: 'assignee_name', width: 100 }),
  typedColumn('text',   { headerName: '관련 차량', field: 'car_number', width: 100 }),
  typedColumn('date',   { headerName: '마감일', field: 'due_date', width: 100, valueFormatter: (p) => fmtDate(p.value as string) }),
  typedColumn('select', {
    headerName: '우선순위', field: 'priority', width: 85,
    cellStyle: (p: { value: unknown }) => ({ color: PRIORITY_COLORS[p.value as string] ?? 'var(--c-text)', fontWeight: 600 }),
  }),
  typedColumn('select', {
    headerName: '상태', field: 'state', width: 85,
    cellStyle: (p: { value: unknown }) => ({ color: STATE_COLORS[p.value as string] ?? 'var(--c-text-muted)', fontWeight: 600 }),
  }),
  typedColumn('text',   { headerName: '상세', field: 'memo', flex: 1, minWidth: 180, cellStyle: { color: 'var(--c-text-muted)' } }),
];

export default function Page() {
  return (
    <Workspace layout="layout-1">
      <SimpleRtdbGrid<TaskRow>
        path="tasks"
        columnDefs={cols}
        storageKey="jpk.grid.task"
        title="업무 목록"
        subtitle="담당자 지정 · todo/할 일"
        icon="ph-check-square"
        unit="건"
        exportFileName="업무"
        primaryActions={
          <Link href="/input?type=task" className="btn btn-sm btn-primary" style={{ textDecoration: 'none' }}>
            <i className="ph ph-plus" />새 업무
          </Link>
        }
      />
    </Workspace>
  );
}
