'use client';

import { useRtdbCollection } from '@/lib/collections/rtdb';
import { ocrFile } from '@/lib/ocr';
import { detectPenalty, parsePenalty } from '@/lib/parsers/penalty';
import { downloadPenaltyMergedPdf } from '@/lib/penalty-pdf';
import type { RtdbAsset, RtdbContract } from '@/lib/types/rtdb-entities';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { usePenaltyStore } from '../penalty-notice-store';

/**
 * 과태료작업 — Panel2에는 업로드 UI만, 매칭 결과 Grid는 Panel3(이력관리 패널 자리)에 표시.
 */
export function PenaltyNoticeForm() {
  const assets = useRtdbCollection<RtdbAsset>('assets');
  const contracts = useRtdbCollection<RtdbContract>('contracts');
  const { add, setBusy, busy, items } = usePenaltyStore();

  const fileToDataUrl = (f: File) =>
    new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = rej;
      r.readAsDataURL(f);
    });

  // biome-ignore lint/correctness/useExhaustiveDependencies: fileToDataUrl 컴포넌트 내 안정 함수
  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      setBusy(true);
      try {
        for (const file of Array.from(files)) {
          toast.info(`OCR 중: ${file.name}`);
          try {
            const { text } = await ocrFile(file);
            const dataUrl = await fileToDataUrl(file);

            // 페이지별 분리 — 각 페이지가 독립 고지서
            const pages = text
              .split(/---\s*페이지 구분\s*---/)
              .map((t) => t.trim())
              .filter(Boolean);

            let added = 0;
            for (let pi = 0; pi < pages.length; pi++) {
              const pageText = pages[pi];
              const pageLines = pageText
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean);

              // 과태료/통행료 관련 키워드가 없는 페이지는 스킵 (빈 페이지, 안내문 등)
              if (!detectPenalty(pageText)) continue;

              const parsed = parsePenalty(pageText, pageLines);
              const id = `p${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${pi}`;
              const asset = assets.data.find((a) => a.car_number === parsed.car_number) ?? null;
              const contract =
                contracts.data.find(
                  (c) =>
                    c.car_number === parsed.car_number &&
                    c.status !== 'deleted' &&
                    c.contractor_name?.trim(),
                ) ?? null;
              const ok = add({
                ...parsed,
                id,
                fileName: pages.length > 1 ? `${file.name} (p${pi + 1})` : file.name,
                fileDataUrl: dataUrl,
                fileSize: file.size,
                pageNumber: pi + 1,
                _asset: asset,
                _contract: contract,
                _contractor: contract?.contractor_name ?? '',
              });
              if (!ok) toast.warning(`중복: ${parsed.notice_no}`);
              else added++;
            }

            if (added > 0) toast.success(`${file.name}: ${added}건 인식`);
            else toast.info(`${file.name}: 과태료 고지서를 찾지 못했습니다`);
          } catch (err) {
            toast.error(`OCR 실패: ${file.name} — ${(err as Error).message}`);
          }
        }
      } finally {
        setBusy(false);
      }
    },
    [assets.data, contracts.data, add, setBusy],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove('is-over');
    if (e.dataTransfer.files?.length) processFiles(e.dataTransfer.files);
  };

  const totalAmount = items.reduce((s, i) => s + (i.amount || 0), 0);

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <div className="p-5 overflow-y-auto scrollbar-thin" style={{ flex: 1 }}>
        <div className="form-section">
          <div className="form-section-title">
            <i className="ph ph-receipt" />
            과태료 · 통행료 고지서 OCR
            <span className="text-text-muted text-2xs" style={{ marginLeft: 8, fontWeight: 500 }}>
              고지서 업로드 → 우측 매칭 결과에서 처리완료
            </span>
          </div>

          <label
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.classList.add('is-over');
            }}
            onDragLeave={(e) => e.currentTarget.classList.remove('is-over')}
            onDrop={onDrop}
            className="jpk-uploader-drop"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
          >
            <input
              type="file"
              multiple
              accept="application/pdf,image/*"
              hidden
              onChange={(e) => e.target.files && processFiles(e.target.files)}
            />
            <i className="ph ph-file-arrow-up text-[24px]" />
            <div className="text-base" style={{ fontWeight: 600 }}>
              고지서 파일 업로드 (드래그 또는 클릭)
            </div>
            <div className="text-2xs text-text-muted">PDF · PNG · JPG · HEIC</div>
            {busy && <div className="text-2xs text-primary">OCR 진행 중...</div>}
          </label>
        </div>

        {items.length > 0 &&
          (() => {
            const matched = items.filter((i) => !!i._contract).length;
            const unmatched = items.length - matched;
            const dupes =
              items.length - new Set(items.map((i) => i.notice_no).filter(Boolean)).size;
            const carCount = new Set(items.map((i) => i.car_number).filter(Boolean)).size;
            const byCompany = new Map<string, number>();
            for (const it of items) {
              const code = it._asset?.partner_code ?? it._contract?.partner_code ?? '미지정';
              byCompany.set(code, (byCompany.get(code) ?? 0) + 1);
            }
            const companyList = [...byCompany.entries()].sort((a, b) => b[1] - a[1]);
            return (
              <div className="form-section">
                <div className="form-section-title">
                  <i className="ph ph-info" />
                  현황
                </div>
                <div
                  className="text-xs"
                  style={{
                    padding: 12,
                    background: 'var(--c-bg-sub)',
                    border: '1px solid var(--c-border)',
                    borderRadius: 2,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div className="form-row" style={{ gap: 16 }}>
                    <span>
                      대기 <b className="text-text">{items.length}건</b>
                    </span>
                    <span>
                      합계 <b className="text-text">{totalAmount.toLocaleString()}원</b>
                    </span>
                    <span>
                      차량 <b className="text-text">{carCount}대</b>
                    </span>
                  </div>
                  <div className="form-row" style={{ gap: 16 }}>
                    <span>
                      매칭 <b className="text-success">{matched}건</b>
                    </span>
                    {unmatched > 0 && (
                      <span>
                        미매칭 <b className="text-danger">{unmatched}건</b>
                      </span>
                    )}
                    {dupes > 0 && (
                      <span>
                        중복 <b className="text-warn">{dupes}건</b>
                      </span>
                    )}
                  </div>
                  {companyList.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                      {companyList.map(([code, cnt]) => (
                        <button
                          key={code}
                          type="button"
                          className="text-xs"
                          onClick={async () => {
                            const filtered = items.filter(
                              (i) =>
                                (i._asset?.partner_code ??
                                  i._contract?.partner_code ??
                                  '미지정') === code,
                            );
                            toast.info(`${code} ${filtered.length}건 통합 PDF 생성 중...`);
                            try {
                              await downloadPenaltyMergedPdf(filtered);
                              toast.success(`${code} ${filtered.length}건 다운로드 완료`);
                            } catch (err) {
                              toast.error(`다운로드 실패: ${(err as Error).message}`);
                            }
                          }}
                          style={{
                            padding: '2px 8px',
                            border: '1px solid var(--c-border)',
                            borderRadius: 2,
                            background: 'var(--c-surface)',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}
                          title={`${code} ${cnt}건 통합 PDF 다운로드`}
                        >
                          <i className="ph ph-download-simple" style={{ marginRight: 4 }} />
                          {code} <b>{cnt}건</b>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
      </div>
    </div>
  );
}
