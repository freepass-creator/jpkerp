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
  const [kind, setKind] = useState<Kind>('delivery');
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [busy, setBusy] = useState(false);

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

  const onPick = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    setItems((prev) => {
      const remaining = MAX_FILES - prev.length;
      if (remaining <= 0) { toast.error(`최대 ${MAX_FILES}장까지`); return prev; }
      const add = arr.slice(0, remaining).map((file) => ({ file, url: URL.createObjectURL(file) }));
      if (arr.length > remaining) toast.warning(`${remaining}장만 추가됨 (최대 ${MAX_FILES})`);
      return [...prev, ...add];
    });
  }, []);

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
    setKind('delivery');
  }, [items]);

  const submit = useCallback(async () => {
    const cn = sanitizeCarNumber(carNumber);
    // 출고·반납·상품화는 차량번호 필수. '업로드(other)'는 차량 없이 가능
    const requiresCar = kind !== 'other';
    if (requiresCar && !cn) { toast.error('차량번호를 선택하세요'); return; }
    if (items.length === 0) { toast.error('사진을 1장 이상 선택하세요'); return; }

    setBusy(true);
    const store = useSaveStore.getState();
    store.begin('업로드 중');
    try {
      const basePath = cn ? `mobile_uploads/${cn}` : 'mobile_uploads/_no_car';
      const urls = await uploadFiles(basePath, items.map((i) => i.file));

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

  return (
    <>
      {/* 메인 영역 — 하단 dock(차량검색)+submit+tabbar 높이 확보 */}
      <div className="m-up-scroll">
        {/* ① 차량 카드 — 항상 상단 표시 */}
        {!hasCar ? (
          <div className="m-up-empty">
            <i className="ph ph-car" />
            <div className="m-up-empty-text">
              아래에서 <b>차량번호</b>를 선택하세요
            </div>
          </div>
        ) : !matchedAsset ? (
          <div className="m-up-car m-up-car--warn">
            <i className="ph-fill ph-warning-circle" style={{ fontSize: 20, color: 'var(--c-warn)' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="m-up-car-num">{match!.cn}</div>
              <div className="text-xs text-warn">등록되지 않은 차량 · 업로드 후 관리자 등록</div>
            </div>
          </div>
        ) : matchedAsset ? (
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
        ) : null}

        {/* ② 업로드 유형 */}
        <div className="m-up-kinds">
          {KINDS.map(({ k, label, icon, tint }) => {
            const selected = kind === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`m-up-kind ${selected ? 'is-selected' : ''}`}
                style={{ ['--kind-tint' as string]: tint }}
              >
                <span className="m-up-kind-icon">
                  <i className={`ph-fill ${icon}`} />
                </span>
                <span className="m-up-kind-label">{label}</span>
              </button>
            );
          })}
        </div>

        {/* ③ 사진 */}
        {items.length > 0 && (
          <div className="m-up-thumbs">
            {items.map((it, idx) => (
              <div key={idx} className="m-up-thumb">
                {it.file.type.startsWith('image/') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.url} alt="" />
                ) : (
                  <div className="m-up-thumb-file">
                    <i className="ph ph-file-pdf" />
                    <div className="m-up-thumb-name">{it.file.name}</div>
                  </div>
                )}
                <button type="button" onClick={() => removeItem(idx)} className="m-up-thumb-del" aria-label="삭제">
                  <i className="ph ph-x" />
                </button>
              </div>
            ))}
          </div>
        )}

        <label className="m-up-picker">
          <input
            type="file"
            accept="image/*,application/pdf"
            multiple
            hidden
            onChange={(e) => { onPick(e.target.files); e.target.value = ''; }}
          />
          <i className="ph ph-images" />
          <span>{items.length === 0 ? '사진·파일 선택' : `${items.length}장 선택됨 · 추가`}</span>
          {items.length > 0 && <span className="m-up-picker-count">{items.length}/{MAX_FILES}</span>}
        </label>
      </div>

      {/* ── 하단 dock — 업로드 + 차량번호 검색 통합 ── */}
      <div className="m-up-dock">
        {(hasCar || kind === 'other') && (
          <button
            type="button"
            onClick={submit}
            disabled={busy || items.length === 0}
            className="m-up-submit-btn"
          >
            <i className={`ph ${busy ? 'ph-spinner spin' : 'ph-cloud-arrow-up'}`} />
            {busy ? '업로드 중' : items.length === 0 ? '사진을 선택하세요' : `${items.length}장 업로드`}
          </button>
        )}
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
            onChange={setCarNumber}
            placeholder="차량번호·회원사·모델 검색"
            showCreate={false}
            dropUp
            showAllOnEmpty
            limit={50}
          />
        </div>
      </div>
    </>
  );
}
