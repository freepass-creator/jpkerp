'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ref as storageRef, uploadBytesResumable, getDownloadURL, getStorage } from 'firebase/storage';
import { ref as rtdbRef, push, set as rtdbSet, serverTimestamp } from 'firebase/database';
import { getFirebaseApp } from '@/lib/firebase/client';
import { getRtdb } from '@/lib/firebase/rtdb';
import { CarNumberPicker } from '@/components/form/car-number-picker';
import { useAuth } from '@/lib/auth/context';
import { useSaveStore } from '@/lib/hooks/useSaveStatus';
import { sanitizeCarNumber } from '@/lib/format-input';
import { useRecentCars } from '@/lib/hooks/useRecentCars';
import { useAssetByCar, useContractByCar } from '@/lib/hooks/useLookups';
import { saveEvent } from '@/lib/firebase/events';
import { resizeImage } from '@/lib/image-resize';
import { StatusBadge, toneForContractStatus } from '@/components/shared/status-badge';

const CATS = [
  { k: 'delivery', label: '출고',   icon: 'ph-truck',             tint: 'var(--c-success)' },
  { k: 'return',   label: '반납',   icon: 'ph-arrow-u-down-left', tint: 'var(--c-info)' },
  { k: 'product',  label: '상품화', icon: 'ph-sparkle',           tint: 'var(--c-primary)' },
] as const;
type Cat = typeof CATS[number]['k'];

const MAX_PARALLEL = 3;
const MAX_FILES = 20;

interface PreviewItem {
  id: string;
  file: File;
  url: string;       // blob preview (image only)
  isImage: boolean;
  progress: number;  // 0~100 업로드 시
  error?: string;
}

interface UploadResult {
  url: string;
  path: string;
  name: string;
  content_type: string;
  size: number;
  taken_at: number;
}

