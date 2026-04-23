'use client';

import { useMemo, useState } from 'react';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import { JpkGrid } from '@/components/shared/jpk-grid';
import { typedColumn, rowNumColumn } from '@/lib/grid/typed-column';
import { EVENT_META, metaFor } from '@/lib/event-meta';
import type { RtdbEvent } from '@/lib/types/rtdb-entities';
import { fmt, fmtDate } from '@/lib/utils';
import type { ColDef } from 'ag-grid-community';

const TYPE_GROUPS: Array<{ key: string; label: string; types: string[] }> = [
  { key: 'all', label: '전체', types: [] },
  { key: 'contact', label: '응대', types: ['contact'] },
  { key: 'delivery', label: '출고/반납', types: ['delivery', 'return', 'force', 'transfer'] },
  { key: 'maint', label: '정비·수리', types: ['maint', 'maintenance', 'repair'] },
  { key: 'accident', label: '사고', types: ['accident'] },
  { key: 'wash', label: '세차·주유', types: ['wash', 'fuel'] },
  { key: 'penalty', label: '과태료', types: ['penalty'] },
  { key: 'product', label: '상품화', types: ['product'] },
  { key: 'insurance', label: '보험', types: ['insurance'] },
  { key: 'collect', label: '미수조치', types: ['collect'] },
  { key: 'tx', label: '통장·카드', types: ['bank_tx', 'card_tx'] },
];

interface Props {
  /** 고정 타입 (서브 경로에서 사용). 없으면 전체 + 탭 노출 */
  lockedTypes?: string[];
  title?: string;
  /** 행 클릭 콜백 (2패널 detail 연동) */
  onRowClick?: (row: RtdbEvent) => void;
  /** 선택된 이벤트 key (하이라이트용) */
  selectedKey?: string | null;
}

export function OperationHistoryClient({ lockedTypes, onRowClick }: Props) {
  const events = useRtdbCollection<RtdbEvent>('events');
  const [filter, setFilter] = useState<string>(lockedTypes ? '__locked__' : 'all');

  const filtered = useMemo(() => {
    if (lockedTypes?.length) {
      return events.data.filter((e) => e.type && lockedTypes.includes(e.type));
    }
    const group = TYPE_GROUPS.find((g) => g.key === filter);
    if (!group || group.key === 'all') return events.data;
    return events.data.filter((e) => e.type && group.types.includes(e.type));
  }, [events.data, filter, lockedTypes]);

  const rows = useMemo(
    () =>
      filtered
        .filter((e) => e.status !== 'deleted')
        .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? ''))),
    [filtered],
  );

  const cols = useMemo<ColDef<RtdbEvent>[]>(
    () => [
      rowNumColumn(),
      typedColumn('date',   { headerName: '일자', field: 'date', width: 100, valueFormatter: (p) => fmtDate(p.value as string), sort: 'desc' }),
      typedColumn('select', {
        headerName: '유형',
        field: 'type',
        width: 85,
        cellRenderer: (p: { value: unknown }) => {
          const meta = metaFor(p.value as string);
          return `<span style="display:inline-flex;align-items:center;gap:4px"><i class="ph ${meta.icon}" style="color:${meta.color};font-size:13px"></i>${meta.label}</span>`;
        },
      }),
      typedColumn('text',   { headerName: '차량번호', field: 'car_number', width: 100, cellStyle: { fontWeight: '600' } }),
      typedColumn('text',   { headerName: '제목', field: 'title', flex: 1, minWidth: 180 }),
      typedColumn('number', { headerName: '금액', field: 'amount', width: 110, valueFormatter: (p) => (p.value ? fmt(Number(p.value)) : '-') }),
      typedColumn('select', { headerName: '업체', field: 'vendor', width: 120 }),
      typedColumn('text',   { headerName: '장소', field: 'to_location', width: 130 }),
      typedColumn('select', { headerName: '담당자', field: 'handler', width: 90 }),
      typedColumn('text',   { headerName: '메모', field: 'memo', flex: 1, minWidth: 160, cellStyle: { color: 'var(--c-text-muted)' } }),
    ],
    [],
  );

  if (events.loading) {
    return (
      <div className="flex items-center justify-center gap-2 text-text-muted" style={{ height: '100%', minHeight: 200 }}>
        <i className="ph ph-spinner spin" /> 로드 중...
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      {!lockedTypes && (
        <div className="flex items-center gap-1 px-4 py-2 border-b border-border overflow-x-auto scrollbar-thin">
          {TYPE_GROUPS.map((g) => (
            <button
              key={g.key}
              type="button"
              className={`btn btn-sm ${filter === g.key ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilter(g.key)}
            >
              {g.label}
              {g.key !== 'all' && (
                <span className="ml-1 text-text-muted text-[10px] num">
                  {events.data.filter((e) => e.type && g.types.includes(e.type) && e.status !== 'deleted').length}
                </span>
              )}
            </button>
          ))}
          <span className="ml-auto text-xs text-text-muted num">{rows.length}건</span>
        </div>
      )}
      <div className="flex-1 min-h-0">
        <JpkGrid<RtdbEvent>
          columnDefs={cols}
          rowData={rows}
          getRowId={(d) => d._key ?? `${d.date}-${d.car_number}-${d.type}`}
          storageKey="jpk.grid.operation"
          onRowClicked={onRowClick}
        />
      </div>
    </div>
  );
}
