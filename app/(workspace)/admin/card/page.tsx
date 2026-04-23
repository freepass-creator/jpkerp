'use client';

import { Workspace } from '@/components/shared/panel';
import { SimpleRtdbGrid } from '@/components/shared/simple-rtdb-grid';
import { typedColumn, rowNumColumn, MONO_CELL_STYLE } from '@/lib/grid/typed-column';
import { fmt } from '@/lib/utils';
import type { ColDef } from 'ag-grid-community';

const cols: ColDef[] = [
  rowNumColumn(),
  typedColumn('text',   { headerName: '카드번호', field: 'card_no', width: 170, cellStyle: MONO_CELL_STYLE }),
  typedColumn('select', { headerName: '카드사', field: 'card_company', width: 90 }),
  typedColumn('text',   { headerName: '사용자', field: 'card_user', width: 90 }),
  typedColumn('number', { headerName: '한도', field: 'card_limit', width: 110, valueFormatter: (p) => (p.value ? fmt(Number(p.value)) : '-') }),
  typedColumn('select', { headerName: '결제일', field: 'pay_day', width: 70 }),
  typedColumn('select', { headerName: '용도', field: 'usage', width: 100 }),
  typedColumn('select', { headerName: '상태', field: 'status', width: 70 }),
];

export default function Page() {
  return (
    <Workspace layout="layout-1">
      <SimpleRtdbGrid
        path="cards"
        columnDefs={cols}
        storageKey="jpk.grid.admin.card"
        title="법인카드"
        subtitle="법인 결제용 카드"
        icon="ph-credit-card"
        unit="장"
        exportFileName="법인카드"
      />
    </Workspace>
  );
}
