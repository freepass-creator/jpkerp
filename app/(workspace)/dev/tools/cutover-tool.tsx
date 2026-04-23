'use client';

import { useMemo } from 'react';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import { JpkGrid } from '@/components/shared/jpk-grid';
import { typedColumn, rowNumColumn, MONO_CELL_STYLE } from '@/lib/grid/typed-column';
import type { RtdbBilling, RtdbEvent, RtdbContract } from '@/lib/types/rtdb-entities';
import type { ColDef } from 'ag-grid-community';
import { fmt } from '@/lib/utils';
import { computeTotalDue } from '@/lib/date-utils';

interface CutoverRow {
  key: string;
  contract_code: string;
  car_number: string;
  partner_code: string;
  billing_count: number;
  billing_due: number;
  billing_paid: number;
  event_paid: number;
  diff: number;
  status: string;
}

/** 계약별 billing 합계 vs 입금 이벤트 합계 매칭 검증 */
export function CutoverTool() {
  const billings = useRtdbCollection<RtdbBilling>('billings');
  const contracts = useRtdbCollection<RtdbContract>('contracts');
  const events = useRtdbCollection<RtdbEvent>('events');

  const rows = useMemo<CutoverRow[]>(() => {
    const byCode = new Map(contracts.data.filter((c) => c.contract_code).map((c) => [c.contract_code!, c]));
    const billAgg = new Map<string, { count: number; due: number; paid: number }>();
    for (const b of billings.data) {
      if (b.status === 'deleted' || !b.contract_code) continue;
      const cur = billAgg.get(b.contract_code) ?? { count: 0, due: 0, paid: 0 };
      cur.count++;
      cur.due += computeTotalDue(b);
      cur.paid += Number(b.paid_total) || 0;
      billAgg.set(b.contract_code, cur);
    }
    const eventAgg = new Map<string, number>();
    for (const e of events.data) {
      if (e.status === 'deleted' || !e.contract_code) continue;
      if (e.type !== 'bank_tx' && e.type !== 'card_tx') continue;
      const amt = Number((e as { amount?: number }).amount) || 0;
      if (amt <= 0) continue;
      eventAgg.set(e.contract_code, (eventAgg.get(e.contract_code) ?? 0) + amt);
    }

    const out: CutoverRow[] = [];
    for (const [code, agg] of billAgg) {
      const c = byCode.get(code);
      const ePaid = eventAgg.get(code) ?? 0;
      const diff = agg.paid - ePaid;
      let status = '일치';
      if (Math.abs(diff) > 100) status = diff > 0 ? '이벤트 부족' : '이벤트 초과';
      out.push({
        key: code,
        contract_code: code,
        car_number: c?.car_number ?? '',
        partner_code: c?.partner_code ?? '',
        billing_count: agg.count,
        billing_due: agg.due,
        billing_paid: agg.paid,
        event_paid: ePaid,
        diff,
        status,
      });
    }
    return out.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  }, [billings.data, contracts.data, events.data]);

  const cols = useMemo<ColDef<CutoverRow>[]>(() => [
    rowNumColumn(),
    typedColumn('text', { headerName: '계약코드', field: 'contract_code', width: 130, cellStyle: MONO_CELL_STYLE }),
    typedColumn('text', { headerName: '차량번호', field: 'car_number', width: 100, cellStyle: { fontWeight: '600' } }),
    typedColumn('text', { headerName: '회원사', field: 'partner_code', width: 80, cellStyle: MONO_CELL_STYLE }),
    typedColumn('number', { headerName: '회차', field: 'billing_count', width: 60, valueFormatter: (p) => `${p.value}` }),
    typedColumn('number', { headerName: '청구 합계', field: 'billing_due', width: 110, valueFormatter: (p) => fmt(Number(p.value)) }),
    typedColumn('number', { headerName: '수납 합계', field: 'billing_paid', width: 110, valueFormatter: (p) => fmt(Number(p.value)) }),
    typedColumn('number', { headerName: '이벤트 합계', field: 'event_paid', width: 110, valueFormatter: (p) => fmt(Number(p.value)) }),
    typedColumn('number', {
      headerName: '차이',
      field: 'diff',
      width: 110,
      valueFormatter: (p) => fmt(Number(p.value)),
      cellStyle: (p: { value: unknown }) => {
        const v = Number(p.value);
        if (Math.abs(v) <= 100) return { color: 'var(--c-success)' };
        return { color: 'var(--c-danger)', fontWeight: '600' };
      },
    }),
    typedColumn('select', {
      headerName: '상태', field: 'status', width: 100,
      cellStyle: (p: { value: unknown }) => p.value === '일치' ? { color: 'var(--c-success)', fontWeight: 600 } : { color: 'var(--c-warn)', fontWeight: 600 },
    }),
  ], []);

  const loading = billings.loading || contracts.loading || events.loading;
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 text-text-muted" style={{ height: '100%', minHeight: 200 }}>
        <i className="ph ph-spinner spin" /> 로드 중...
      </div>
    );
  }

  const mismatch = rows.filter((r) => r.status !== '일치').length;

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <div className="text-base" style={{ padding: '10px 14px', borderBottom: '1px solid var(--c-border)' }}>
        <i className="ph ph-currency-krw" style={{ marginRight: 4 }} />
        전체 <b>{fmt(rows.length)}</b>건 ·
        <span className="text-text-muted"> 불일치 </span>
        <b style={{ color: mismatch > 0 ? 'var(--c-danger)' : 'var(--c-success)' }}>{fmt(mismatch)}</b>
      </div>
      <div className="flex-1 min-h-0">
        <JpkGrid<CutoverRow>
          columnDefs={cols}
          rowData={rows}
          getRowId={(d) => d.key}
          storageKey="jpk.grid.dev.cutover"
        />
      </div>
    </div>
  );
}
