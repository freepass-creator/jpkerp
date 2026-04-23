'use client';

import { useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { ref as rtdbRef, push, set, serverTimestamp } from 'firebase/database';
import { getRtdb } from '@/lib/firebase/rtdb';
import { uploadFiles } from '@/lib/firebase/storage';
import { CarNumberPicker } from '@/components/form/car-number-picker';
import { useAuth } from '@/lib/auth/context';
import { useSaveStore } from '@/lib/hooks/useSaveStatus';
import { sanitizeCarNumber } from '@/lib/format-input';
import { useRecentCars } from '@/lib/hooks/useRecentCars';
import { useAssetByCar, useContractByCar } from '@/lib/hooks/useLookups';
import { resizeImages } from '@/lib/image-resize';

interface PreviewItem {
  file: File;
  url: string;
}

const MAX_FILES = 10;

// 현장 업로드 카테고리 — 출고·반납·상품화·업로드 4종
const KINDS = [
  { k: 'delivery', label: '출고',   icon: 'ph-truck',             tint: 'var(--c-success)' },
  { k: 'return',   label: '반납',   icon: 'ph-arrow-u-down-left', tint: 'var(--c-info)' },
  { k: 'product',  label: '상품화', icon: 'ph-sparkle',           tint: 'var(--c-primary)' },
  { k: 'other',    label: '업로드', icon: 'ph-paperclip',         tint: 'var(--c-text-sub)' },
] as const;
type Kind = typeof KINDS[number]['k'];

export default function MobileUpload() {
  const { user } = useAuth();
  const [carNumber, setCarNumber] = useState('');
  const [kind, setKind] = useState<Kind | null>(null);
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [detecting, setDetecting] = useState(false);
  // OCR 감지 결과 — 사용자 확인 전 후보로 보여줌
  const [detected, setDetected] = useState<string | null>(null);

  const recent = useRecentCars();
  const cn = useMemo(() => sanitizeCarNumber(carNumber), [carNumber]);
  const matchedAsset = useAssetByCar(cn);
  const matchedContract = useContractByCar(cn, { activeOnly: true, requireContractor: true });

  // 계약 상태 pill — 실제 contract_status 노출, 없으면 휴차
  const statusLabel = matchedContract?.contract_status ?? (matchedAsset ? '휴차' : '—');
  const statusTone: 'success' | 'warn' | 'danger' | 'neutral' =
    statusLabel === '계약진행' ? 'success'
    : statusLabel === '계약해지' ? 'danger'
    : statusLabel === '휴차' ? 'warn'
    : 'neutral';

  const match = cn ? { cn, asset: matchedAsset, contract: matchedContract } : null;
  const hasCar = !!match;

  // 차량번호 자동 감지 — 첫 파일(이미지/PDF) Gemini OCR → 후보로 저장, 사용자 확인 후 반영
  const detectPlate = useCallback(async (file: File) => {
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';
    if (!isImage && !isPdf) return;
    setDetecting(true);
    try {
      const fd = new FormData();
      fd.append('type', 'plate');
      fd.append('file', file);
      const res = await fetch('/api/ocr/extract', { method: 'POST', body: fd });
      const json = await res.json();
      const plate = sanitizeCarNumber(json?.extracted?.car_number ?? '');
      const confidence = String(json?.extracted?.confidence ?? 'low');
      if (plate && confidence !== 'low') {
        setDetected(plate);
      }
    } catch {
      // 실패해도 사용자 수동 선택으로 진행
    } finally {
      setDetecting(false);
    }
  }, []);

  const onPick = useCallback((files: FileList | null, pickedKind: Kind = 'delivery') => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    setItems((prev) => {
      const remaining = MAX_FILES - prev.length;
      if (remaining <= 0) { toast.error(`최대 ${MAX_FILES}장까지`); return prev; }
      const add = arr.slice(0, remaining).map((file) => ({ file, url: URL.createObjectURL(file) }));
      if (arr.length > remaining) toast.warning(`${remaining}장만 추가됨 (최대 ${MAX_FILES})`);
      // 첫 등장시 kind 기본값 세팅 + OCR 감지 (차량 미입력일 때만)
      if (prev.length === 0) {
        if (!kind) setKind(pickedKind);
        if (!carNumber) {
          const ocrTarget = add.find((i) =>
            i.file.type.startsWith('image/') || i.file.type === 'application/pdf'
          );
          if (ocrTarget) detectPlate(ocrTarget.file);
        }
      }
      return [...prev, ...add];
    });
  }, [carNumber, kind, detectPlate]);

  const removeItem = useCallback((idx: number) => {
    setItems((prev) => {
      URL.revokeObjectURL(prev[idx].url);
      return prev.filter((_, i) => i !== idx);
    });
  }, []);

  const reset = useCallback(() => {
    items.forEach((i) => URL.revokeObjectURL(i.url));
    setItems([]);
    setCarNumber('');
    setKind(null);
    setDetected(null);
  }, [items]);

  const submit = useCallback(async () => {
    const cn = sanitizeCarNumber(carNumber);
    if (items.length === 0) { toast.error('사진·파일을 선택하세요'); return; }
    // '업로드(other)' 외엔 차량번호 필수
    const requiresCar = kind !== 'other';
    if (requiresCar && !cn) { toast.error('차량번호를 입력하세요'); return; }

    setBusy(true);
    const store = useSaveStore.getState();
    store.begin('업로드 중');
    try {
      const basePath = cn ? `mobile_uploads/${cn}` : 'mobile_uploads/_no_car';
      // 이미지만 리사이징 (2048px·JPEG 0.85) — 비이미지는 원본 유지
      const prepared = await resizeImages(items.map((i) => i.file));
      const urls = await uploadFiles(basePath, prepared);

      const db = getRtdb();
      const ref = push(rtdbRef(db, 'mobile_uploads'));
      await set(ref, {
        car_number: cn || null,
        partner_code: match?.asset?.partner_code ?? null,
        kind,
        file_urls: urls,
        file_count: urls.length,
        uploader_uid: user?.uid ?? null,
        uploader_name: user?.displayName ?? user?.email ?? null,
        device: 'mobile',
        status: 'pending',
        created_at: serverTimestamp(),
      });
      if (cn) recent.push(cn);
      store.success('업로드 완료');
      toast.success(`${urls.length}장 업로드 완료`);
      reset();
    } catch (err) {
      store.fail((err as Error).message);
      toast.error(`업로드 실패: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [carNumber, items, kind, user, match, recent, reset]);

  // 단계 판정 — 진행형 노출
  const noFiles = items.length === 0;
  const canSubmit = !noFiles && (hasCar || kind === 'other');

  return (
    <>
      {/* 메인 영역 — 하단 dock(차량검색)+submit+tabbar 높이 확보 */}
      <div className="m-up-scroll">
        {/* Step 0: 파일 선택 전 — 큰 업로드 버튼 하나 */}
        {noFiles ? (
          <div className="m-up-empty-hint">
            <i className="ph ph-arrow-down" />
            <span>아래 <b>사진</b> 또는 <b>파일</b> 을 눌러 업로드 시작</span>
          </div>
        ) : (
          <>
            <div className="m-up-count">
              <b>{items.length}개</b> 선택됨
            </div>

            {/* 작은 썸네일 스크롤 리스트 */}
            <div className="m-up-thumbs-mini">
              {items.map((it, idx) => (
                <div key={idx} className="m-up-thumb-mini">
                  {it.file.type.startsWith('image/') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.url} alt="" />
                  ) : (
                    <div className="m-up-thumb-file"><i className="ph ph-file-pdf" /></div>
                  )}
                  <button type="button" onClick={() => removeItem(idx)} className="m-up-thumb-del-mini" aria-label="삭제">
                    <i className="ph ph-x" />
                  </button>
                </div>
              ))}
            </div>

            {/* 감지 중 / 감지 후보 안내 */}
            {!hasCar && (
              detecting ? (
                <div className="m-up-prompt">
                  <i className="ph ph-spinner spin" />
                  <span>사진에서 <b>차량번호</b> 자동인식 중…</span>
                </div>
              ) : detected ? (
                <div className="m-up-detect">
                  <div className="m-up-detect-head">
                    <i className="ph-fill ph-sparkle" />
                    <span>자동 감지된 차량번호</span>
                  </div>
                  <div className="m-up-detect-plate">{detected}</div>
                  <div className="m-up-detect-actions">
                    <button type="button" className="m-up-detect-cancel" onClick={() => setDetected(null)}>
                      <i className="ph ph-x" /> 아니요
                    </button>
                    <button
                      type="button"
                      className="m-up-detect-ok"
                      onClick={() => { setCarNumber(detected); setDetected(null); }}
                    >
                      <i className="ph ph-check" /> 이 차량 맞아요
                    </button>
                  </div>
                </div>
              ) : (
                <div className="m-up-prompt">
                  <i className="ph-fill ph-arrow-down" />
                  <span>아래에서 <b>차량번호</b>를 선택하세요</span>
                </div>
              )
            )}

            {/* 차량 확정 후 — 카드 (매칭 성공/실패 모두) */}
            {hasCar && matchedAsset && (
              <div className="m-up-car">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="m-up-car-head">
                    <span className="m-up-car-num">{matchedAsset.car_number}</span>
                    <span className={`jpk-pill tone-${statusTone}`}>{statusLabel}</span>
                  </div>
                  <dl className="m-up-car-rows">
                    {matchedAsset.partner_code && (
                      <div><dt>회원사</dt><dd>{matchedAsset.partner_code}</dd></div>
                    )}
                    <div>
                      <dt>세부모델</dt>
                      <dd>
                        {[matchedAsset.manufacturer, matchedAsset.detail_model ?? matchedAsset.car_model, matchedAsset.car_year]
                          .filter(Boolean).join(' ') || '—'}
                      </dd>
                    </div>
                    {matchedContract?.contractor_name && (
                      <div>
                        <dt>계약자</dt>
                        <dd>{matchedContract.contractor_name}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              </div>
            )}
            {hasCar && !matchedAsset && (
              <div className="m-up-car m-up-car--warn">
                <i className="ph-fill ph-warning-circle" style={{ fontSize: 20, color: 'var(--c-warn)' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="m-up-car-num">{match!.cn}</div>
                  <div className="text-xs text-warn">등록되지 않은 차량 · 업로드 후 관리자 등록</div>
                </div>
              </div>
            )}

          </>
        )}
      </div>

      {/* ── 하단 dock — 위↓: 업로드 / 차량검색 / 사진·파일 picker (최하단 고정) ── */}
      <div className="m-up-dock">
        {canSubmit && (
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="m-up-submit-btn"
          >
            <i className={`ph ${busy ? 'ph-spinner spin' : 'ph-cloud-arrow-up'}`} />
            {busy ? '업로드 중' : `${items.length}장 업로드`}
          </button>
        )}
        {!noFiles && !hasCar && !detected && !detecting && (
          <>
            {recent.list.length > 0 && (
              <div className="m-up-dock-recent">
                <span className="text-2xs text-text-muted">최근</span>
                {recent.list.slice(0, 8).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCarNumber(c)}
                    className={`m-up-chip ${carNumber === c ? 'is-active' : ''}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
            <div className="m-picker m-up-dock-search">
              <CarNumberPicker
                value={carNumber}
                onChange={(v) => { setCarNumber(v); setDetected(null); }}
                placeholder="차량번호·회원사·모델 검색"
                showCreate={false}
                dropUp
                showAllOnEmpty
                limit={50}
              />
            </div>
          </>
        )}
        {/* 최하단: 파일 · 사진 picker — 좌=파일(업로드), 우=사진(출고 기본) */}
        <div className="m-up-pickers">
          <label className="m-up-pick-btn">
            <input
              type="file"
              accept="application/pdf,.doc,.docx,.xls,.xlsx,.hwp,.hwpx"
              multiple
              hidden
              onChange={(e) => { onPick(e.target.files, 'other'); e.target.value = ''; }}
            />
            <i className="ph-fill ph-file-text" />
            <span>파일</span>
          </label>
          <label className="m-up-pick-btn">
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              hidden
              onChange={(e) => { onPick(e.target.files, 'delivery'); e.target.value = ''; }}
            />
            <i className="ph-fill ph-images" />
            <span>사진</span>
          </label>
        </div>
      </div>
    </>
  );
}
