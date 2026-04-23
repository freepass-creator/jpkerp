'use client';

import { useEffect, useMemo, useRef, type Ref, type RefObject } from 'react';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import { JpkGrid, type JpkGridApi } from '@/components/shared/jpk-grid';
import { JpkSetFilter } from '@/lib/grid/set-filter';
import { rowNumColumn } from '@/lib/grid/typed-column';
import { computeTotalDue, today, daysBetween } from '@/lib/date-utils';
import type { RtdbBilling, RtdbContract, RtdbEvent } from '@/lib/types/rtdb-entities';
import { fmt, fmtDate } from '@/lib/utils';
import type { ColDef } from 'ag-grid-community';

export interface OverdueRow {
  key: string;
  contract_code?: string;
  contractor_name: string;
  contractor_phone: string;
  car_number: string;
  partner_code: string;
  unpaid_total: number;
  bill_count: number;
  max_days: number;
  earliest_due: string;
  sms_count: number;
  call_count: number;
  legal_count: number;
  last_action: string;
  last_result: string;
  last_action_date: string;
  promise_date: string;
}

interface Props {
  gridRef?: RefObject<JpkGridApi<OverdueRow> | null>;
  onCountChange?: (count: number) => void;
}

export function OverdueClient({ gridRef: externalRef, onCountChange }: Props = {}) {
  const internalRef = useRef<JpkGridApi<OverdueRow> | null>(null);
  const gridRef = externalRef ?? internalRef;
  const contracts = useRtdbCollection<RtdbContract>('contracts');
  const billings = useRtdbCollection<RtdbBilling>('billings');
  const events = useRtdbCollection<RtdbEvent>('events');

  const rows = useMemo<OverdueRow[]>(() => {
    const t = today();
    const byKey = new Map<string, OverdueRow>();

    for (const b of billings.data) {
      const due = computeTotalDue(b);
      const paid = Number(b.paid_total) || 0;
      if (paid >= due) continue;
      if (!b.due_date || b.due_date >= t) continue;
      const c = contracts.data.find((x) => x.contract_code === b.contract_code) ?? {};
      const key = b.contract_code ?? `${c.contractor_name ?? '-'}|${c.car_number ?? '-'}`;
      let row = byKey.get(key);
      if (!row) {
        row = {
          key,
          contract_code: b.contract_code,
          contractor_name: c.contractor_name ?? '-',
          contractor_phone: c.contractor_phone ?? '',
          car_number: c.car_number ?? (b.car_number as string) ?? '-',
          partner_code: c.partner_code ?? '',
          unpaid_total: 0,
          bill_count: 0,
          max_days: 0,
          earliest_due: '',
          sms_count: 0,
          call_count: 0,
          legal_count: 0,
          last_action: '-',
          last_result: '',
          last_action_date: '',
          promise_date: '',
        };
        byKey.set(key, row);
      }
      const days = daysBetween(b.due_date, t);
      row.unpaid_total += due - paid;
      row.bill_count += 1;
      if (days > row.max_days) row.max_days = days;
      if (!row.earliest_due || b.due_date < row.earliest_due) row.earliest_due = b.due_date;
    }

    // 조치 이력 집계
    for (const row of byKey.values()) {
      const my = events.data.filter(
        (e) =>
          e.type === 'collect' &&
          (e.contract_code === row.contract_code || e.car_number === row.car_number),
      );
      row.sms_count = my.filter((e) => /문자|알림톡|SMS/i.test((e.memo as string) ?? '')).length;
      row.call_count = my.filter((e) => /전화|통화/i.test((e.memo as string) ?? '')).length;
      row.legal_count = my.filter((e) => /내용증명|법적/i.test((e.memo as string) ?? '')).length;
      const latest = [...my].sort((a, b) =>
        String(b.date ?? '').localeCompare(String(a.date ?? '')),
      )[0];
      if (latest) {
        row.last_action = (latest.memo as string) ?? '';
        row.last_result = latest.collect_result ?? '';
        row.last_action_date = latest.date ?? '';
      }
    }

    return [...byKey.values()].sort((a, b) => b.max_days - a.max_days);
  }, [contracts.data, billings.data, events.data]);

  const columnDefs = useMemo<ColDef<OverdueRow>[]>(
    () =>
      [
        rowNumColumn<OverdueRow>(),
        { headerName: '계약자', field: 'contractor_name', width: 90 },
        { headerName: '연락처', field: 'contractor_phone', width: 115 },
        { headerName: '차량', field: 'car_number', width: 95, filter: JpkSetFilter },
        { headerName: '회원사', field: 'partner_code', width: 65, filter: JpkSetFilter },
        { headerName: '회차', field: 'bill_count', width: 55, filter: false, cellStyle: { textAlign: 'right' }, valueFormatter: (p: { value: unknown }) => (p.value ? `${p.value}` : '') },
        { headerName: '미납액', field: 'unpaid_total', width: 110, filter: false, cellStyle: { textAlign: 'right', color: 'var(--c-danger)', fontWeight: '600' }, valueFormatter: (p: { value: unknown }) => fmt(Number(p.value)) },
        {
          headerName: '최장 연체',
          field: 'max_days',
          width: 85,
          filter: false,
          cellStyle: (p: { value: unknown }) => {
            const v = Number(p.value);
            return {
              textAlign: 'right',
              fontWeight: '600',
              color: v >= 30 ? '#991b1b' : v >= 14 ? 'var(--c-danger)' : v >= 7 ? 'var(--c-warn)' : 'var(--c-text-sub)',
            };
          },
          valueFormatter: (p: { value: unknown }) => (p.value ? `${p.value}일` : ''),
        },
        { headerName: '문자', field: 'sms_count', width: 55, filter: false, cellStyle: { textAlign: 'right', color: 'var(--c-text-sub)' }, valueFormatter: (p: { value: unknown }) => (p.value ? `${p.value}회` : '') },
        { headerName: '전화', field: 'call_count', width: 55, filter: false, cellStyle: { textAlign: 'right', color: 'var(--c-text-sub)' }, valueFormatter: (p: { value: unknown }) => (p.value ? `${p.value}회` : '') },
        { headerName: '법적조치', field: 'legal_count', width: 75, filter: false, cellStyle: (p: { value: unknown }) => ({ textAlign: 'right', color: Number(p.value) ? '#991b1b' : 'var(--c-text-muted)', fontWeight: Number(p.value) ? '600' : '400' }), valueFormatter: (p: { value: unknown }) => (p.value ? `${p.value}회` : '') },
        { headerName: '최근 조치', field: 'last_action', width: 120 },
        { headerName: '결과', field: 'last_result', width: 100, filter: JpkSetFilter, cellStyle: (p: { value: unknown }) => {
          const v = p.value as string;
          if (v === '납부약속') return { color: 'var(--c-warn)', fontWeight: '600' };
          if (v === '즉시납부') return { color: 'var(--c-success)' };
          if (v === '연락불가' || v === '거부') return { color: 'var(--c-danger)' };
          return {};
        } },
        { headerName: '조치일', field: 'last_action_date', width: 85, valueFormatter: (p: { value: unknown }) => fmtDate(p.value as string) },
      ] as ColDef<OverdueRow>[],
    [],
  );

  useEffect(() => { onCountChange?.(rows.length); }, [rows.length, onCountChange]);

  if (billings.loading || contracts.loading) {
    return (
      <div className="flex items-center justify-center gap-2 text-text-muted" style={{ height: '100%', minHeight: 200 }}>
        <i className="ph ph-spinner spin" /> 로드 중...
      </div>
    );
  }

  return (
    <JpkGrid<OverdueRow>
      ref={gridRef as Ref<JpkGridApi<OverdueRow>>}
      columnDefs={columnDefs}
      rowData={rows}
      getRowId={(d) => d.key}
      storageKey="jpk.grid.status.overdue"
    />
  );
}
