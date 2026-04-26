'use client';

/**
 * 과태료 일괄 도구 (Phase 9 → Phase 13 wire-up)
 *  - OCR 단계: 사진/PDF 다중 업로드 → Vision OCR + parsePenalty
 *  - 매칭 단계: 위반일자 기준 활성 계약 자동 매칭
 *  - PDF 생성: 변경공문 + 고지서 사본 + 계약사실확인서 → ZIP 다운로드
 *  - 처리 완료: events/penalty 푸시
 */

import type { PenaltyWorkItem } from '@/app/(workspace)/input/operation/penalty-notice-store';
import { useAuth } from '@/lib/auth/context';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import { computeContractEnd } from '@/lib/date-utils';
import { saveEvent } from '@/lib/firebase/events';
import { ocrFile } from '@/lib/ocr';
import { detectPenalty, parsePenalty } from '@/lib/parsers/penalty';
import { downloadPenaltyMergedPdf } from '@/lib/penalty-pdf';
import type { RtdbAsset, RtdbContract } from '@/lib/types/rtdb-entities';
import { fmt } from '@/lib/utils';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

type ProcStatus = 'pending' | 'ocring' | 'ok' | 'fail';

interface PenaltyItem {
  id: string;
  fileName: string;
  fileSize: number;
  fileDataUrl?: string;
  pageNumber?: number;
  status: ProcStatus;
  car_number?: string;
  violate_date?: string;
  violate_type?: string;
  amount?: number;
  notice_no?: string;
  matched_contract?: string;
  matched_contractor?: string;
  matched_partner?: string;
  asset?: RtdbAsset;
  contract?: RtdbContract;
  raw?: ReturnType<typeof parsePenalty>;
  error?: string;
  generated?: boolean;
  saved?: boolean;
  saving?: boolean;
}

const fileToDataUrl = (f: File): Promise<string> =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(f);
  });

