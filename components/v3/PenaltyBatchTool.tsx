'use client';

/**
 * 과태료 일괄 도구 (Phase 9)
 *  - OCR 단계: 사진 다중 업로드 → 각 OCR 결과 (차번/일자/위반/금액/통지번호)
 *  - 매칭 단계: 위반일자 기준 활성 계약 자동 매칭
 *  - PDF 생성: 매 건당 3종 (고지서 사본 + 계약사실확인서 + 변경요청공문)
 *
 * 실제 OCR/PDF 호출은 stubbed (서버 엔드포인트 미구현 상태).
 * 디자인은 v3 placeholder UI로 그대로 동작 가능.
 */

import { useMemo, useRef, useState } from 'react';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import type { RtdbContract } from '@/lib/types/rtdb-entities';
import { computeContractEnd } from '@/lib/date-utils';
import { fmt } from '@/lib/utils';

type ProcStatus = 'pending' | 'ocring' | 'ok' | 'fail';
type DocKind = 'notice' | 'confirm' | 'change';

interface PenaltyItem {
  id: string;
  fileName: string;
  fileSize: number;
  status: ProcStatus;
  car_number?: string;
  violate_date?: string;
  violate_type?: string;
  amount?: number;
  notice_no?: string;
  matched_contract?: string;
  matched_contractor?: string;
  error?: string;
  generated?: Partial<Record<DocKind, boolean>>;
}

const DOC_LABELS: Record<DocKind, string> = {
  notice: '고지서 사본',
  confirm: '계약사실확인서',
  change: '변경요청공문',
};

