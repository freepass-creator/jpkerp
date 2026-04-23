'use client';

import { useEffect, useMemo, useRef, useState, type Ref, type RefObject } from 'react';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import { JpkGrid, type JpkGridApi } from '@/components/shared/jpk-grid';
import { typedColumn, rowNumColumn } from '@/lib/grid/typed-column';
import { KpiCard } from '@/components/shared/kpi-card';
import type { RtdbEvent } from '@/lib/types/rtdb-entities';
import { fmt, fmtDate } from '@/lib/utils';
import type { ColDef } from 'ag-grid-community';

type Tab = 'all' | 'bank' | 'card';

interface Props {
  gridRef?: RefObject<JpkGridApi<RtdbEvent> | null>;
  onCountChange?: (count: number) => void;
}

export function LedgerClient({ gridRef: externalRef, onCountChange }: Props = {}) {
  const internalRef = useRef<JpkGridApi<RtdbEvent> | null>(null);
  const gridRef = externalRef ?? internalRef;
  const events = useRtdbCollection<RtdbEvent>('events');
  const [tab, setTab] = useState<Tab>('all');

  const rows = useMemo(() => {
    let data = events.data.filter((e) => (e.type === 'bank_tx' || e.type === 'card_tx') && e.status !== 'deleted');
    if (tab === 'bank') data = data.filter((e) => e.type === 'bank_tx');
    else if (tab === 'card') data = data.filter((e) => e.type === 'card_tx');
    return data.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
  }, [events.data, tab]);

  useEffect(() => { onCountChange?.(rows.length); }, [rows.length, onCountChange]);

  const summary = useMemo(() => {
    let inflow = 0;
    let outflow = 0;
    let unmatched = 0;
    for (const e of rows) {
      const amt = Number(e.amount) || 0;
      if (amt > 0) inflow += amt;
      else outflow += -amt;
      if (e.match_status !== 'matched') unmatched++;
    }
    return { inflow, outflow, unmatched, total: rows.length };
  }, [rows]);

  const cols = useMemo<ColDef<RtdbEvent>[]>(
    () => [
      rowNumColumn(),
      typedColumn('date',   { headerName: '일자', field: 'date', width: 100, valueFormatter: (p) => fmtDate(p.value as string), sort: 'desc' }),
      typedColumn('select', {
        headerName: '유형',
        field: 'type',
        width: 75,
        cellStyle: (p) => ({ fontWeight: '600', color: p.value === 'bank_tx' ? 'var(--c-info)' : 'var(--c-primary)' }),
        valueFormatter: (p) => (p.value === 'bank_tx' ? '통장' : p.value === 'card_tx' ? '카드' : '-'),
      }),
      typedColumn('text',   { headerName: '거래처', field: 'title', flex: 1, minWidth: 200 }),
      typedColumn('number', {
        headerName: '금액',
        field: 'amount',
        width: 130,
        valueFormatter: (p) => (p.value ? fmt(Number(p.value)) : '-'),
        cellStyle: (p) => ({
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
          fontWeight: '600',
          color: Number(p.value) > 0 ? 'var(--c-success)' : Number(p.value) < 0 ? 'var(--c-danger)' : 'var(--c-text-muted)',
        }),
      }),
      typedColumn('select', {
        headerName: '매칭',
        field: 'match_status',
        width: 95,
        cellStyle: (p) => {
          const v = p.value as string;
          const color = v === 'matched' ? 'var(--c-success)'
            : v === 'candidate' ? 'var(--c-primary)'
            : v === 'ignored' ? 'var(--c-text-muted)'
            : 'var(--c-warn)';
          return { color, fontWeight: '600' };
        },
        valueFormatter: (p) => {
          const v = p.value as string;
          return v === 'matched' ? '매칭완료' : v === 'candidate' ? '후보제안' : v === 'ignored' ? '무시' : '미매칭';
        },
      }),
      typedColumn('text', { headerName: '메모', field: 'memo', flex: 1, minWidth: 160, cellStyle: { color: 'var(--c-text-muted)' } }),
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
      <div className="grid grid-cols-4 gap-3 p-4 border-b border-border">
        <KpiCard label="입금" value={`${fmt(summary.inflow)}원`} tone="success" />
        <KpiCard label="출금" value={`${fmt(summary.outflow)}원`} tone="danger" />
        <KpiCard label="순 입금" value={`${summary.inflow - summary.outflow >= 0 ? '+' : ''}${fmt(summary.inflow - summary.outflow)}원`} tone="primary" />
        <KpiCard label="미매칭" value={`${fmt(summary.unmatched)}건`} tone="warn" />
      </div>
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border">
        {(['all', 'bank', 'card'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            className={`btn btn-sm ${tab === t ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTab(t)}
          >
            {t === 'all' ? '전체' : t === 'bank' ? '통장' : '카드'}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        <JpkGrid<RtdbEvent>
          ref={gridRef as Ref<JpkGridApi<RtdbEvent>>}
          columnDefs={cols}
          rowData={rows}
          getRowId={(d) => d._key ?? ''}
          storageKey="jpk.grid.ledger"
        />
      </div>
    </div>
  );
}
