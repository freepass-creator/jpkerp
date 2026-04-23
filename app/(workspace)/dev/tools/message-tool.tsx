'use client';

import { useMemo } from 'react';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import { JpkGrid } from '@/components/shared/jpk-grid';
import { typedColumn, MONO_CELL_STYLE } from '@/lib/grid/typed-column';
import type { RtdbEvent } from '@/lib/types/rtdb-entities';
import type { ColDef } from 'ag-grid-community';
import { fmt, fmtDate } from '@/lib/utils';

interface MsgRow {
  key: string;
  date: string;
  channel: string;
  car_number: string;
  partner_code: string;
  customer_name: string;
  customer_phone: string;
  result: string;
  title: string;
}

/** 발송 이력 — contact 이벤트 중 channel 매칭. 아직 Aligo 등 실연동 전 placeholder. */
export function MessageTool({ channel }: { channel: 'alimtalk' | 'sms' }) {
  const events = useRtdbCollection<RtdbEvent>('events');

  const rows = useMemo<MsgRow[]>(() => {
    const match = (ch?: string) => {
      if (!ch) return false;
      const s = ch.toLowerCase();
      if (channel === 'alimtalk') return /알림톡|kakao|카카오/.test(s);
      return /sms|문자/.test(s);
    };
    return events.data
      .filter((e) => e.type === 'contact' && e.status !== 'deleted' && match(e.contact_channel))
      .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))
      .map((e) => ({
        key: e._key ?? `${e.date}-${e.car_number}`,
        date: e.date ?? '',
        channel: e.contact_channel ?? '',
        car_number: e.car_number ?? '',
        partner_code: String((e as { partner_code?: string }).partner_code ?? ''),
        customer_name: String((e as { customer_name?: string }).customer_name ?? ''),
        customer_phone: String((e as { customer_phone?: string }).customer_phone ?? ''),
        result: e.contact_result ?? '',
        title: e.title ?? '',
      }));
  }, [events.data, channel]);

  const cols = useMemo<ColDef<MsgRow>[]>(() => [
    typedColumn('date', { headerName: '일자', field: 'date', width: 100, valueFormatter: (p) => fmtDate(p.value as string) }),
    typedColumn('select', { headerName: '채널', field: 'channel', width: 90 }),
    typedColumn('text', { headerName: '차량번호', field: 'car_number', width: 100, cellStyle: { fontWeight: '600' } }),
    typedColumn('text', { headerName: '회원사', field: 'partner_code', width: 80, cellStyle: MONO_CELL_STYLE }),
    typedColumn('text', { headerName: '수신자', field: 'customer_name', width: 100 }),
    typedColumn('text', { headerName: '연락처', field: 'customer_phone', width: 120 }),
    typedColumn('text', { headerName: '제목', field: 'title', flex: 1, minWidth: 160 }),
    typedColumn('select', { headerName: '결과', field: 'result', width: 100 }),
  ], []);

  const label = channel === 'alimtalk' ? '알림톡' : 'SMS';
  const loading = events.loading;

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <div className="text-base" style={{ padding: '10px 14px', borderBottom: '1px solid var(--c-border)' }}>
        <i className={`ph ${channel === 'alimtalk' ? 'ph-chat-text' : 'ph-envelope'}`} style={{ marginRight: 4 }} />
        {label} 발송 이력 · <b>{fmt(rows.length)}</b>건
        <span className="text-text-muted text-xs" style={{ marginLeft: 8 }}>
          · contact 이벤트 중 채널 매칭 (Aligo 실연동 후 별도 로그 예정)
        </span>
      </div>
      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center gap-2 text-text-muted" style={{ height: '100%' }}>
            <i className="ph ph-spinner spin" /> 로드 중
          </div>
        ) : (
          <JpkGrid<MsgRow>
            columnDefs={cols}
            rowData={rows}
            getRowId={(d) => d.key}
            storageKey={`jpk.grid.dev.${channel}`}
          />
        )}
      </div>
    </div>
  );
}