function getStore() { return getStorage(getFirebaseApp()); }
function pad(n: number) { return String(n).padStart(2, '0'); }
function stampNow() {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
function encodeKey(s: string) { return String(s).replace(/[.#$\[\]\/]/g, '_'); }

export default function MobileUpload() {
  const { user } = useAuth();
  const recent = useRecentCars();
  const [carNumber, setCarNumber] = useState('');
  const cn = useMemo(() => sanitizeCarNumber(carNumber), [carNumber]);
  const matchedAsset = useAssetByCar(cn);
  const matchedContract = useContractByCar(cn, { activeOnly: true, requireContractor: true });

  const [kind, setKind] = useState<Cat | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [busy, setBusy] = useState(false);

  const camRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);

  const hasCar = !!cn;
  const hasFiles = items.length > 0;
  // 차량번호 선택은 선택사항 — 없어도 업로드 가능 (미등록은 mobile_uploads 스테이징으로)
  const canUpload = hasFiles && kind !== null && !busy;

  // 계약상태 pill
  const statusLabel = matchedContract?.contract_status ?? (matchedAsset ? '휴차' : '—');
  const statusTone = toneForContractStatus(statusLabel);

  const modelLine = matchedAsset
    ? [matchedAsset.manufacturer, matchedAsset.detail_model ?? matchedAsset.car_model, matchedAsset.car_year].filter(Boolean).join(' ')
    : '';

  const reset = useCallback(() => {
    items.forEach((i) => { if (i.url) URL.revokeObjectURL(i.url); });
    setItems([]);
    setKind(null);
  }, [items]);

  const onCatClick = useCallback((cat: Cat) => {
    if (hasFiles && kind !== null && kind !== cat) {
      if (!confirm('업무 구분을 바꾸면 선택한 사진이 초기화됩니다. 진행할까요?')) return;
      reset();
    }
    setKind(cat);
    setSheetOpen(true);
  }, [hasFiles, kind, reset]);

  const closeSheet = useCallback(() => setSheetOpen(false), []);

  const onSheetAction = useCallback((act: 'camera' | 'gallery') => {
    setSheetOpen(false);
    const ref = act === 'camera' ? camRef : galleryRef;
    const inp = ref.current;
    if (!inp) return;
    inp.value = '';
    inp.click();
  }, []);

  const onFilesChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    if (picked.length === 0) return;
    setItems((prev) => {
      const remaining = MAX_FILES - prev.length;
      if (remaining <= 0) { toast.error(`최대 ${MAX_FILES}장까지`); return prev; }
      const add = picked.slice(0, remaining).map((f, i) => {
        const isImage = f.type.startsWith('image/');
        return {
          id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
          file: f,
          url: isImage ? URL.createObjectURL(f) : '',
          isImage,
          progress: 0,
        };
      });
      if (picked.length > remaining) toast.warning(`${remaining}장만 추가됨 (최대 ${MAX_FILES})`);
      return [...prev, ...add];
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target?.url) URL.revokeObjectURL(target.url);
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  // 파일 1건 업로드 (진행률 반영)
  const uploadOne = useCallback(async (item: PreviewItem, cat: Cat, carSafe: string): Promise<UploadResult | null> => {
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 6);
    const ext = (item.file.name.split('.').pop() || (item.isImage ? 'jpg' : 'bin')).toLowerCase();
    const path = `photos/${cat}/${carSafe}/${stampNow()}_${rand}.${ext}`;
    try {
      const toUpload = await resizeImage(item.file);
      const task = uploadBytesResumable(storageRef(getStore(), path), toUpload, {
        contentType: toUpload.type || undefined,
      });
      const url: string = await new Promise((resolve, reject) => {
        task.on('state_changed',
          (snap) => {
            const pct = Math.max(1, Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
            setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, progress: pct } : i));
          },
          reject,
          async () => { try { resolve(await getDownloadURL(task.snapshot.ref)); } catch (e) { reject(e); } },
        );
      });
      return { url, path, name: item.file.name, content_type: item.file.type || '', size: toUpload.size, taken_at: ts };
    } catch (e) {
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, error: (e as Error).message } : i));
      return null;
    }
  }, []);

  const submit = useCallback(async () => {
    if (!canUpload || !kind) return;
    setBusy(true);
    const save = useSaveStore.getState();
    const kindLabel = CATS.find((c) => c.k === kind)?.label ?? '';
    save.begin(`${kindLabel} 업로드 중`);

    const carSafe = cn ? encodeKey(cn) : '_no_car';
    const queue = [...items];
    const results: UploadResult[] = [];
    const workers = Array.from({ length: Math.min(MAX_PARALLEL, queue.length) }, async () => {
      while (queue.length) {
        const it = queue.shift();
        if (!it) break;
        const r = await uploadOne(it, kind, carSafe);
        if (r) results.push(r);
      }
    });
    await Promise.all(workers);

    if (results.length === 0) {
      save.fail('전부 실패');
      toast.error('업로드 실패');
      setBusy(false);
      return;
    }

    try {
      if (cn) {
        // 차량번호 확정 → events 직접 저장
        const today = new Date().toISOString().slice(0, 10);
        await saveEvent({
          type: kind,
          date: today,
          car_number: cn,
          partner_code: matchedAsset?.partner_code,
          contract_code: matchedContract?.contract_code,
          customer_name: matchedContract?.contractor_name,
          customer_phone: matchedContract?.contractor_phone,
          title: `${kindLabel} (${results.length}장)`,
          photo_urls: results.map((r) => r.url),
          handler_uid: user?.uid,
          handler: user?.displayName ?? user?.email ?? undefined,
          source: 'mobile',
        });
        recent.push(cn);
        save.success('업로드 완료');
        toast.success(`${kindLabel} ${results.length}장 등록`);
      } else {
        // 차량번호 없음 → mobile_uploads 스테이징 (미결업무, 관리자 inbox에서 매칭)
        const db = getRtdb();
        const r = push(rtdbRef(db, 'mobile_uploads'));
        await rtdbSet(r, {
          car_number: null,
          kind,
          file_urls: results.map((u) => u.url),
          file_count: results.length,
          uploader_uid: user?.uid ?? null,
          uploader_name: user?.displayName ?? user?.email ?? null,
          device: 'mobile',
          status: 'pending',
          matched: false,
          created_at: serverTimestamp(),
        });
        save.success('미결업무 등록');
        toast.success(`미결업무로 ${results.length}장 등록 — 관리자 매칭 대기`);
      }
      reset();
    } catch (e) {
      save.fail((e as Error).message);
      toast.error(`저장 실패: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [canUpload, kind, cn, items, matchedAsset, matchedContract, user, uploadOne, recent, reset]);

  // unmount cleanup
  useEffect(() => {
    return () => { items.forEach((i) => { if (i.url) URL.revokeObjectURL(i.url); }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="m-up-v1">
      {/* ① 차량번호 입력 — 맨 위 */}
      <div className="m-picker">
        <CarNumberPicker
          value={carNumber}
          onChange={setCarNumber}
          placeholder="🔍 차량번호·회원사·모델 검색"
          showCreate={false}
          showAllOnEmpty
          limit={50}
        />
      </div>
      {recent.list.length > 0 && (
        <div className="m-up-recent">
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

      {/* ② 차량 정보 카드 */}
      <div className={`m-up-hdr ${hasCar ? 'is-active' : 'is-empty'}`}>
        {!hasCar ? (
          <div className="m-up-hdr-row">
            <i className="ph ph-car text-text-muted" />
            <span className="text-text-muted">위에서 차량번호를 선택하세요</span>
          </div>
        ) : matchedAsset ? (
          <>
            <div className="m-up-hdr-row">
              <span className="m-up-hdr-num">{matchedAsset.car_number}</span>
              <StatusBadge tone={statusTone} style={{ marginLeft: 'auto' }}>{statusLabel}</StatusBadge>
            </div>
            <dl className="m-up-hdr-rows">
              {matchedAsset.partner_code && (
                <div><dt>회원사</dt><dd>{matchedAsset.partner_code}</dd></div>
              )}
              <div>
                <dt>세부모델</dt>
                <dd>{modelLine || '—'}</dd>
              </div>
              {matchedContract?.contractor_name && (
                <div><dt>계약자</dt><dd>{matchedContract.contractor_name}</dd></div>
              )}
            </dl>
          </>
        ) : (
          <>
            <div className="m-up-hdr-row">
              <span className="m-up-hdr-num">{cn}</span>
              <StatusBadge tone="warn" style={{ marginLeft: 'auto' }}>미등록</StatusBadge>
            </div>
            <div className="m-up-hdr-meta">업로드 후 관리자가 자산 등록합니다</div>
          </>
        )}
      </div>

      {/* ③ 3 카테고리 버튼 */}
      <div className="m-up-cats">
        {CATS.map(({ k, label, icon, tint }) => {
          const selected = kind === k;
          return (
            <button
              key={k}
              type="button"
              className={`m-up-cat ${!hasCar ? 'is-dim' : ''} ${selected ? 'is-selected' : ''}`}
              style={{ ['--cat-tint' as string]: tint }}
              onClick={() => onCatClick(k)}
              disabled={busy}
            >
              <span className="m-up-cat-icon">
                <i className={`ph-fill ${icon}`} />
              </span>
              <span className="m-up-cat-label">{label}</span>
              {selected && hasFiles && <span className="m-up-cat-count">{items.length}장</span>}
            </button>
          );
        })}
      </div>

      {/* ④ 썸네일 그리드 */}
      {hasFiles && (
        <div className="m-up-thumbs">
          {items.map((it) => (
            <div key={it.id} className={`m-up-thumb ${it.error ? 'is-err' : ''}`}>
              {it.isImage && it.url
                /* eslint-disable-next-line @next/next/no-img-element */
                ? <img src={it.url} alt="" />
                : <div className="m-up-thumb-file"><i className="ph ph-file" /></div>}
              {it.progress > 0 && it.progress < 100 && (
                <div className="m-up-thumb-bar" style={{ width: `${it.progress}%` }} />
              )}
              {it.progress > 0 && (
                <span className="m-up-thumb-pct">
                  {it.error ? '실패' : `${it.progress}%`}
                </span>
              )}
              {!busy && (
                <button type="button" className="m-up-thumb-del" onClick={() => removeItem(it.id)} aria-label="삭제">
                  <i className="ph ph-x" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 숨은 file input */}
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={onFilesChange} />
      <input ref={galleryRef} type="file" accept="image/*,video/*" multiple hidden onChange={onFilesChange} />

      {/* 하단 고정 dock — 초기화 · 업로드 (탭바 바로 위) */}
      {hasFiles && (
        <div className="m-up-dock">
          <button type="button" className="m-btn is-lg" onClick={reset} disabled={busy}>
            <i className="ph ph-arrow-counter-clockwise" />초기화
          </button>
          <button type="button" className="m-btn is-lg is-primary" onClick={submit} disabled={!canUpload}>
            <i className={`ph ${busy ? 'ph-spinner spin' : 'ph-cloud-arrow-up'}`} />
            {busy
              ? '업로드 중'
              : cn
                ? `${items.length}장 업로드`
                : `미결업무로 ${items.length}장 올림`}
          </button>
        </div>
      )}

      {/* 액션시트 */}
      {sheetOpen && (
        <>
          <div className="m-sheet-overlay" onClick={closeSheet} />
          <div className="m-sheet">
            <div className="m-sheet-handle" />
            <div className="m-sheet-title">
              {kind ? CATS.find((c) => c.k === kind)?.label : ''} — 업로드 방법
            </div>
            <button type="button" className="m-sheet-btn" onClick={() => onSheetAction('camera')}>
              <i className="ph ph-camera" />카메라 촬영
            </button>
            <button type="button" className="m-sheet-btn" onClick={() => onSheetAction('gallery')}>
              <i className="ph ph-images" />앨범에서 선택
            </button>
            <button type="button" className="m-sheet-btn m-sheet-cancel" onClick={closeSheet}>취소</button>
          </div>
        </>
      )}
    </div>
  );
}
