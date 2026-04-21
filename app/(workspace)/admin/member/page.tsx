'use client';

import Link from 'next/link';
import { Workspace } from '@/components/shared/panel';
import { SimpleRtdbGrid } from '@/components/shared/simple-rtdb-grid';
import { typedColumn } from '@/lib/grid/typed-column';
import type { ColDef } from 'ag-grid-community';

const cols: ColDef[] = [
  typedColumn('action', { headerName: '#', valueGetter: (p) => (p.node?.rowIndex ?? 0) + 1, width: 45, cellStyle: { color: 'var(--c-text-muted)' } }),
  typedColumn('text',   { headerName: '회원사코드', field: 'partner_code', width: 100, cellStyle: { fontWeight: '600', fontFamily: 'var(--font-mono)', fontSize: 11 } }),
  typedColumn('text',   { headerName: '회원사명', field: 'partner_name', width: 160 }),
  typedColumn('text',   { headerName: '대표자', field: 'ceo', width: 80 }),
  typedColumn('text',   { headerName: '사업자번호', field: 'biz_no', width: 120 }),
  typedColumn('text',   { headerName: '전화', field: 'phone', width: 115 }),
  typedColumn('text',   { headerName: '담당자', field: 'contact_name', width: 80 }),
  typedColumn('text',   { headerName: '담당연락처', field: 'contact_phone', width: 115 }),
  typedColumn('text',   { headerName: '주소', field: 'address', flex: 1, minWidth: 180 }),
  typedColumn('select', { headerName: '상태', field: 'status', width: 75 }),
];

export default function Page() {
  return (
    <Workspace layout="layout-1">
      <SimpleRtdbGrid
        path="partners"
        columnDefs={cols}
        storageKey="jpk.grid.admin.member"
        title="회원사 관리"
        subtitle="운영사 · 관리코드"
        icon="ph-buildings"
        unit="개사"
        exportFileName="회원사"
        primaryActions={
          <Link href="/input?type=partner" className="btn btn-sm btn-primary" style={{ textDecoration: 'none' }}>
            <i className="ph ph-plus" />새 회원사
          </Link>
        }
      />
    </Workspace>
  );
}