export function PenaltyBatchTool() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<PenaltyItem[]>([]);
  const [busy, setBusy] = useState(false);
  const contracts = useRtdbCollection<RtdbContract>('contracts');

  const summary = useMemo(() => {
    const total = items.length;
    const ok = items.filter((i) => i.status === 'ok').length;
    const fail = items.filter((i) => i.status === 'fail').length;
    const matched = items.filter((i) => Boolean(i.matched_contract)).length;
    const sumAmount = items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    return { total, ok, fail, matched, sumAmount };
  }, [items]);

  const onPick = () => fileRef.current?.click();

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newItems: PenaltyItem[] = Array.from(files).map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fileName: f.name,
      fileSize: f.size,
      status: 'pending',
    }));
    setItems((prev) => [...prev, ...newItems]);

    setBusy(true);
    try {
      // 순차 OCR 호출 (rate limit 방지)
      for (const it of newItems) {
        setItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, status: 'ocring' } : p)));
        // STUB: 실제로는 /api/ocr/extract/penalty 로 multipart POST
        // 현재는 deterministic mock data 생성
        await new Promise((r) => setTimeout(r, 250));
        const mock = mockPenaltyResult(it.fileName);
        setItems((prev) =>
          prev.map((p) =>
            p.id === it.id
              ? {
                  ...p,
                  status: mock ? 'ok' : 'fail',
                  ...mock,
                  error: mock ? undefined : 'OCR 추출 실패',
                }
              : p,
          ),
        );
      }
    } finally {
      setBusy(false);
    }
  };

  // 활성 계약 매칭 — 위반일자가 계약기간 안에 있으면 매칭
  const onMatch = () => {
    setItems((prev) =>
      prev.map((p) => {
        if (!p.car_number || !p.violate_date) return p;
        const candidates = contracts.data.filter((c) => c.car_number === p.car_number);
        const hit = candidates.find((c) => {
          if (!c.start_date) return false;
          const end = computeContractEnd(c) ?? '9999-12-31';
          return c.start_date <= p.violate_date! && p.violate_date! <= end;
        });
        if (!hit) return { ...p, matched_contract: undefined, matched_contractor: undefined };
        return {
          ...p,
          matched_contract: hit.contract_code,
          matched_contractor: hit.contractor_name,
        };
      }),
    );
  };

  // PDF 생성 (stubbed)
  const onGenerate = (kind: DocKind) => {
    setItems((prev) =>
      prev.map((p) =>
        p.matched_contract
          ? { ...p, generated: { ...(p.generated ?? {}), [kind]: true } }
          : p,
      ),
    );
    // STUB: 실제로는 /api/penalty/pdf 호출 → blob → window.open
    console.info(`[stub] ${DOC_LABELS[kind]} ${items.filter((i) => i.matched_contract).length}건 생성`);
  };

  const onClear = () => setItems([]);
  const onRemove = (id: string) => setItems((prev) => prev.filter((p) => p.id !== id));

  const allMatched = items.length > 0 && items.every((i) => i.status === 'ok' && i.matched_contract);
  const hasAny = items.length > 0;

  return (
    <div className="penalty-tool">
      {/* 단계 헤더 */}
      <div className="penalty-steps">
        <Step n={1} label="사진 업로드 → OCR" active={!hasAny} done={hasAny} />
        <Step n={2} label="활성 계약 매칭" active={hasAny && !allMatched} done={allMatched} />
        <Step n={3} label="PDF 3종 생성" active={allMatched} done={false} />
      </div>

      {/* 업로드 영역 */}
      <div className="penalty-uploader">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          onChange={(e) => {
            void onFiles(e.target.files);
            if (fileRef.current) fileRef.current.value = '';
          }}
          style={{ display: 'none' }}
        />
        <button type="button" className="penalty-pick" onClick={onPick} disabled={busy}>
          <i className="ph ph-upload-simple" />
          과태료 고지서 사진 다중 업로드
        </button>
        <div className="penalty-tip">
          JPG·PNG·PDF · OCR로 차량번호·위반일자·금액·통지번호 자동 추출
        </div>
        <div className="penalty-actions">
          <button type="button" className="m-btn" onClick={onMatch} disabled={!hasAny || busy}>
            <i className="ph ph-link" /> 계약 매칭
          </button>
          <button type="button" className="m-btn" onClick={() => onGenerate('notice')} disabled={!allMatched || busy}>
            <i className="ph ph-file-text" /> 고지서 사본
          </button>
          <button type="button" className="m-btn" onClick={() => onGenerate('confirm')} disabled={!allMatched || busy}>
            <i className="ph ph-clipboard-text" /> 계약사실확인서
          </button>
          <button type="button" className="m-btn" onClick={() => onGenerate('change')} disabled={!allMatched || busy}>
            <i className="ph ph-paper-plane-tilt" /> 변경요청공문
          </button>
          <button type="button" className="m-btn" onClick={onClear} disabled={!hasAny || busy} style={{ marginLeft: 'auto' }}>
            <i className="ph ph-trash" /> 전체 삭제
          </button>
        </div>
      </div>

      {/* 결과 테이블 */}
      <div className="v3-table-wrap" style={{ marginTop: 0 }}>
        {items.length === 0 ? (
          <div style={{ padding: 32, color: 'var(--c-text-muted)', textAlign: 'center' }}>
            <i className="ph ph-image-square" style={{ fontSize: 32, display: 'block', marginBottom: 8 }} />
            업로드된 고지서가 없습니다. 위 버튼으로 사진을 추가하세요.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--c-bg-sub)', borderBottom: '1px solid var(--c-border)' }}>
                <th style={th(28)}>#</th>
                <th style={{ ...th(), textAlign: 'left' }}>파일</th>
                <th style={th(96)}>차량번호</th>
                <th style={th(112)}>위반일자</th>
                <th style={th(120)}>위반</th>
                <th style={{ ...th(100), textAlign: 'right' }}>금액</th>
                <th style={th(120)}>통지번호</th>
                <th style={{ ...th(180), textAlign: 'left' }}>매칭계약</th>
                <th style={th(120)}>PDF</th>
                <th style={th(40)}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((p, i) => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--c-border)' }}>
                  <td style={td()}>{i + 1}</td>
                  <td style={{ ...td(), textAlign: 'left' }}>
                    <StatusDot s={p.status} />
                    <span style={{ marginLeft: 6 }}>{p.fileName}</span>
                  </td>
                  <td style={td()}>{p.car_number ?? '—'}</td>
                  <td style={td()}>{p.violate_date ?? '—'}</td>
                  <td style={td()}>{p.violate_type ?? '—'}</td>
                  <td style={{ ...td(), textAlign: 'right' }}>{p.amount ? fmt(p.amount) : '—'}</td>
                  <td style={td()}>{p.notice_no ?? '—'}</td>
                  <td style={{ ...td(), textAlign: 'left' }}>
                    {p.matched_contract ? (
                      <>
                        <span style={{ fontWeight: 600 }}>{p.matched_contract}</span>{' '}
                        <span style={{ color: 'var(--c-text-muted)' }}>{p.matched_contractor ?? ''}</span>
                      </>
                    ) : (
                      <span style={{ color: 'var(--c-text-muted)' }}>매칭 전</span>
                    )}
                  </td>
                  <td style={td()}>
                    {(['notice', 'confirm', 'change'] as DocKind[]).map((k) => (
                      <span
                        key={k}
                        title={DOC_LABELS[k]}
                        style={{
                          display: 'inline-block',
                          width: 12,
                          height: 12,
                          marginRight: 3,
                          background: p.generated?.[k] ? 'var(--c-ok)' : 'var(--c-border)',
                        }}
                      />
                    ))}
                  </td>
                  <td style={td()}>
                    <button
                      type="button"
                      onClick={() => onRemove(p.id)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--c-text-muted)', cursor: 'pointer' }}
                      aria-label="삭제"
                    >
                      <i className="ph ph-x" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="v3-table-foot">
        <div>
          총 {summary.total}건
          <span className="sep">│</span>
          OCR 성공 {summary.ok}
          {summary.fail > 0 && (
            <>
              <span className="sep">│</span>
              <span style={{ color: 'var(--c-err)' }}>실패 {summary.fail}</span>
            </>
          )}
          <span className="sep">│</span>
          매칭 {summary.matched}
          <span className="sep">│</span>
          금액 {fmt(summary.sumAmount)}원
        </div>
        <div style={{ color: 'var(--c-text-muted)' }}>
          OCR·PDF 호출은 현재 stub입니다 (서버 엔드포인트 연결 예정)
        </div>
      </div>
    </div>
  );
}

