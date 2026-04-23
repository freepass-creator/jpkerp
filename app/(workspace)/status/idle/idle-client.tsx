'use client';

import { useEffect, useMemo, useRef, type Ref, type RefObject } from 'react';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import { JpkGrid, type JpkGridApi } from '@/components/shared/jpk-grid';
import { JpkSetFilter } from '@/lib/grid/set-filter';
import { rowNumColumn } from '@/lib/grid/typed-column';
import { normalizeDate, computeContractEnd, today, daysBetween } from '@/lib/date-utils';
import { EVENT_META } from '@/lib/event-meta';
import type { RtdbAsset, RtdbContract, RtdbEvent } from '@/lib/types/rtdb-entities';
import type { ColDef } from 'ag-grid-community';

export interface IdleRow {
  partner_code: string;
  car_number: string;
  detail_model: string;
  current_location: string;
  last_work: string;
  last_work_status: string;
  idle_reason: '계약없음' | '계약만료' | '계약대기' | '계약자정보누락' | '계약무효';
  idle_days: number | '';
}

const REASON_COLOR: Record<string, string> = {
  '계약없음': 'var(--c-text-muted)',
  '계약만료': '#c08a2b',
  '계약대기': 'var(--c-primary)',
  '계약자정보누락': 'var(--c-danger)',
  '계약무효': 'var(--c-danger)',
};

interface Props {
  gridRef?: RefObject<JpkGridApi<IdleRow> | null>;
  onCountChange?: (count: number) => void;
}

export function IdleClient({ gridRef: externalRef, onCountChange }: Props = {}) {
  const internalRef = useRef<JpkGridApi<IdleRow> | null>(null);
  const gridRef = externalRef ?? internalRef;
  const assets = useRtdbCollection<RtdbAsset>('assets');
  const contracts = useRtdbCollection<RtdbContract>('contracts');
  const events = useRtdbCollection<RtdbEvent>('events');

  const rows = useMemo<IdleRow[]>(() => {
    const t = today();
    const activeCars = new Set(
      contracts.data
        .filter((c) => {
          if (c.status === 'deleted') return false;
          if (!c.contractor_name?.trim()) return false;
          const s = normalizeDate(c.start_date);
          if (!s || s > t) return false;
          const e = computeContractEnd(c);
          return !e || e >= t;
        })
        .map((c) => c.car_number)
        .filter(Boolean) as string[],
    );

    const locByCar = new Map<string, string>();
    const lastEventByCar = new Map<string, RtdbEvent>();
    const sorted = [...events.data]
      .filter((e) => e.status !== 'deleted')
      .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
    for (const e of sorted) {
      if (!e.car_number) continue;
      if (!locByCar.has(e.car_number)) {
        const loc = e.to_location || e.return_location || e.delivery_location || '';
        if (loc) locByCar.set(e.car_number, loc);
      }
      if (!lastEventByCar.has(e.car_number)) {
        lastEventByCar.set(e.car_number, e);
      }
    }

    const contractsByCar: Record<string, RtdbContract[]> = {};
    for (const c of contracts.data.filter((x) => x.status !== 'deleted')) {
      if (!c.car_number) continue;
      (contractsByCar[c.car_number] ||= []).push(c);
    }

    return assets.data
      .filter((a) => a.status !== 'deleted' && a.car_number && !activeCars.has(a.car_number))
      .map((a) => {
        const cs = (contractsByCar[a.car_number!] ?? []).sort((x, y) =>
          String(y.start_date ?? '').localeCompare(String(x.start_date ?? '')),
        );
        let reason: IdleRow['idle_reason'] = '계약없음';
        let idle_start = '';
        if (cs.length) {
          const latest = cs[0];
          if (!latest.contractor_name?.trim()) {
            reason = '계약자정보누락';
          } else {
            const s = normalizeDate(latest.start_date);
            const e = computeContractEnd(latest);
            if (s && s > t) {
              reason = '계약대기';
              idle_start = t;
            } else if (e && e < t) {
              reason = '계약만료';
              idle_start = e;
            } else {
              reason = '계약무효';
            }
          }
        }
        const lastEv = lastEventByCar.get(a.car_number!);
        return {
          partner_code: a.partner_code ?? '-',
          car_number: a.car_number ?? '-',
          detail_model: a.detail_model ?? a.car_model ?? '',
          current_location: locByCar.get(a.car_number!) ?? '',
          last_work: EVENT_META[lastEv?.type ?? '']?.label ?? '',
          last_work_status: lastEv?.work_status ?? '',
          idle_reason: reason,
          idle_days: idle_start ? Math.max(0, daysBetween(idle_start, t)) : '',
        };
      });
  }, [assets.data, contracts.data, events.data]);

  const columnDefs = useMemo<ColDef<IdleRow>[]>(
    () =>
      [
        rowNumColumn<IdleRow>({ width: 50 }),
        { headerName: '회사코드', field: 'partner_code', width: 85, filter: JpkSetFilter },
        { headerName: '차량번호', field: 'car_number', width: 100, cellStyle: { fontWeight: '600' } },
        { headerName: '세부모델', field: 'detail_model', flex: 1, minWidth: 140 },
        { headerName: '현재위치', field: 'current_location', width: 130, filter: JpkSetFilter, valueFormatter: (p: { value: unknown }) => (p.value as string) || '-' },
        { headerName: '작업구분', field: 'last_work', width: 90, filter: JpkSetFilter, valueFormatter: (p: { value: unknown }) => (p.value as string) || '-' },
        { headerName: '작업상태', field: 'last_work_status', width: 90, filter: JpkSetFilter, valueFormatter: (p: { value: unknown }) => (p.value as string) || '-' },
        { headerName: '휴차사유', field: 'idle_reason', width: 110, filter: JpkSetFilter, cellStyle: (p: { value: unknown }) => ({ color: REASON_COLOR[p.value as string] ?? 'var(--c-text)', fontWeight: '600' }) },
        {
          headerName: '휴차기간',
          field: 'idle_days',
          width: 95,
          filter: false,
          cellStyle: (p: { value: unknown }) => {
            const v = Number(p.value);
            if (!Number.isFinite(v) || v < 7) return { textAlign: 'right' };
            if (v >= 60) return { textAlign: 'right', color: 'var(--c-danger)', fontWeight: '600' };
            const w = Math.floor(v / 7);
            const colors = ['#d4a848', '#c89b3a', '#bc8e2c', '#b0811e', '#a47410', '#986702', '#8c5a00', '#805000'];
            return { textAlign: 'right', color: colors[Math.min(w - 1, 7)], fontWeight: '600' };
          },
          valueFormatter: (p: { value: unknown }) => (p.value === '' || !p.value ? '-' : `${p.value}일`),
        },
      ] as ColDef<IdleRow>[],
    [],
  );

  useEffect(() => { onCountChange?.(rows.length); }, [rows.length, onCountChange]);

  if (assets.loading || contracts.loading) {
    return (
      <div className="flex items-center justify-center gap-2 text-text-muted" style={{ height: '100%', minHeight: 200 }}>
        <i className="ph ph-spinner spin" />
        데이터 불러오는 중...
      </div>
    );
  }

  return (
    <JpkGrid<IdleRow>
      ref={gridRef as Ref<JpkGridApi<IdleRow>>}
      columnDefs={columnDefs}
      rowData={rows}
      getRowId={(d) => d.car_number}
      storageKey="jpk.grid.status.idle"
    />
  );
}
