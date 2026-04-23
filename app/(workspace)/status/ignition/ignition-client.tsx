'use client';

import { useEffect, useMemo, useRef, type Ref, type RefObject } from 'react';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import { JpkGrid, type JpkGridApi } from '@/components/shared/jpk-grid';
import { JpkSetFilter } from '@/lib/grid/set-filter';
import { rowNumColumn } from '@/lib/grid/typed-column';
import { computeTotalDue, today, daysBetween } from '@/lib/date-utils';
import type { RtdbBilling, RtdbContract } from '@/lib/types/rtdb-entities';
import { fmt } from '@/lib/utils';
import type { ColDef } from 'ag-grid-community';

export interface IgRow {
  partner_code: string;
  car_number: string;
  contractor_name: string;
  contractor_phone: string;
  action_status: string;
  unpaid_count: number;
  unpaid_sum: number;
  max_overdue_days: number;
  contract_code: string;
}

const ACTION_STEPS = ['시동제어', '제어해제'];
const ACTION_COLOR: Record<string, string> = {
  시동제어: '#ea580c',
  제어해제: 'var(--c-success)',
};

interface Props {
  gridRef?: RefObject<JpkGridApi<IgRow> | null>;
  onCountChange?: (count: number) => void;
}

export function IgnitionClient({ gridRef: externalRef, onCountChange }: Props = {}) {
  const internalRef = useRef<JpkGridApi<IgRow> | null>(null);
  const gridRef = externalRef ?? internalRef;
  const contracts = useRtdbCollection<RtdbContract>('contracts');
  const billings = useRtdbCollection<RtdbBilling>('billings');

  const rows = useMemo<IgRow[]>(() => {
    const t = today();
    return contracts.data
      .filter(
        (c) => c.status !== 'deleted' && c.action_status && ACTION_STEPS.includes(c.action_status),
      )
      .map((c) => {
        const carBills = billings.data.filter(
          (b) => b.contract_code === c.contract_code && b.status !== 'deleted',
        );
        let unpaid_count = 0;
        let unpaid_sum = 0;
        let max_overdue = 0;
        for (const b of carBills) {
          const due = computeTotalDue(b);
          const paid = Number(b.paid_total) || 0;
          if (paid < due) {
            unpaid_count++;
            unpaid_sum += due - paid;
            if (b.due_date && b.due_date < t) {
              const od = daysBetween(b.due_date, t);
              if (od > max_overdue) max_overdue = od;
            }
          }
        }
        return {
          partner_code: c.partner_code ?? '-',
          car_number: c.car_number ?? '-',
          contractor_name: c.contractor_name ?? '-',
          contractor_phone: c.contractor_phone ?? '-',
          action_status: c.action_status ?? '',
          unpaid_count,
          unpaid_sum,
          max_overdue_days: max_overdue,
          contract_code: c.contract_code ?? '',
        };
      })
      .sort((a, b) => b.max_overdue_days - a.max_overdue_days);
  }, [contracts.data, billings.data]);

  const columnDefs = useMemo<ColDef<IgRow>[]>(
    () =>
      [
        rowNumColumn<IgRow>(),
        { headerName: '회사코드', field: 'partner_code', width: 75, filter: JpkSetFilter },
        { headerName: '차량번호', field: 'car_number', width: 95, cellStyle: { fontWeight: '600' } },
        { headerName: '계약자', field: 'contractor_name', width: 85 },
        { headerName: '연락처', field: 'contractor_phone', width: 115 },
        {
          headerName: '조치상태',
          field: 'action_status',
          width: 95,
          filter: JpkSetFilter,
          cellStyle: (p: { value: unknown }) => ({ color: ACTION_COLOR[p.value as string] ?? 'var(--c-text)', fontWeight: '600' }),
        },
        { headerName: '미납', field: 'unpaid_count', width: 60, filter: false, cellStyle: (p: { value: unknown }) => ({ textAlign: 'right', color: Number(p.value) ? 'var(--c-danger)' : 'var(--c-text-muted)', fontWeight: '600' }), valueFormatter: (p: { value: unknown }) => (p.value ? `${p.value}회` : '-') },
        { headerName: '미납액', field: 'unpaid_sum', width: 110, filter: false, cellStyle: { textAlign: 'right', color: 'var(--c-danger)' }, valueFormatter: (p: { value: unknown }) => fmt(Number(p.value)) },
        {
          headerName: '연체일',
          field: 'max_overdue_days',
          width: 75,
          filter: false,
          sort: 'desc',
          cellStyle: (p: { value: unknown }) => {
            const v = Number(p.value);
            return {
              textAlign: 'right',
              fontWeight: '600',
              color: v >= 60 ? '#7f1d1d' : v >= 30 ? 'var(--c-danger)' : v > 0 ? 'var(--c-warn)' : 'var(--c-text-muted)',
            };
          },
          valueFormatter: (p: { value: unknown }) => (p.value ? `${p.value}일` : '-'),
        },
      ] as ColDef<IgRow>[],
    [],
  );

  useEffect(() => { onCountChange?.(rows.length); }, [rows.length, onCountChange]);

  return (
    <JpkGrid<IgRow>
      ref={gridRef as Ref<JpkGridApi<IgRow>>}
      columnDefs={columnDefs}
      rowData={rows}
      getRowId={(d) => d.contract_code || d.car_number}
      storageKey="jpk.grid.status.ignition"
    />
  );
}
