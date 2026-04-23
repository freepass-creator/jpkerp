'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ref, push, set, serverTimestamp } from 'firebase/database';
import { getRtdb } from '@/lib/firebase/rtdb';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import { JpkGrid } from '@/components/shared/jpk-grid';
import { typedColumn, rowNumColumn, MONO_CELL_STYLE } from '@/lib/grid/typed-column';
import { CarNumberPicker } from '@/components/form/car-number-picker';
import { ToolActions } from '../tool-actions-context';
import type { RtdbBilling, RtdbContract } from '@/lib/types/rtdb-entities';
import type { ColDef } from 'ag-grid-community';
import { fmt, fmtDate } from '@/lib/utils';
import { computeTotalDue, today } from '@/lib/date-utils';

interface OverdueRow {
  key: string;
  contract_code: string;
  car_number: string;
  partner_code: string;
  contractor_name: string;
  due_date: string;
  due_amount: number;
  paid_total: number;
  unpaid: number;
  days_overdue: number;
}

export function OverdueTool() {
  const billings = useRtdbCollection<RtdbBilling>('billings');
  const contracts = useRtdbCollection<RtdbContract>('contracts');

  const [carNumber, setCarNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(today());
  const [busy, setBusy] = useState(false);

  const matchedContract = useMemo(() => {
    if (!carNumber) return null;
    return contracts.data.find(
      (c) => c.car_number === carNumber && c.status !== 'deleted' && c.contractor_name?.trim(),
    ) ?? null;
  }, [carNumber, contracts.data]);

  const register = async () => {
    if (!matchedContract?.contract_code) {
      toast.error('활성 계약 없는 차량 — 등록 불가');
      return;
    }
    const amt = Number(String(amount).replace(/,/g, '')) || 0;
    if (amt <= 0) { toast.error('금액을 입력하세요'); return; }
    if (!confirm(`${carNumber} · ${matchedContract.contractor_name} 미수 ${fmt(amt)}원 등록?`)) return;
    setBusy(true);
    try {
      const r = push(ref(getRtdb(), 'billings'));
      await set(r, {
        contract_code: matchedContract.contract_code,
        car_number: carNumber,
        partner_code: matchedContract.partner_code,
        bill_count: 0,                  // 수기 등록은 회차 0
        due_date: dueDate,
        amount: amt,
        paid_total: 0,
        installments: [],
        status: 'active',
        derived_from: 'manual',
        created_at: Date.now(),
        updated_at: serverTimestamp(),
      });
      toast.success('미수 등록 완료');
      setAmount('');
      setCarNumber('');
    } catch (err) {
      toast.error(`등록 실패: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const rows = useMemo<OverdueRow[]>(() => {
    const t = today();
    const byCode = new Map(contracts.data.filter((c) => c.contract_code).map((c) => [c.contract_code!, c]));
    const out: OverdueRow[] = [];
    for (const b of billings.data) {
      if (b.status === 'deleted') continue;
      if (!b.contract_code || !b.due_date || b.due_date >= t) continue;
      const due = computeTotalDue(b);
      const paid = Number(b.paid_total) || 0;
      if (paid >= due) continue;
      const c = byCode.get(b.contract_code);
      if (!c) continue;
      const daysOverdue = Math.floor((new Date(t).getTime() - new Date(b.due_date).getTime()) / 86400000);
      out.push({
        key: b._key ?? `${b.contract_code}-${b.bill_count}`,
        contract_code: b.contract_code,
        car_number: c.car_number ?? '',
        partner_code: c.partner_code ?? '',
        contractor_name: c.contractor_name ?? '',
        due_date: b.due_date,
        due_amount: due,
        paid_total: paid,
        unpaid: due - paid,
        days_overdue: daysOverdue,
      });
    }
    return out.sort((a, b) => b.days_overdue - a.days_overdue);
  }, [billings.data, contracts.data]);

  const cols = useMemo<ColDef<OverdueRow>[]>(() => [
    rowNumColumn(),
    typedColumn('text', { headerName: '계약코드', field: 'contract_code', width: 130, cellStyle: MONO_CELL_STYLE }),
    typedColumn('text', { headerName: '차량번호', field: 'car_number', width: 100, cellStyle: { fontWeight: '600' } }),
    typedColumn('text', { headerName: '회원사', field: 'partner_code', width: 80, cellStyle: MONO_CELL_STYLE }),
    typedColumn('text', { headerName: '계약자', field: 'contractor_name', width: 100 }),
    typedColumn('date', { headerName: '납부일', field: 'due_date', width: 100, valueFormatter: (p) => fmtDate(p.value as string) }),
    typedColumn('number', { headerName: '청구액', field: 'due_amount', width: 100, valueFormatter: (p) => fmt(Number(p.value)) }),
    typedColumn('number', { headerName: '수납액', field: 'paid_total', width: 100, valueFormatter: (p) => fmt(Number(p.value)), cellStyle: { color: 'var(--c-text-muted)' } }),
    typedColumn('number', {
      headerName: '미납액', field: 'unpaid', width: 110, valueFormatter: (p) => fmt(Number(p.value)),
      cellStyle: { color: 'var(--c-danger)', fontWeight: '600' },
    }),
    typedColumn('number', {
      headerName: '연체일', field: 'days_overdue', width: 80, valueFormatter: (p) => `${p.value}일`,
      cellStyle: (p: { value: unknown }) => {
        const v = Number(p.value);
        if (v >= 30) return { color: 'var(--c-danger)', fontWeight: 700 };
        if (v >= 7) return { color: 'var(--c-warn)', fontWeight: 600 };
        return {};
      },
    }),
  ], []);

  const loading = billings.loading || contracts.loading;
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 text-text-muted" style={{ height: '100%', minHeight: 200 }}>
        <i className="ph ph-spinner spin" /> 로드 중...
      </div>
    );
  }

  const totalUnpaid = rows.reduce((s, r) => s + r.unpaid, 0);

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <ToolActions>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={register}
          disabled={busy || !matchedContract || !amount}
        >
          <i className={`ph ${busy ? 'ph-spinner spin' : 'ph-plus-circle'}`} />
          수기 미수 등록
        </button>
      </ToolActions>

      {/* 수기 미수 등록 폼 */}
      <div style={{ padding: 12, borderBottom: '1px solid var(--c-border)', background: 'var(--c-bg-sub)' }}>
        <div className="text-base" style={{ fontWeight: 600, marginBottom: 6 }}>
          <i className="ph ph-plus-circle" style={{ marginRight: 4 }} />수기 미수 등록
          <span className="text-text-muted text-2xs" style={{ fontWeight: 400, marginLeft: 6 }}>
            · 자동 파생 안 되는 예외 billing 수기 생성
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 140px 140px', gap: 6, alignItems: 'start' }}>
          <CarNumberPicker
            value={carNumber}
            onChange={(v) => setCarNumber(v)}
            placeholder="차량번호"
          />
          <div className="text-xs" style={{ color: matchedContract ? 'var(--c-text)' : 'var(--c-text-muted)', padding: '8px 0' }}>
            {matchedContract
              ? `${matchedContract.contractor_name ?? '—'} · ${matchedContract.contract_code ?? ''}`
              : carNumber ? '활성 계약 없음' : '차량 선택 시 계약 매칭'}
          </div>
          <input
            type="text"
            inputMode="numeric"
            className="ctrl num text-base"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d,]/g, ''))}
            placeholder="미수금액"
            style={{ height: 32, textAlign: 'right' }}
          />
          <input
            type="date"
            className="ctrl text-base"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            style={{ height: 32 }}
          />
        </div>
      </div>

      <div className="text-base" style={{ padding: '10px 14px', borderBottom: '1px solid var(--c-border)' }}>
        <i className="ph ph-magnifying-glass text-danger" style={{ marginRight: 4 }} />
        <b>{fmt(rows.length)}</b>
        <span className="text-text-muted"> 건 연체 · 총 미납 </span>
        <b className="text-danger">{fmt(totalUnpaid)}원</b>
      </div>
      <div className="flex-1 min-h-0">
        <JpkGrid<OverdueRow>
          columnDefs={cols}
          rowData={rows}
          getRowId={(d) => d.key}
          storageKey="jpk.grid.dev.overdue"
        />
      </div>
    </div>
  );
}
