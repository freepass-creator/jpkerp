'use client';

import { useEffect, useMemo, useRef, useState, type Ref, type RefObject } from 'react';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import { JpkGrid, type JpkGridApi } from '@/components/shared/jpk-grid';
import { JpkSetFilter } from '@/lib/grid/set-filter';
import { rowNumColumn } from '@/lib/grid/typed-column';
import { normalizeDate, computeContractEnd, today, daysBetween } from '@/lib/date-utils';
import type { RtdbAsset, RtdbContract, RtdbEvent } from '@/lib/types/rtdb-entities';
import { fmtDate } from '@/lib/utils';
import type { ColDef } from 'ag-grid-community';

type Cat = 'accident' | 'care' | 'nodelivery';

export interface PendingRow {
  cat: Cat;
  car_number: string;
  detail_model: string;
  partner_code: string;
  summary: string;
  status: string;
  elapsed: number;
  date: string;
}

const CAT_META: Record<Cat, { label: string; icon: string; color: string }> = {
  accident: { label: '사고진행', icon: 'ph-car-profile', color: '#ef4444' },
  care: { label: '차량케어', icon: 'ph-wrench', color: '#f97316' },
  nodelivery: { label: '미출고', icon: 'ph-truck', color: '#8b5cf6' },
};

export { CAT_META };
export type { Cat };

interface Props {
  gridRef?: RefObject<JpkGridApi<PendingRow> | null>;
  onCountChange?: (count: number) => void;
  filter?: 'all' | Cat;
}

export function PendingClient({ gridRef: externalRef, onCountChange, filter: externalFilter }: Props = {}) {
  const internalRef = useRef<JpkGridApi<PendingRow> | null>(null);
  const gridRef = externalRef ?? internalRef;
  const assets = useRtdbCollection<RtdbAsset>('assets');
  const contracts = useRtdbCollection<RtdbContract>('contracts');
  const events = useRtdbCollection<RtdbEvent>('events');
  const filter = externalFilter ?? 'all';

  const allRows = useMemo<PendingRow[]>(() => {
    const t = today();
    const rows: PendingRow[] = [];

    // 1) 사고진행
    for (const e of events.data) {
      if (e.type !== 'accident' || e.status === 'deleted') continue;
      if (!e.accident_status || e.accident_status === '종결') continue;
      const asset = assets.data.find((a) => a.car_number === e.car_number);
      const days = e.date ? daysBetween(e.date, t) : 0;
      rows.push({
        cat: 'accident',
        car_number: e.car_number ?? '-',
        detail_model: asset?.detail_model ?? asset?.car_model ?? '',
        partner_code: asset?.partner_code ?? '-',
        summary: `사고 · ${e.accident_status}`,
        status: e.accident_status ?? '접수',
        elapsed: Math.max(0, days),
        date: e.date ?? '',
      });
    }

    // 2) 차량케어
    const careLabels: Record<string, string> = {
      maint: '정비',
      repair: '사고수리',
      product: '상품화',
      wash: '세차',
    };
    for (const e of events.data) {
      if (!(e.type && careLabels[e.type]) || e.status === 'deleted') continue;
      if (e.work_status === '완료') continue;
      const asset = assets.data.find((a) => a.car_number === e.car_number);
      const days = e.date ? daysBetween(e.date, t) : 0;
      rows.push({
        cat: 'care',
        car_number: e.car_number ?? '-',
        detail_model: asset?.detail_model ?? asset?.car_model ?? '',
        partner_code: asset?.partner_code ?? '-',
        summary: `${careLabels[e.type]} · ${e.work_status ?? '입고'}`,
        status: e.work_status ?? '입고',
        elapsed: Math.max(0, days),
        date: e.date ?? '',
      });
    }

    // 3) 미출고
    const delivered = new Set(
      events.data
        .filter((e) => e.type === 'delivery' && e.status !== 'deleted')
        .map((e) => e.car_number),
    );
    for (const c of contracts.data) {
      if (c.status === 'deleted') continue;
      if (!c.contractor_name?.trim()) continue;
      const s = normalizeDate(c.start_date);
      if (!s || s > t) continue;
      const e = computeContractEnd(c);
      if (e && e < t) continue;
      if (delivered.has(c.car_number)) continue;
      const asset = assets.data.find((a) => a.car_number === c.car_number);
      const days = daysBetween(s, t);
      rows.push({
        cat: 'nodelivery',
        car_number: c.car_number ?? '-',
        detail_model: asset?.detail_model ?? asset?.car_model ?? '',
        partner_code: c.partner_code ?? asset?.partner_code ?? '-',
        summary: `${c.contractor_name} · 계약후 미출고`,
        status: '미출고',
        elapsed: Math.max(0, days),
        date: s,
      });
    }

    return rows.sort((a, b) => b.elapsed - a.elapsed);
  }, [assets.data, contracts.data, events.data]);

  const rows = useMemo(
    () => (filter === 'all' ? allRows : allRows.filter((r) => r.cat === filter)),
    [allRows, filter],
  );

  useEffect(() => { onCountChange?.(rows.length); }, [rows.length, onCountChange]);

  const columnDefs = useMemo<ColDef<PendingRow>[]>(
    () =>
      [
        rowNumColumn<PendingRow>(),
        {
          headerName: '업무구분',
          field: 'cat',
          width: 95,
          filter: JpkSetFilter,
          cellStyle: (p: { value: unknown }) => ({ color: CAT_META[p.value as Cat]?.color ?? 'var(--c-text)', fontWeight: '600' }),
          valueFormatter: (p: { value: unknown }) => CAT_META[p.value as Cat]?.label ?? String(p.value),
        },
        { headerName: '회사코드', field: 'partner_code', width: 80, filter: JpkSetFilter },
        { headerName: '차량번호', field: 'car_number', width: 95, cellStyle: { fontWeight: '600' } },
        { headerName: '세부모델', field: 'detail_model', flex: 1, minWidth: 140 },
        { headerName: '내용', field: 'summary', width: 180 },
        { headerName: '상태', field: 'status', width: 85, filter: JpkSetFilter, cellStyle: { fontWeight: '600' } },
        {
          headerName: '경과',
          field: 'elapsed',
          width: 75,
          filter: false,
          sort: 'desc',
          cellStyle: (p: { value: unknown }) => {
            const v = Number(p.value);
            return {
              textAlign: 'right',
              fontWeight: '600',
              color: v >= 30 ? 'var(--c-danger)' : v >= 7 ? 'var(--c-warn)' : 'var(--c-text-sub)',
            };
          },
          valueFormatter: (p: { value: unknown }) => (p.value !== undefined ? `${p.value}일` : '-'),
        },
        { headerName: '일자', field: 'date', width: 90, valueFormatter: (p: { value: unknown }) => fmtDate(p.value as string) },
      ] as ColDef<PendingRow>[],
    [],
  );

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <div className="flex-1 min-h-0">
        <JpkGrid<PendingRow>
          ref={gridRef as Ref<JpkGridApi<PendingRow>>}
          columnDefs={columnDefs}
          rowData={rows}
          getRowId={(d) => `${d.cat}-${d.car_number}-${d.date}`}
          storageKey="jpk.grid.status.pending"
        />
      </div>
    </div>
  );
}
