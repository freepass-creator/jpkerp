'use client';

import { useEffect, useMemo, useRef, type Ref, type RefObject } from 'react';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import { KpiCard } from '@/components/shared/kpi-card';
import { JpkGrid, type JpkGridApi } from '@/components/shared/jpk-grid';
import { typedColumn } from '@/lib/grid/typed-column';
import { computeTotalDue, today } from '@/lib/date-utils';
import type { RtdbBilling, RtdbEvent } from '@/lib/types/rtdb-entities';
import { fmt } from '@/lib/utils';
import type { ColDef } from 'ag-grid-community';

export interface MonthlyRow {
  month: string;
  revenue: number;
  expense: number;
  profit: number;
  tx_count: number;
}

interface Props {
  gridRef?: RefObject<JpkGridApi<MonthlyRow> | null>;
  onCountChange?: (count: number) => void;
}

export function FinanceClient({ gridRef: externalRef, onCountChange }: Props = {}) {
  const internalRef = useRef<JpkGridApi<MonthlyRow> | null>(null);
  const gridRef = externalRef ?? internalRef;
  const billings = useRtdbCollection<RtdbBilling>('billings');
  const events = useRtdbCollection<RtdbEvent>('events');

  const byMonth = useMemo<MonthlyRow[]>(() => {
    const map = new Map<string, MonthlyRow>();

    // 매출 — billings.paid_total (실제 수납)
    for (const b of billings.data) {
      if (b.status === 'deleted') continue;
      const paid = Number(b.paid_total) || 0;
      if (!paid || !b.due_date) continue;
      const mo = b.due_date.slice(0, 7);
      let row = map.get(mo);
      if (!row) { row = { month: mo, revenue: 0, expense: 0, profit: 0, tx_count: 0 }; map.set(mo, row); }
      row.revenue += paid;
    }

    // 지출 — events 정비/사고/세차/주유/과태료/탁송
    const EXPENSE_TYPES = ['maint', 'maintenance', 'repair', 'accident', 'wash', 'fuel', 'penalty', 'delivery'];
    for (const e of events.data) {
      if (e.status === 'deleted') continue;
      if (!e.type || !EXPENSE_TYPES.includes(e.type)) continue;
      const amt = Number(e.amount) || 0;
      if (!amt || !e.date) continue;
      const mo = e.date.slice(0, 7);
      let row = map.get(mo);
      if (!row) { row = { month: mo, revenue: 0, expense: 0, profit: 0, tx_count: 0 }; map.set(mo, row); }
      row.expense += amt;
      row.tx_count++;
    }

    for (const row of map.values()) row.profit = row.revenue - row.expense;
    return [...map.values()].sort((a, b) => b.month.localeCompare(a.month));
  }, [billings.data, events.data]);

  useEffect(() => { onCountChange?.(byMonth.length); }, [byMonth.length, onCountChange]);

  const totals = useMemo(() => {
    const t = today().slice(0, 7);
    const mo = byMonth.find((r) => r.month === t) ?? { month: t, revenue: 0, expense: 0, profit: 0, tx_count: 0 };
    const year = t.slice(0, 4);
    const yearRows = byMonth.filter((r) => r.month.startsWith(year));
    const yearRevenue = yearRows.reduce((s, r) => s + r.revenue, 0);
    const yearExpense = yearRows.reduce((s, r) => s + r.expense, 0);
    // 미수금 = 결제일 지난 미납만 (결제대기는 제외)
    const tDay = today();
    let outstanding = 0;
    let pending = 0;
    for (const b of billings.data) {
      if (b.status === 'deleted') continue;
      const due = computeTotalDue(b);
      const paid = Number(b.paid_total) || 0;
      if (paid >= due) continue;
      if (!b.due_date) continue;
      if (b.due_date < tDay) outstanding += due - paid;
      else pending += due - paid;
    }
    return { mo, yearRevenue, yearExpense, yearProfit: yearRevenue - yearExpense, outstanding, pending };
  }, [byMonth, billings.data]);

  const cols = useMemo<ColDef<MonthlyRow>[]>(
    () => [
      typedColumn('text',   { headerName: '월', field: 'month', width: 110, sort: 'desc', cellStyle: { fontWeight: '600' } }),
      typedColumn('number', { headerName: '매출(수납)', field: 'revenue', width: 150, valueFormatter: (p) => fmt(Number(p.value)), cellStyle: { textAlign: 'right', color: 'var(--c-success)', fontWeight: '600', fontVariantNumeric: 'tabular-nums' } }),
      typedColumn('number', { headerName: '지출', field: 'expense', width: 140, valueFormatter: (p) => fmt(Number(p.value)), cellStyle: { textAlign: 'right', color: 'var(--c-danger)', fontVariantNumeric: 'tabular-nums' } }),
      typedColumn('number', {
        headerName: '순익',
        field: 'profit',
        width: 160,
        valueFormatter: (p) => `${Number(p.value) >= 0 ? '+' : ''}${fmt(Number(p.value))}`,
        cellStyle: (p) => ({
          textAlign: 'right',
          fontWeight: '700',
          fontVariantNumeric: 'tabular-nums',
          color: Number(p.value) > 0 ? 'var(--c-success)' : Number(p.value) < 0 ? 'var(--c-danger)' : 'var(--c-text-muted)',
        }),
      }),
      typedColumn('number', { headerName: '지출 건수', field: 'tx_count', width: 100, valueFormatter: (p) => (p.value ? `${p.value}건` : '-') }),
    ],
    [],
  );

  if (billings.loading || events.loading) {
    return (
      <div className="flex items-center justify-center gap-2 text-text-muted" style={{ height: '100%', minHeight: 200 }}>
        <i className="ph ph-spinner spin" /> 로드 중...
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <div className="grid grid-cols-4 gap-3 p-4 border-b border-border">
        <KpiCard label={`${totals.mo.month} 매출`} value={`${fmt(totals.mo.revenue)}원`} tone="success" />
        <KpiCard label="YTD 매출" value={`${fmt(totals.yearRevenue)}원`} />
        <KpiCard label="YTD 순익" value={`${totals.yearProfit >= 0 ? '+' : ''}${fmt(totals.yearProfit)}원`} tone={totals.yearProfit >= 0 ? 'primary' : 'danger'} />
        <KpiCard label="미수금" value={`${fmt(totals.outstanding)}원`} tone="warn" />
      </div>
      <div className="flex-1 min-h-0">
        <JpkGrid<MonthlyRow>
          ref={gridRef as Ref<JpkGridApi<MonthlyRow>>}
          columnDefs={cols}
          rowData={byMonth}
          getRowId={(d) => d.month}
          storageKey="jpk.grid.finance"
        />
      </div>
    </div>
  );
}
