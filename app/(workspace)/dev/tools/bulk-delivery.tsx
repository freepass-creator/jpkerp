'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import { JpkGrid } from '@/components/shared/jpk-grid';
import { typedColumn, rowNumColumn, MONO_CELL_STYLE } from '@/lib/grid/typed-column';
import { saveEvent } from '@/lib/firebase/events';
import { useAuth } from '@/lib/auth/context';
import { ToolActions } from '../tool-actions-context';
import type { RtdbAsset, RtdbContract, RtdbEvent } from '@/lib/types/rtdb-entities';
import type { ColDef } from 'ag-grid-community';
import { fmt, fmtDate } from '@/lib/utils';
import { today } from '@/lib/date-utils';
import { isActiveContractStatus } from '@/lib/data/contract-status';

interface DeliveryRow {
  key: string;
  contract_code: string;
  car_number: string;
  partner_code: string;
  contractor_name: string;
  contractor_phone: string;
  start_date: string;
  rent_amount: number;
  delivery_status: string;
  _selected?: boolean;
}

export function BulkDeliveryTool() {
  const { user } = useAuth();
  const assets = useRtdbCollection<RtdbAsset>('assets');
  const contracts = useRtdbCollection<RtdbContract>('contracts');
  const events = useRtdbCollection<RtdbEvent>('events');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const rows = useMemo<DeliveryRow[]>(() => {
    const t = today();
    const deliveredCars = new Set(
      events.data
        .filter((e) => e.type === 'delivery' && e.status !== 'deleted' && e.car_number)
        .map((e) => e.car_number as string),
    );
    const out: DeliveryRow[] = [];
    for (const c of contracts.data) {
      if (c.status === 'deleted') continue;
      if (!isActiveContractStatus(c.contract_status)) continue;
      if (!c.car_number || !c.contractor_name) continue;
      const asset = assets.data.find((a) => a.car_number === c.car_number);
      const delivered = deliveredCars.has(c.car_number);
      const startOk = !c.start_date || c.start_date <= t;
      if (delivered || !startOk) continue;
      out.push({
        key: c._key ?? `${c.contract_code}-${c.car_number}`,
        contract_code: c.contract_code ?? '',
        car_number: c.car_number,
        partner_code: c.partner_code ?? asset?.partner_code ?? '',
        contractor_name: c.contractor_name ?? '',
        contractor_phone: c.contractor_phone ?? '',
        start_date: c.start_date ?? '',
        rent_amount: Number(c.rent_amount) || 0,
        delivery_status: '출고대기',
      });
    }
    return out.sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));
  }, [contracts.data, assets.data, events.data]);

  const toggle = (key: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  };
  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.key)));
  };

  const processBulk = async () => {
    const targets = rows.filter((r) => selected.has(r.key));
    if (targets.length === 0) { toast.info('선택된 계약 없음'); return; }
    if (!confirm(`${targets.length}건 일괄 출고 이벤트 생성. 진행?`)) return;
    setBusy(true);
    setProgress({ current: 0, total: targets.length });
    let ok = 0;
    let fail = 0;
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      try {
        await saveEvent({
          type: 'delivery',
          date: today(),
          car_number: t.car_number,
          contract_code: t.contract_code,
          partner_code: t.partner_code,
          customer_name: t.contractor_name,
          customer_phone: t.contractor_phone,
          title: `일괄 출고 · ${t.contractor_name}`,
          handler_uid: user?.uid,
          handler: user?.displayName ?? user?.email ?? undefined,
          note: '개발도구 일괄출고',
        });
        ok++;
      } catch {
        fail++;
      }
      setProgress({ current: i + 1, total: targets.length });
    }
    setBusy(false);
    setSelected(new Set());
    if (fail === 0) toast.success(`${ok}건 출고 이벤트 생성`);
    else toast.error(`성공 ${ok} / 실패 ${fail}`);
  };

  const cols = useMemo<ColDef<DeliveryRow>[]>(() => [
    {
      headerName: '',
      width: 40,
      pinned: 'left',
      cellRenderer: (p: { data?: DeliveryRow }) => {
        if (!p.data) return '';
        const checked = selected.has(p.data.key);
        return `<input type="checkbox" ${checked ? 'checked' : ''} style="cursor:pointer" />`;
      },
      onCellClicked: (p) => { if (p.data) toggle(p.data.key); },
      sortable: false,
      suppressHeaderMenuButton: true,
    },
    rowNumColumn(),
    typedColumn('text', { headerName: '계약코드', field: 'contract_code', width: 130, cellStyle: MONO_CELL_STYLE }),
    typedColumn('text', { headerName: '차량번호', field: 'car_number', width: 100, cellStyle: { fontWeight: '600' } }),
    typedColumn('text', { headerName: '회원사', field: 'partner_code', width: 80, cellStyle: MONO_CELL_STYLE }),
    typedColumn('text', { headerName: '계약자', field: 'contractor_name', width: 100 }),
    typedColumn('text', { headerName: '연락처', field: 'contractor_phone', width: 120 }),
    typedColumn('date', { headerName: '시작일', field: 'start_date', width: 100, valueFormatter: (p) => fmtDate(p.value as string) }),
    typedColumn('number', { headerName: '월 대여료', field: 'rent_amount', width: 110, valueFormatter: (p) => (p.value ? fmt(Number(p.value)) : '-') }),
    typedColumn('select', { headerName: '상태', field: 'delivery_status', width: 80, cellStyle: { color: 'var(--c-warn)', fontWeight: '600' } }),
  ], [selected]);

  const loading = assets.loading || contracts.loading || events.loading;
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 text-text-muted" style={{ height: '100%', minHeight: 200 }}>
        <i className="ph ph-spinner spin" /> 로드 중...
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <ToolActions>
        <button type="button" className="btn btn-sm btn-outline" onClick={toggleAll}>
          <i className="ph ph-check-square" />
          {selected.size === rows.length && rows.length > 0 ? '전체 해제' : '전체 선택'}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={busy || selected.size === 0}
          onClick={processBulk}
        >
          <i className={`ph ${busy ? 'ph-spinner spin' : 'ph-check-circle'}`} />
          {busy ? `처리중 ${progress.current}/${progress.total}` : `선택 ${selected.size}건 출고 처리`}
        </button>
      </ToolActions>

      <div className="text-base" style={{ padding: '10px 14px', borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <i className="ph ph-truck text-warn" />
        <b>{fmt(rows.length)}</b>
        <span className="text-text-muted"> 건 출고 대기 · 선택 </span>
        <b className="text-primary">{selected.size}</b>
      </div>
      <div className="flex-1 min-h-0">
        <JpkGrid<DeliveryRow>
          columnDefs={cols}
          rowData={rows}
          getRowId={(d) => d.key}
          storageKey="jpk.grid.dev.bulk-delivery"
        />
      </div>
    </div>
  );
}
