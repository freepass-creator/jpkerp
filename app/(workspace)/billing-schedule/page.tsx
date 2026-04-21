'use client';

import { useMemo, useState } from 'react';
import { Workspace } from '@/components/shared/panel';
import { GridPanel } from '@/components/shared/grid-panel';
import { JpkGrid, type JpkGridApi } from '@/components/shared/jpk-grid';
import { typedColumn } from '@/lib/grid/typed-column';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import { computeTotalDue, today } from '@/lib/date-utils';
import { fmt } from '@/lib/utils';
import type { RtdbContract, RtdbBilling } from '@/lib/types/rtdb-entities';
import type { ColDef } from 'ag-grid-community';
import { useRef } from 'react';

interface ScheduleRow {
  _key: string;
  partner_code: string;
  car_number: string;
  contract_code: string;
  contractor_name: string;
  deposit_amount: number;
  deposit_paid: boolean;
  rent_amount: number;
  auto_debit_day: string;
  total_months: number;
  due_count: number;       // 경과회차
  paid_count: number;      // 납부 (완납)
  unpaid_count: number;    // 미납 (경과+미완납)
  wait_count: number;      // 대기 (미래)
  unpaid_amount: number;
  contract_status: string;
}

export default function BillingSchedulePage() {
  const contracts = useRtdbCollection<RtdbContract>('contracts');
  const billings = useRtdbCollection<RtdbBilling>('billings');
  const gridRef = useRef<JpkGridApi<ScheduleRow> | null>(null);
  const [selected, setSelected] = useState<ScheduleRow | null>(null);

  const t = today();

  // 계약별 1행 (수납스케줄 요약)
  const rows = useMemo<ScheduleRow[]>(() => {
    return contracts.data
      .filter((c) => c.status !== 'deleted' && c.contract_code)
      .map((c) => {
        const cBillings = billings.data.filter((b) => b.contract_code === c.contract_code && b.status !== 'deleted');
        const rentBillings = cBillings.filter((b) => (b as Record<string, unknown>).bill_type !== '보증금');
        const depositBilling = cBillings.find((b) => (b as Record<string, unknown>).bill_type === '보증금');

        // 납부 = 완납, 미납 = 경과+미완납, 대기 = 미래
        let dueCount = 0;
        let paidCount = 0;
        let unpaidCount = 0;
        let unpaidAmount = 0;
        const totalMonths = Number(c.rent_months) || rentBillings.length;
        for (const b of rentBillings) {
          const due = computeTotalDue(b);
          const paid = Number(b.paid_total) || 0;
          const isPast = b.due_date && b.due_date <= t;
          if (isPast) {
            dueCount++;
            if (paid >= due) paidCount++;
            else { unpaidCount++; unpaidAmount += due - paid; }
          }
        }
        const waitCount = totalMonths - dueCount;

        const depositAmt = depositBilling ? computeTotalDue(depositBilling) : Number(c.deposit_amount) || 0;
        const depositPaid = depositBilling ? (Number(depositBilling.paid_total) || 0) >= depositAmt : false;

        return {
          _key: c._key ?? '',
          partner_code: c.partner_code ?? '',
          car_number: c.car_number ?? '',
          contract_code: c.contract_code ?? '',
          contractor_name: c.contractor_name ?? '',
          deposit_amount: depositAmt,
          deposit_paid: depositPaid,
          rent_amount: Number(c.rent_amount) || 0,
          auto_debit_day: c.auto_debit_day ? `${c.auto_debit_day}일` : '',
          total_months: totalMonths,
          due_count: dueCount,
          paid_count: paidCount,
          unpaid_count: unpaidCount,
          wait_count: waitCount,
          unpaid_amount: unpaidAmount,
          contract_status: c.contract_status ?? '',
        };
      });
  }, [contracts.data, billings.data]);

  // 선택된 계약의 billing 상세
  const detailBillings = useMemo(() => {
    if (!selected) return [];
    return billings.data
      .filter((b) => b.contract_code === selected.contract_code && b.status !== 'deleted')
      .sort((a, b) => {
        // 보증금 먼저, 그 다음 대여료 회차순
        const aType = (a as Record<string, unknown>).bill_type === '보증금' ? 0 : 1;
        const bType = (b as Record<string, unknown>).bill_type === '보증금' ? 0 : 1;
        if (aType !== bType) return aType - bType;
        return (a.bill_count ?? 0) - (b.bill_count ?? 0);
      });
  }, [billings.data, selected]);

  const cols = useMemo<ColDef<ScheduleRow>[]>(() => [
    typedColumn('action', { headerName: '#', valueGetter: (p) => (p.node?.rowIndex ?? 0) + 1, width: 40, pinned: 'left', cellStyle: { color: 'var(--c-text-muted)' } }),
    typedColumn('select', { headerName: '상태', field: 'contract_status', width: 70, pinned: 'left' }),
    typedColumn('select', { headerName: '회사코드', field: 'partner_code', width: 80, pinned: 'left' }),
    typedColumn('text', { headerName: '차량번호', field: 'car_number', width: 90, pinned: 'left', cellStyle: { fontWeight: 600 } }),
    typedColumn('text', { headerName: '계약자', field: 'contractor_name', width: 80 }),
    typedColumn('number', {
      headerName: '보증금',
      field: 'deposit_amount',
      width: 80,
      valueFormatter: (p) => Number(p.value) > 0 ? fmt(Number(p.value)) : '무보증',
    }),
    typedColumn('action', {
      headerName: '보증금',
      width: 55,
      valueGetter: (p) => p.data?.deposit_amount ? (p.data.deposit_paid ? '납부' : '미납') : '',
      cellStyle: (p) => ({
        color: p.value === '납부' ? 'var(--c-success)' : p.value === '미납' ? 'var(--c-danger)' : 'var(--c-text-muted)',
        fontWeight: 600, textAlign: 'center',
      }),
    }),
    typedColumn('number', {
      headerName: '월대여료',
      field: 'rent_amount',
      width: 90,
      valueFormatter: (p) => p.value ? fmt(Number(p.value)) : '',
    }),
    typedColumn('text', { headerName: '결제일', field: 'auto_debit_day', width: 60 }),
    typedColumn('number', { headerName: '총회차', field: 'total_months', width: 55 }),
    typedColumn('number', {
      headerName: '경과',
      field: 'due_count',
      width: 50,
    }),
    typedColumn('number', {
      headerName: '납부',
      field: 'paid_count',
      width: 50,
      cellStyle: { color: 'var(--c-success)' },
    }),
    typedColumn('number', {
      headerName: '미납',
      field: 'unpaid_count',
      width: 50,
      cellStyle: (p) => ({ color: Number(p.value) > 0 ? 'var(--c-danger)' : 'var(--c-text-muted)', fontWeight: Number(p.value) > 0 ? 600 : 400 }),
    }),
    typedColumn('number', {
      headerName: '대기',
      field: 'wait_count',
      width: 50,
      cellStyle: { color: 'var(--c-text-muted)' },
    }),
    typedColumn('number', {
      headerName: '미납금액',
      field: 'unpaid_amount',
      width: 90,
      valueFormatter: (p) => Number(p.value) > 0 ? fmt(Number(p.value)) : '',
      cellStyle: (p) => ({ color: Number(p.value) > 0 ? 'var(--c-danger)' : 'var(--c-text-muted)', fontWeight: 600 }),
    }),
  ], []);

  return (
    <Workspace layout="layout-55">
      {/* 좌측: 계약별 수납스케줄 목록 */}
      <section className="panel">
        <div className="panel-head">
          <div>
            <i className="ph ph-calendar-check" />
            <span className="panel-title">수납 스케줄</span>
            <span className="panel-subtitle">계약별 납부 현황</span>
          </div>
        </div>
        <div className="panel-body no-pad" style={{ overflow: 'hidden' }}>
          <JpkGrid<ScheduleRow>
            ref={gridRef}
            columnDefs={cols}
            rowData={rows}
            getRowId={(d) => d._key}
            storageKey="jpk.grid.billing-schedule"
            onRowClicked={(row) => setSelected(row)}
          />
        </div>
      </section>

      {/* 우측: 선택 계약의 회차별 스케줄 */}
      <section className="panel">
        <div className="panel-head">
          <div>
            <i className="ph ph-list-numbers" />
            <span className="panel-title">스케줄 상세</span>
            <span className="panel-subtitle">
              {selected ? `${selected.car_number} · ${selected.contractor_name}` : '계약을 선택하세요'}
            </span>
          </div>
        </div>
        <div className="panel-body no-pad" style={{ overflow: 'auto' }}>
          {!selected ? (
            <div className="flex items-center justify-center text-text-muted" style={{ height: '100%' }}>
              <div className="text-xs" style={{ textAlign: 'center' }}>
                <i className="ph ph-cursor-click" style={{ fontSize: 32, display: 'block', marginBottom: 8 }} />
                좌측에서 계약을 선택하면<br />회차별 스케줄이 표시됩니다
              </div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--c-bg-sub)' }}>
                <tr className="text-xs text-text-sub" style={{ borderBottom: '1px solid var(--c-border)' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 500, width: 50 }}>구분</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 500, width: 40 }}>회차</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 500 }}>납부예정일</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 500 }}>금액</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 500 }}>납부액</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 500 }}>상태</th>
                </tr>
              </thead>
              <tbody>
                {detailBillings.map((b) => {
                  const due = computeTotalDue(b);
                  const paid = Number(b.paid_total) || 0;
                  const isPaid = paid >= due;
                  const isOverdue = !isPaid && b.due_date && b.due_date < t;
                  return (
                    <tr key={b._key} style={{ borderBottom: '1px solid var(--c-border)' }}>
                      <td className="text-xs" style={{ padding: '6px 8px', textAlign: 'center' }}>
                        <span className={`jpk-pill ${(b as Record<string, unknown>).bill_type === '보증금' ? 'tone-primary' : 'tone-neutral'}`}>
                          {String((b as Record<string, unknown>).bill_type ?? '대여료')}
                        </span>
                      </td>
                      <td className="text-xs text-text-muted" style={{ padding: '6px 8px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                        {b.bill_count}
                      </td>
                      <td className="text-xs" style={{ padding: '6px 8px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                        {b.due_date}
                      </td>
                      <td className="text-xs" style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {fmt(due)}
                      </td>
                      <td className="text-xs" style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: isPaid ? 'var(--c-success)' : 'var(--c-text-muted)' }}>
                        {paid > 0 ? fmt(paid) : '—'}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                        <span className={`jpk-pill ${isPaid ? 'tone-success' : isOverdue ? 'tone-danger' : 'tone-neutral'}`}>
                          {isPaid ? '납부' : isOverdue ? '연체' : '예정'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </Workspace>
  );
}