/* ── helpers ── */

function Step({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className={`penalty-step ${active ? 'is-active' : ''} ${done ? 'is-done' : ''}`}>
      <span className="n">{done ? <i className="ph ph-check" /> : n}</span>
      <span className="lbl">{label}</span>
    </div>
  );
}

function StatusDot({ s }: { s: ProcStatus }) {
  const color =
    s === 'ok' ? 'var(--c-ok)' :
    s === 'ocring' ? 'var(--c-info)' :
    s === 'fail' ? 'var(--c-err)' :
    'var(--c-border)';
  if (s === 'ocring') return <i className="ph ph-spinner spin" style={{ color, fontSize: 12 }} />;
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        background: color,
        verticalAlign: 'middle',
      }}
    />
  );
}

function th(width?: number): React.CSSProperties {
  return {
    padding: '6px 8px',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--c-text-sub)',
    textAlign: 'center',
    width,
  };
}

function td(): React.CSSProperties {
  return {
    padding: '6px 8px',
    textAlign: 'center',
    color: 'var(--c-text)',
  };
}

/**
 * STUB: 실제 OCR 응답 대신 mock data 반환.
 * fileName에 차량번호/일자/금액 패턴이 보이면 추출, 아니면 더미.
 */
function mockPenaltyResult(fileName: string): Partial<PenaltyItem> | null {
  // 파일명 기반 best-effort: "12가3456_2026-04-22_4만.jpg" 같은 케이스
  const car = fileName.match(/(\d{2,3}[가-힣]\d{4})/)?.[1];
  const date = fileName.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
  // 무작위 시드 — fileName 길이 기반 deterministic
  const seed = fileName.length;
  const types = ['속도위반', '주정차위반', '신호위반', '전용차로위반'];
  const amounts = [40000, 60000, 70000, 80000];
  return {
    car_number: car ?? `12가${(1000 + (seed * 31) % 9000).toString().slice(0, 4)}`,
    violate_date: date ?? new Date(Date.now() - seed * 86400000).toISOString().slice(0, 10),
    violate_type: types[seed % types.length],
    amount: amounts[seed % amounts.length],
    notice_no: `2026-${(seed * 1234).toString().slice(0, 6)}`,
  };
}
