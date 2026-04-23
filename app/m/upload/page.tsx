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
import { useRtdbCollection } from '@/lib/collections/rtdb';
import { isActiveContractStatus } from '@/lib/data/contract-status';
import type { RtdbAsset, RtdbContract } from '@/lib/types/rtdb-entities';

interface PreviewItem {
  file: File;
  url: string;   // object URL for preview
}

const MAX_FILES = 10;

// 업로드 카테고리 (정식 DB로 이동 시 분기점)
const KINDS = [
  { k: 'vehicle_reg',  label: '자동차등록증',   icon: 'ph-car' },
  { k: 'business_reg', label: '사업자등록증',   icon: 'ph-buildings' },
  { k: 'insurance',    label: '보험증권',       icon: 'ph-shield-check' },
  { k: 'penalty',      label: '과태료·범칙금', icon: 'ph-warning' },
  { k: 'license',      label: '면허증',         icon: 'ph-identification-card' },
  { k: 'other',        label: '기타',           icon: 'ph-paperclip' },
] as const;
type Kind = typeof KINDS[number]['k'];

export default function MobileUpload() {
  const { user } = useAuth();
  const [carNumber, setCarNumber] = useState('');
  const [kind, setKind] = useState<Kind>('vehicle_reg');
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);

  // 차량번호 → 자산/계약 매칭 (사용자가 차를 확인할 수 있도록)
  const assets = useRtdbCollection<RtdbAsset>('assets');
  const contracts = useRtdbCollection<RtdbContract>('contracts');
  const match = useMemo(() => {
    const cn = sanitizeCarNumber(carNumber);
    if (!cn) return null;
    const asset = assets.data.find((a) => a.car_number === cn && a.status !== 'deleted');
    if (!asset) return { cn, asset: null as RtdbAsset | null, contract: null as RtdbContract | null };
    const contract = contracts.data.find(
      (c) => c.car_number === cn
        && (c as { status?: string }).status !== 'deleted'
        && isActiveContractStatus(c.contract_status)
        && c.contractor_name?.trim(),
    ) ?? null;
    return { cn, asset, contract };
  }, [carNumber, assets.data, contracts.data]);

  const carConfirmed = !!match?.cn; // 차량번호 입력만 완료되면 업로드 진행 허용

  const onPick = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    setItems((prev) => {
      const remaining = MAX_FILES - prev.length;
      if (remaining <= 0) {
        toast.error(`최대 ${MAX_FILES}장까지`);
        return prev;
      }
      const add = arr.slice(0, remaining).map((file) => ({
        file,
        url: URL.createObjectURL(file),
      }));
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
    setMemo('');
    setCarNumber('');
    setKind('vehicle_reg');
  }, [items]);

  const submit = useCallback(async () => {
    const cn = sanitizeCarNumber(carNumber);
    if (!cn) { toast.error('차량번호를 입력하세요'); return; }
    if (items.length === 0) { toast.error('사진을 1장 이상 선택하세요'); return; }

    setBusy(true);
    const store = useSaveStore.getState();
    store.begin('업로드 중');
    try {
      // Storage 경로: mobile_uploads/{car_number}/{timestamp}_{filename}
      const basePath = `mobile_uploads/${cn}`;
      const urls = await uploadFiles(basePath, items.map((i) => i.file));

      // RTDB 기록 — 정식 DB로 이동되기 전 inbox
      const db = getRtdb();
      const ref = push(rtdbRef(db, 'mobile_uploads'));
      await set(ref, {
        car_number: cn,
        partner_code: match?.asset?.partner_code ?? null,
        kind,
        file_urls: urls,
        file_count: urls.length,
        memo: memo || null,
        uploader_uid: user?.uid ?? null,
        uploader_name: user?.displayName ?? user?.email ?? null,
        device: 'mobile',
        status: 'pending',      // pending → imported / rejected
        created_at: serverTimestamp(),
      });
      store.success('업로드 완료');
      toast.success(`${urls.length}장 업로드 완료`);
      reset();
    } catch (err) {
      store.fail((err as Error).message);
      toast.error(`업로드 실패: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [carNumber, items, kind, memo, user, match, reset]);

  return (
    <div>
      <div className="m-title">업로드</div>
      <div className="m-subtitle">차량번호 확인 → 문서 사진 업로드</div>

      {/* ① 차량번호 */}
      <label className="text-xs text-text-muted" style={{ display: 'block', marginBottom: 4 }}>
        <span style={{ fontWeight: 600, color: 'var(--c-text)' }}>① 차량번호</span>
      </label>
      <CarNumberPicker
        value={carNumber}
        onChange={setCarNumber}
        placeholder="예: 98고1234"
        autoFocus
        showCreate={false}
      />

      {/* 차량 확인 카드 — 차량번호 입력되면 표시 */}
      {match && (
        <div className="m-card" style={{ marginTop: 10, padding: 12 }}>
          {match.asset ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em' }}>
                  {match.asset.car_number}
                </span>
                {match.asset.partner_code && (
                  <span className="text-text-sub text-sm">{match.asset.partner_code}</span>
                )}
                <span
                  className="text-2xs"
                  style={{
                    marginLeft: 'auto',
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: 'var(--c-success-bg)',
                    color: 'var(--c-success)',
                    fontWeight: 600,
                  }}
                >
                  <i className="ph ph-check-circle" style={{ marginRight: 2 }} />
                  확인됨
                </span>
              </div>
              <div className="text-sm text-text-sub" style={{ marginTop: 4 }}>
                {[match.asset.manufacturer, match.asset.detail_model ?? match.asset.car_model, match.asset.car_year]
                  .filter(Boolean).join(' ') || '(제조사 정보 없음)'}
              </div>
              {match.contract ? (
                <div className="text-xs text-text-muted" style={{ marginTop: 6 }}>
                  <i className="ph ph-user" style={{ marginRight: 4 }} />
                  {match.contract.contractor_name}
                  {match.contract.contractor_phone && ` · ${match.contract.contractor_phone}`}
                </div>
              ) : (
                <div className="text-xs text-warn" style={{ marginTop: 6 }}>
                  <i className="ph ph-info" style={{ marginRight: 4 }} />
                  활성 계약 없음 (휴차)
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-warn">
              <i className="ph ph-warning" style={{ marginRight: 4 }} />
              등록되지 않은 차량 ({match.cn})
              <div className="text-2xs text-text-muted" style={{ marginTop: 4, fontWeight: 400 }}>
                그대로 업로드하면 나중에 관리자가 새 자산으로 등록합니다.
              </div>
            </div>
          )}
        </div>
      )}

      {/* ② 문서 유형 — 차량 선택 후 활성화 */}
      {carConfirmed && (
        <>
          <label className="text-xs text-text-muted" style={{ display: 'block', marginTop: 16, marginBottom: 4 }}>
            <span style={{ fontWeight: 600, color: 'var(--c-text)' }}>② 문서 유형</span>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, marginBottom: 16 }}>
            {KINDS.map(({ k, label, icon }) => (
              <button
                key={k}
                type="button"
                className={`m-btn ${kind === k ? 'is-primary' : ''}`}
                onClick={() => setKind(k)}
                style={{ padding: '10px 6px', flexDirection: 'column', gap: 2, height: 'auto' }}
              >
                <i className={`ph ${icon}`} style={{ fontSize: 18 }} />
                <span className="text-xs">{label}</span>
              </button>
            ))}
          </div>

          {/* ③ 사진/파일 */}
          <label className="text-xs text-text-muted" style={{ display: 'block', marginBottom: 4 }}>
            <span style={{ fontWeight: 600, color: 'var(--c-text)' }}>③ 사진·파일</span>
            {items.length > 0 && <span style={{ marginLeft: 6 }}>({items.length}/{MAX_FILES})</span>}
          </label>

          {items.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 8 }}>
              {items.map((it, idx) => (
                <div key={idx} style={{ position: 'relative', aspectRatio: '1 / 1', background: 'var(--c-bg-sub)', borderRadius: 2, overflow: 'hidden' }}>
                  {it.file.type.startsWith('image/') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.url} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 4 }}>
                      <i className="ph ph-file-pdf" style={{ fontSize: 28 }} />
                      <div className="text-2xs text-text-muted" style={{ padding: '0 4px', textAlign: 'center', wordBreak: 'break-all' }}>
                        {it.file.name}
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    style={{
                      position: 'absolute', top: 4, right: 4,
                      width: 24, height: 24, borderRadius: '50%',
                      background: 'rgba(0,0,0,0.6)', color: '#fff',
                      border: 'none', cursor: 'pointer', padding: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <i className="ph ph-x" style={{ fontSize: 12 }} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 16 }}>
            <label className="m-btn" style={{ cursor: 'pointer' }}>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => { onPick(e.target.files); e.target.value = ''; }}
              />
              <i className="ph ph-camera" />
              카메라
            </label>
            <label className="m-btn" style={{ cursor: 'pointer' }}>
              <input
                type="file"
                accept="image/*,application/pdf"
                multiple
                hidden
                onChange={(e) => { onPick(e.target.files); e.target.value = ''; }}
              />
              <i className="ph ph-images" />
              갤러리
            </label>
          </div>

          {/* ④ 메모 */}
          <label className="text-xs text-text-muted" style={{ display: 'block', marginBottom: 4 }}>
            <span style={{ fontWeight: 600, color: 'var(--c-text)' }}>④ 메모</span> (선택)
          </label>
          <input
            className="m-input"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="특이사항·전달할 내용"
            style={{ marginBottom: 16 }}
          />

          {/* 저장 */}
          <button
            type="button"
            className="m-btn is-primary"
            onClick={submit}
            disabled={busy || items.length === 0}
            style={{ width: '100%' }}
          >
            <i className={`ph ${busy ? 'ph-spinner spin' : 'ph-cloud-arrow-up'}`} />
            {busy ? '업로드 중' : items.length === 0 ? '사진·파일을 먼저 선택' : `${items.length}장 업로드`}
          </button>

          <div className="text-2xs text-text-muted" style={{ marginTop: 12, lineHeight: 1.5 }}>
            업로드된 파일은 임시 저장소에 들어간 뒤 관리자가 검토해 정식 데이터베이스로 이동됩니다.
          </div>
        </>
      )}
    </div>
  );
}