export function PenaltyBatchTool() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<PenaltyItem[]>([]);
  const [busy, setBusy] = useState(false);
  const contracts = useRtdbCollection<RtdbContract>('contracts');
  const assets = useRtdbCollection<RtdbAsset>('assets');
  const { user } = useAuth();

  const summary = useMemo(() => {
    const total = items.length;
    const ok = items.filter((i) => i.status === 'ok').length;
    const fail = items.filter((i) => i.status === 'fail').length;
    const matched = items.filter((i) => Boolean(i.matched_contract)).length;
    const saved = items.filter((i) => i.saved).length;
    const sumAmount = items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    return { total, ok, fail, matched, saved, sumAmount };
  }, [items]);

  const onPick = () => fileRef.current?.click();

  const matchOne = (
    car: string | undefined,
    violateDate: string | undefined,
  ): { contract?: RtdbContract; asset?: RtdbAsset } => {
    if (!car) return {};
    const asset = assets.data.find((a) => a.car_number === car);
    if (!violateDate) return { asset };
    const candidates = contracts.data.filter((c) => c.car_number === car);
    const contract =
      candidates.find((c) => {
        if (!c.start_date) return false;
        const end = computeContractEnd(c) ?? '9999-12-31';
        const d = violateDate.slice(0, 10);
        return c.start_date.slice(0, 10) <= d && d <= end.slice(0, 10);
      }) ?? candidates.find((c) => Boolean(c.contractor_name?.trim()));
    return { contract, asset };
  };

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);

    try {
      for (const f of Array.from(files)) {
        const baseId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const placeholderId = `${baseId}-${f.name}`;
        const placeholder: PenaltyItem = {
          id: placeholderId,
          fileName: f.name,
          fileSize: f.size,
          status: 'ocring',
        };
        setItems((prev) => [...prev, placeholder]);

        try {
          const [{ text }, dataUrl] = await Promise.all([ocrFile(f), fileToDataUrl(f)]);
          const pages = text
            .split(/---\s*페이지 구분\s*---/)
            .map((t) => t.trim())
            .filter(Boolean);

          const recognized: PenaltyItem[] = [];
          for (let pi = 0; pi < pages.length; pi++) {
            const pageText = pages[pi];
            if (!detectPenalty(pageText)) continue;
            const lines = pageText
              .split('\n')
              .map((l) => l.trim())
              .filter(Boolean);
            const parsed = parsePenalty(pageText, lines);
            const { contract, asset } = matchOne(parsed.car_number, parsed.date);
            recognized.push({
              id: `${baseId}-p${pi}`,
              fileName: pages.length > 1 ? `${f.name} (p${pi + 1})` : f.name,
              fileSize: f.size,
              fileDataUrl: dataUrl,
              pageNumber: pi + 1,
              status: 'ok',
              car_number: parsed.car_number || undefined,
              violate_date: parsed.date || undefined,
              violate_type: parsed.doc_type || undefined,
              amount: parsed.amount || undefined,
              notice_no: parsed.notice_no || undefined,
              matched_contract: contract?.contract_code,
              matched_contractor: contract?.contractor_name,
              matched_partner: asset?.partner_code ?? contract?.partner_code,
              asset,
              contract,
              raw: parsed,
            });
          }

          setItems((prev) => {
            const without = prev.filter((p) => p.id !== placeholderId);
            if (recognized.length === 0) {
              return [
                ...without,
                {
                  ...placeholder,
                  status: 'fail',
                  error: '과태료 고지서 인식 실패',
                },
              ];
            }
            return [...without, ...recognized];
          });

          if (recognized.length > 0) {
            toast.success(`${f.name}: ${recognized.length}건 인식`);
          } else {
            toast.warning(`${f.name}: 과태료 고지서를 찾지 못했습니다`);
          }
        } catch (err) {
          const msg = (err as Error).message ?? 'OCR 실패';
          setItems((prev) =>
            prev.map((p) => (p.id === placeholderId ? { ...p, status: 'fail', error: msg } : p)),
          );
          toast.error(`OCR 실패: ${f.name} — ${msg}`);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  // 매칭 재실행 (수동)
  const onMatch = () => {
    setItems((prev) =>
      prev.map((p) => {
        if (!p.car_number) return p;
        const { contract, asset } = matchOne(p.car_number, p.violate_date);
        return {
          ...p,
          asset,
          contract,
          matched_contract: contract?.contract_code,
          matched_contractor: contract?.contractor_name,
          matched_partner: asset?.partner_code ?? contract?.partner_code,
        };
      }),
    );
    toast.info('계약 매칭 재실행');
  };

  const buildWorkItems = (target: PenaltyItem[]): PenaltyWorkItem[] =>
    target
      .filter((p) => p.status === 'ok' && p.fileDataUrl && p.raw)
      .map((p) => ({
        ...(p.raw as ReturnType<typeof parsePenalty>),
        id: p.id,
        fileName: p.fileName,
        fileDataUrl: p.fileDataUrl ?? '',
        fileSize: p.fileSize,
        pageNumber: p.pageNumber,
        _asset: p.asset ?? null,
        _contract: p.contract ?? null,
        _contractor: p.contract?.contractor_name ?? '',
      }));

  // PDF 통합 다운로드 (모든 고지서를 한 PDF로 — 3페이지 × N건)
  const onDownloadMergedPdf = async () => {
    const work = buildWorkItems(items);
    if (work.length === 0) {
      toast.warning('처리할 고지서가 없습니다');
      return;
    }
    setBusy(true);
    try {
      toast.info(`${work.length}건 통합 PDF 생성 중...`);
      await downloadPenaltyMergedPdf(work);
      setItems((prev) =>
        prev.map((p) => (work.some((w) => w.id === p.id) ? { ...p, generated: true } : p)),
      );
      toast.success(`${work.length}건 통합 PDF 다운로드 완료`);
    } catch (err) {
      toast.error(`다운로드 실패: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  // 처리완료 — events에 penalty push
  const onCompleteAll = async () => {
    const target = items.filter((p) => p.status === 'ok' && !p.saved);
    if (target.length === 0) {
      toast.warning('처리할 항목이 없습니다');
      return;
    }
    setBusy(true);
    let saved = 0;
    let failed = 0;
    try {
      for (const it of target) {
        setItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, saving: true } : p)));
        try {
          const r = it.raw;
          await saveEvent({
            type: 'penalty',
            doc_type: r?.doc_type,
            car_number: it.car_number,
            date: it.violate_date,
            title: r?.description || it.violate_type || '과태료',
            penalty_amount: r?.penalty_amount,
            fine_amount: r?.fine_amount,
            demerit_points: r?.demerit_points,
            toll_amount: r?.toll_amount,
            amount: it.amount,
            location: r?.location,
            description: r?.description,
            law_article: r?.law_article,
            due_date: r?.due_date,
            notice_no: it.notice_no,
            issuer: r?.issuer,
            issue_date: r?.issue_date,
            payer_name: r?.payer_name,
            pay_account: r?.pay_account,
            customer_name: it.contract?.contractor_name,
            customer_phone: it.contract?.contractor_phone,
            contract_code: it.contract?.contract_code,
            partner_code: it.matched_partner,
            paid_status: '미납',
            direction: 'out',
            handler_uid: user?.uid,
            handler: user?.displayName ?? user?.email ?? undefined,
            note: `과태료 일괄도구 (${it.fileName})`,
          });
          setItems((prev) =>
            prev.map((p) => (p.id === it.id ? { ...p, saving: false, saved: true } : p)),
          );
          saved += 1;
        } catch (err) {
          setItems((prev) =>
            prev.map((p) =>
              p.id === it.id ? { ...p, saving: false, error: (err as Error).message } : p,
            ),
          );
          failed += 1;
        }
      }
      if (saved > 0) toast.success(`${saved}건 처리완료`);
      if (failed > 0) toast.error(`${failed}건 저장 실패`);
    } finally {
      setBusy(false);
    }
  };

  const onClear = () => setItems([]);
  const onRemove = (id: string) => setItems((prev) => prev.filter((p) => p.id !== id));

  const allMatched =
    items.length > 0 &&
    items.filter((i) => i.status === 'ok').every((i) => Boolean(i.matched_contract));
  const hasAny = items.length > 0;
  const hasOk = items.some((p) => p.status === 'ok');

  return (
    <div className="penalty-tool">
      <div className="penalty-steps">
        <Step n={1} label="사진 업로드 → OCR" active={!hasAny} done={hasAny} />
        <Step n={2} label="활성 계약 매칭" active={hasAny && !allMatched} done={allMatched} />
        <Step n={3} label="PDF 3종 + 처리완료" active={allMatched} done={false} />
      </div>

      <div className="penalty-uploader">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="visually-hidden"
          onChange={(e) => {
            void onFiles(e.target.files);
            if (fileRef.current) fileRef.current.value = '';
          }}
        />
        <button type="button" className="penalty-pick" onClick={onPick} disabled={busy}>
          <i className="ph ph-upload-simple" />
          과태료 고지서 사진 다중 업로드
        </button>
        <div className="penalty-tip">
          JPG·PNG·PDF · OCR로 차량번호·위반일자·금액·통지번호 자동 추출
        </div>
        <div className="penalty-actions">
          <button type="button" className="m-btn" onClick={onMatch} disabled={!hasOk || busy}>
            <i className="ph ph-link" /> 계약 매칭
          </button>
          <button
            type="button"
            className="m-btn"
            onClick={onDownloadMergedPdf}
            disabled={!hasOk || busy}
            title="변경공문 + 고지서사본 + 계약사실확인서 (전체 1 PDF)"
          >
            <i className="ph ph-download-simple" /> 통합 PDF 다운로드
          </button>
          <button
            type="button"
            className="m-btn is-primary"
            onClick={onCompleteAll}
            disabled={!hasOk || busy}
          >
            <i className="ph ph-check-circle" /> 처리완료 (events 저장)
          </button>
          <button
            type="button"
            className="m-btn ml-auto"
            onClick={onClear}
            disabled={!hasAny || busy}
          >
            <i className="ph ph-trash" /> 전체 삭제
          </button>
        </div>
      </div>

      <div className="v3-table-wrap">
        {items.length === 0 ? (
          <div className="penalty-empty">
            <i className="ph ph-image-square" />
            업로드된 고지서가 없습니다. 위 버튼으로 사진을 추가하세요.
          </div>
        ) : (
          <table className="penalty-table">
            <colgroup>
              <col style={{ width: 28 }} />
              <col />
              <col style={{ width: 96 }} />
              <col style={{ width: 112 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 180 }} />
              <col style={{ width: 80 }} />
              <col style={{ width: 40 }} />
            </colgroup>
            <thead>
              <tr>
                <th>#</th>
                <th className="left">파일</th>
                <th>차량번호</th>
                <th>위반일자</th>
                <th>위반</th>
                <th className="right">금액</th>
                <th>통지번호</th>
                <th className="left">매칭계약</th>
                <th>상태</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((p, i) => (
                <tr key={p.id}>
                  <td>{i + 1}</td>
                  <td className="left">
                    <StatusDot s={p.status} />
                    <span className="file-name" title={p.error}>
                      {p.fileName}
                      {p.error && (
                        <span style={{ marginLeft: 6, color: 'var(--c-err)' }}>· {p.error}</span>
                      )}
                    </span>
                  </td>
                  <td>{p.car_number ?? '—'}</td>
                  <td>{p.violate_date ?? '—'}</td>
                  <td>{p.violate_type ?? '—'}</td>
                  <td className="right">{p.amount ? fmt(p.amount) : '—'}</td>
                  <td>{p.notice_no ?? '—'}</td>
                  <td className="left">
                    {p.matched_contract ? (
                      <>
                        <span className="matched-code">{p.matched_contract}</span>{' '}
                        <span className="matched-name">{p.matched_contractor ?? ''}</span>
                      </>
                    ) : (
                      <span className="matched-empty">매칭 전</span>
                    )}
                  </td>
                  <td>
                    {p.saved ? (
                      <span style={{ color: 'var(--c-ok)' }}>저장됨</span>
                    ) : p.saving ? (
                      <i className="ph ph-spinner spin" />
                    ) : p.generated ? (
                      <span style={{ color: 'var(--c-text-sub)' }}>PDF</span>
                    ) : (
                      <span style={{ color: 'var(--c-text-muted)' }}>—</span>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="row-del"
                      onClick={() => onRemove(p.id)}
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
          총 {summary.total}건<span className="sep">│</span>
          OCR 성공 {summary.ok}
          {summary.fail > 0 && (
            <>
              <span className="sep">│</span>
              <span className="err">실패 {summary.fail}</span>
            </>
          )}
          <span className="sep">│</span>
          매칭 {summary.matched}
          <span className="sep">│</span>
          처리완료 {summary.saved}
          <span className="sep">│</span>
          금액 {fmt(summary.sumAmount)}원
        </div>
        <div className="muted-note">OCR 후 매칭·PDF 생성·events 저장까지 자동</div>
      </div>
    </div>
  );
}

/* ── helpers ── */

function Step({
  n,
  label,
  active,
  done,
}: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className={`penalty-step ${active ? 'is-active' : ''} ${done ? 'is-done' : ''}`}>
      <span className="n">{done ? <i className="ph ph-check" /> : n}</span>
      <span className="lbl">{label}</span>
    </div>
  );
}

function StatusDot({ s }: { s: ProcStatus }) {
  if (s === 'ocring') return <i className="ph ph-spinner spin penalty-status-spin" />;
  const cls = s === 'ok' ? 'ok' : s === 'fail' ? 'fail' : 'pending';
  return <span className={`penalty-status-dot ${cls}`} />;
}
