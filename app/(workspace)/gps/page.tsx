'use client';

import Link from 'next/link';
import { Workspace } from '@/components/shared/panel';
import { SimpleRtdbGrid } from '@/components/shared/simple-rtdb-grid';
import { typedColumn, rowNumColumn, MONO_CELL_STYLE } from '@/lib/grid/typed-column';
import { fmtDate } from '@/lib/utils';
import type { ColDef } from 'ag-grid-community';
import type { RtdbGpsDevice } from '@/lib/types/rtdb-entities';

const cols: ColDef<RtdbGpsDevice>[] = [
  rowNumColumn<RtdbGpsDevice>(),
  typedColumn('text',   { headerName: '차량번호', field: 'car_number', width: 100, cellStyle: { fontWeight: '600' } }),
  typedColumn('text',   { headerName: '회원사', field: 'partner_code', width: 85, cellStyle: MONO_CELL_STYLE }),
  typedColumn('select', { headerName: '상태', field: 'gps_status', width: 80 }),
  typedColumn('select', { headerName: '제조사', field: 'gps_company', width: 110 }),
  typedColumn('text',   { headerName: '시리얼번호', field: 'gps_serial', width: 160, cellStyle: MONO_CELL_STYLE }),
  typedColumn('date',   { headerName: '장착일', field: 'gps_install_date', width: 100, valueFormatter: (p) => fmtDate(p.value as string) }),
  typedColumn('date',   { headerName: '해제일', field: 'gps_uninstall_date', width: 100, valueFormatter: (p) => fmtDate(p.value as string) }),
  typedColumn('text',   { headerName: '장착 위치', field: 'gps_location', width: 130 }),
  typedColumn('text',   { headerName: '비고', field: 'gps_note', flex: 1, minWidth: 160 }),
];

export default function Page() {
  return (
    <Workspace layout="layout-1">
      <SimpleRtdbGrid<RtdbGpsDevice>
        path="gps_devices"
        columnDefs={cols}
        storageKey="jpk.grid.gps"
        title="GPS 장착"
        subtitle="GPS 장착·해제 이력"
        icon="ph-navigation-arrow"
        unit="건"
        exportFileName="GPS"
        primaryActions={
          <Link href="/input?type=gps" className="btn btn-sm btn-primary" style={{ textDecoration: 'none' }}>
            <i className="ph ph-plus" />새 장착
          </Link>
        }
      />
    </Workspace>
  );
}
