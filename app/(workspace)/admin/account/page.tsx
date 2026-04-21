'use client';

import { Workspace } from '@/components/shared/panel';
import { SimpleRtdbGrid } from '@/components/shared/simple-rtdb-grid';
import { typedColumn } from '@/lib/grid/typed-column';
import type { ColDef } from 'ag-grid-community';

const cols: ColDef[] = [
  typedColumn('action', { headerName: '#', valueGetter: (p) => (p.node?.rowIndex ?? 0) + 1, width: 45, cellStyle: { color: 'var(--c-text-muted)' } }),
  typedColumn('select', { headerName: '은행', field: 'bank_name', width: 90 }),
  typedColumn('text',   { headerName: '계좌번호', field: 'account_no', width: 170, cellStyle: { fontFamily: 'var(--font-mono)', fontSize: 11 } }),
  typedColumn('text',   { headerName: '예금주', field: 'holder', width: 100 }),
  typedColumn('select', { headerName: '용도', field: 'usage', width: 110 }),
  typedColumn('text',   { headerName: '별칭', field: 'alias', width: 100 }),
  typedColumn('select', { headerName: '상태', field: 'status', width: 70 }),
];

export default function Page() {
  return (
    <Workspace layout="layout-1">
      <SimpleRtdbGrid
        path="bank_accounts"
        columnDefs={cols}
        storageKey="jpk.grid.admin.account"
        title="계좌 관리"
        subtitle="법인 입금·출금 계좌"
        icon="ph-bank"
        unit="개"
        exportFileName="계좌"
      />
    </Workspace>
  );
}
