'use client';

import { useRef, useState, type Ref } from 'react';
import { toast } from 'sonner';
import { JpkGrid, type JpkGridApi } from '@/components/shared/jpk-grid';
import { rowNumColumn } from '@/lib/grid/typed-column';
import { parseCsv } from '@/lib/csv';
import * as BankShinhan from '@/lib/parsers/bank-shinhan';
import * as CardShinhan from '@/lib/parsers/card-shinhan';
import { upsertEventByRawKey } from '@/lib/firebase/events';
import { useSaveStore } from '@/lib/hooks/useSaveStatus';
import type { ColDef } from 'ag-grid-community';
import { fmt, fmtDate } from '@/lib/utils';

type Tab = 'bank' | 'autodebit' | 'card';
type Row = (BankShinhan.BankTxEvent | CardShinhan.CardTxEvent) & { _idx: number };

const GUIDES: Record<Tab, string> = {
  bank: '통장 거래내역 CSV 업로드 → 입금/출금 모든 거래가 /events에 등록됩니다',
  autodebit: '자동이체 결과 명세 CSV 업로드 (현재 신한은행 파서 공용)',
  card: '법인카드 이용내역 CSV 업로드 → 지출 거래로 기록됩니다',
};

export function FundClient() {
  const [tab, setTab] = useState<Tab>('bank');
  const [accountNo, setAccountNo] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const gridRef = useRef<JpkGridApi<Row> | null>(null);

  const switchTab = (t: Tab) => { setTab(t); setRows([]); };

  const handleFile = async (file: File) => {
    try {
      const text = await file.text();
      const data = parseCsv(text);
      if (data.length < 2) { toast.error('데이터 행이 없습니다'); return; }
      const headers = data[0].map((h) => String(h || '').trim());
      const parser = tab === 'card' ? CardShinhan : BankShinhan;
      if (!parser.detect(headers)) {
        toast.error(`헤더가 신한${tab === 'card' ? '카드' : '은행'} 양식과 일치하지 않습니다`);
        return;
      }
      const acctLabel = parser.LABEL;
      const parsed = data.slice(1).map((row, i): Row | null => {
        const ev = parser.parseRow(row, headers);
        if (!ev) return null;
        const withAcct = tab !== 'card' && accountNo
          ? { ...ev, account: `${acctLabel} ${accountNo}`, account_no: accountNo, raw_key: `${accountNo}|${ev.raw_key}` }
          : ev;
        return { ...withAcct, _idx: i } as Row;
      }).filter(Boolean) as Row[];
      if (!parsed.length) { toast.error('인식된 거래가 없습니다'); return; }
      setRows(parsed);
      toast.success(`${parsed.length}건 인식`);
    } catch (err) {
      toast.error(`CSV 파싱 실패: ${(err as Error).message}`);
    }
  };

  const confirm = async () => {
    if (!rows.length) return;
    setBusy(true);
    const saveStore = useSaveStore.getState();
    saveStore.begin('거래 저장');
    let ok = 0, fail = 0;
    for (const r of rows) {
      try {
        const { _idx: _i, ...ev } = r;
        void _i;
        await upsertEventByRawKey(ev);
        ok++;
      } catch (err) {
        console.error('[fund]', err);
        fail++;
      }
    }
    saveStore.success(`${ok}건 저장${fail ? ` · 실패 ${fail}` : ''}`);
    toast.success(`적용 완료 ${ok}건${fail ? ` · 실패 ${fail}` : ''}`);
    setBusy(false);
    if (fail === 0) setRows([]);
  };

  const summary = (() => {
    if (!rows.length) return null;
    const inCount = rows.filter((r) => 'direction' in r && r.direction === 'in').length;
    const outCount = rows.filter((r) => r.direction === 'out').length;
    const inSum = rows.filter((r) => 'direction' in r && r.direction === 'in').reduce((s, r) => s + r.amount, 0);
    const outSum = rows.filter((r) => r.direction === 'out').reduce((s, r) => s + r.amount, 0);
    return { inCount, outCount, inSum, outSum };
  })();

  const cols: ColDef<Row>[] = tab === 'card' ? [
    rowNumColumn<Row>({ width: 50 }),
    { headerName: '일자', field: 'date', width: 90, valueFormatter: (p) => fmtDate(p.value as string) },
    { headerName: '가맹점', field: 'counterparty', flex: 1, minWidth: 180 },
    { headerName: '금액', field: 'amount', width: 110, valueFormatter: (p) => fmt(Number(p.value)), cellClass: 'col-right' },
    { headerName: '카드', field: 'card_no', width: 120 },
    { headerName: '승인번호', field: 'approval_no', width: 110 },
    { headerName: '결제예정일', field: 'pay_date', width: 100, valueFormatter: (p) => fmtDate(p.value as string) },
  ] : [
    rowNumColumn<Row>({ width: 50 }),
    { headerName: '일자', field: 'date', width: 90, valueFormatter: (p) => fmtDate(p.value as string) },
    {
      headerName: '방향',
      field: 'direction',
      width: 60,
      valueFormatter: (p) => (p.value === 'in' ? '입금' : '출금'),
      cellStyle: (p) => ({ color: p.value === 'in' ? 'var(--c-success)' : 'var(--c-danger)' }),
    },
    { headerName: '금액', field: 'amount', width: 110, valueFormatter: (p) => fmt(Number(p.value)), cellClass: 'col-right' },
    { headerName: '내용', field: 'counterparty', flex: 1, minWidth: 150 },
    { headerName: '적요', field: 'summary' as keyof Row, width: 100 },
    { headerName: '잔액', field: 'balance' as keyof Row, width: 110, valueFormatter: (p) => (p.value ? fmt(Number(p.value)) : ''), cellClass: 'col-right' },
    { headerName: '거래점', field: 'branch' as keyof Row, width: 100 },
  ];

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      {/* 탭 */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border">
        {([
          { k: 'bank', label: '통장' },
          { k: 'autodebit', label: '자동이체' },
          { k: 'card', label: '법인카드' },
        ] as const).map(({ k, label }) => (
          <button
            key={k}
            type="button"
            className={`btn btn-sm ${tab === k ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => switchTab(k)}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto text-text-muted text-xs">{GUIDES[tab]}</span>
      </div>

      {/* 업로드 + 계좌번호 입력 */}
      <div className="flex items-start gap-3 p-4 border-b border-border">
        <label
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
          }}
          className="jpk-uploader-drop"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            borderColor: dragOver ? 'var(--c-primary)' : 'var(--c-border)',
            background: dragOver ? 'var(--c-primary-bg)' : 'var(--c-bg-sub)',
            color: dragOver ? 'var(--c-primary)' : 'var(--c-text-sub)',
          }}
        >
          <input
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <i className="ph ph-file-arrow-up text-[18px]" />
          <span className="text-base" style={{ fontWeight: 500 }}>CSV 파일 드래그 또는 클릭</span>
        </label>
        {tab !== 'card' && (
          <div className="field" style={{ width: 220 }}>
            <label>계좌번호 (선택)</label>
            <input
              className="input"
              type="text"
              value={accountNo}
              onChange={(e) => setAccountNo(e.target.value)}
              placeholder="계좌번호 입력 시 account 필드에 저장"
            />
          </div>
        )}
      </div>

      {/* 요약 + 확정 버튼 */}
      {summary && (
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border text-xs">
          <span><b>{rows.length}건</b> 인식</span>
          <span className="text-text-muted">·</span>
          <span className="text-success">입금 {summary.inCount}건 {fmt(summary.inSum)}원</span>
          <span className="text-text-muted">·</span>
          <span className="text-danger">출금 {summary.outCount}건 {fmt(summary.outSum)}원</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => setRows([])} disabled={busy}>
              <i className="ph ph-trash" />초기화
            </button>
            <button type="button" className="btn btn-sm btn-primary" onClick={confirm} disabled={busy}>
              <i className={`ph ${busy ? 'ph-spinner spin' : 'ph-check'}`} />{busy ? '저장중' : `${rows.length}건 적용`}
            </button>
          </div>
        </div>
      )}

      {/* 미리보기 그리드 */}
      <div className="flex-1 min-h-0">
        {rows.length > 0 ? (
          <JpkGrid<Row>
            ref={gridRef as Ref<JpkGridApi<Row>>}
            columnDefs={cols}
            rowData={rows}
            getRowId={(d) => String(d._idx)}
            storageKey={`jpk.grid.fund.${tab}`}
          />
        ) : (
          <div className="flex items-center justify-center gap-2 text-text-muted" style={{ height: '100%' }}>
            <i className="ph ph-file-csv text-[24px]" />
            <span>CSV 파일을 업로드하면 여기에 미리보기가 표시됩니다</span>
          </div>
        )}
      </div>
    </div>
  );
}
