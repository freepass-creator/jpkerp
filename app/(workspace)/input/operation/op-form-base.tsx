'use client';

import { useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ref as rtdbRef, update, serverTimestamp } from 'firebase/database';
import { getRtdb } from '@/lib/firebase/rtdb';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import { useAuth } from '@/lib/auth/context';
import { useRecentCars } from '@/lib/hooks/useRecentCars';
import { useAssetByCar, useContractByCar } from '@/lib/hooks/useLookups';
import { saveEvent, checkEventDuplicate } from '@/lib/firebase/events';
import { Field, TextInput, CompactDateInput } from '@/components/form/field';
import { CarNumberPicker } from '@/components/form/car-number-picker';
import { PhotoUploader, type PhotoUploaderHandle } from '@/components/form/photo-uploader';
import { useOpContext } from './op-context-store';
import { computeContractEnd, computeTotalDue, daysBetween, shortDate, today } from '@/lib/date-utils';
import { useFormSave } from '@/lib/hooks/useFormSave';
import { StatusBadge } from '@/components/shared/status-badge';
import type { RtdbBilling, RtdbEvent } from '@/lib/types/rtdb-entities';

const todayStr = () => new Date().toISOString().slice(0, 10);
function shiftDate(base: string, days: number) {
  const d = base ? new Date(base) : new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const LOCATION_TYPE_LABEL: Record<string, string> = {
  delivery: '출고', return: '반납', transfer: '이동', force: '회수',
  maint: '정비', repair: '사고수리', product: '상품화', wash: '세차',
};

export interface OpFormBaseProps {
  eventType: string;
  children: ReactNode;
  buildPayload?: (data: Record<string, string>) => Record<string, unknown>;
  onSaved?: () => void;
  /** 저장 후 추가 작업 (ignition→contract 동기화 등) */
  afterSave?: (eventKey: string, payload: Record<string, unknown>) => Promise<void>;
  /** 첨부파일 업로더 활성화 */
  showUploader?: boolean;
  uploaderLabel?: string;
  uploaderAccept?: string;
  /** OCR 추출 콜백 — 첨부 후 클릭 시 form 자동 채움 (금액·날짜·차량번호) */
  onOcrExtract?: (result: { amount: number | null; date: string | null; car_number: string | null; text: string }) => void;
}

/**
 * 운영업무 입력 폼 본문. Panel2 안에 들어감.
 * - 차량번호 자동완성 + 최근 차량 클릭 버튼
 * - 첨부파일 업로더 (옵션) → Firebase Storage 업로드 후 URL 저장
 * - afterSave 훅으로 계약 상태 등 동기화 가능
 */
export function OpFormBase({
  eventType,
  children,
  buildPayload,
  onSaved,
  afterSave,
  showUploader = true,
  uploaderLabel,
  uploaderAccept,
  onOcrExtract,
}: OpFormBaseProps) {
  const { user } = useAuth();
  const billings = useRtdbCollection<RtdbBilling>('billings');
  const events = useRtdbCollection<RtdbEvent>('events');
  const recent = useRecentCars();
  const { carNumber, date, setCarNumber, setDate } = useOpContext();
  const formRef = useRef<HTMLFormElement | null>(null);
  const uploaderRef = useRef<PhotoUploaderHandle | null>(null);
  const { run } = useFormSave({
    formRef,
    onSaved,
    onCleanup: () => uploaderRef.current?.clear(),
    failPrefix: '저장 실패',
  });
  // 상품등록된 차량 (product_register 이벤트 있음) — vehicle state 표시용
  const productCarNumbers = useMemo(() => {
    const set = new Set<string>();
    for (const e of events.data) {
      if (e.type === 'product_register' && e.car_number) set.add(e.car_number);
    }
    return set;
  }, [events.data]);

  const matchedAsset = useAssetByCar(carNumber);
  const matchedContract = useContractByCar(carNumber, { requireContractor: true });

  const contractEnd = matchedContract ? computeContractEnd(matchedContract) : '';
  const dDay = contractEnd ? daysBetween(today(), contractEnd) : null;

  // 보험연령 참조 (가장 최근 insurance 이벤트의 age_after)
  const insAgeRef = useMemo(() => {
    if (!carNumber) return '—';
    const insEvs = events.data
      .filter((e) => e.car_number === carNumber && e.type === 'insurance' && e.age_after)
      .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
    return insEvs[0]?.age_after ?? '—';
  }, [events.data, carNumber]);

  // 현재 위치 — 가장 최근 이벤트의 도착지/입고처/반납장소
  const currentLocation = useMemo(() => {
    if (!carNumber) return null;
    const LOC_TYPES = ['delivery', 'return', 'transfer', 'force', 'maint', 'repair', 'product', 'wash'];
    const candidates = events.data
      .filter((e) => e.car_number === carNumber && LOC_TYPES.includes(e.type ?? '') && e.status !== 'deleted')
      .map((e) => {
        const r = e as { to_location?: string; vendor?: string; return_location?: string };
        const loc = r.to_location || r.vendor || r.return_location;
        return loc ? { date: String(e.date ?? ''), type: e.type, loc } : null;
      })
      .filter((x): x is { date: string; type: string | undefined; loc: string } => !!x)
      .sort((a, b) => b.date.localeCompare(a.date));
    return candidates[0] ?? null;
  }, [events.data, carNumber]);

  // 미납 집계 (매칭된 계약의 billings 기반)
  const unpaidStatus = useMemo(() => {
    if (!matchedContract?.contract_code) return null;
    const t = today();
    let unpaidCount = 0;
    let unpaidAmount = 0;
    for (const b of billings.data) {
      if (b.contract_code !== matchedContract.contract_code) continue;
      const due = computeTotalDue(b);
      const paid = Number(b.paid_total) || 0;
      if (paid < due && b.due_date && b.due_date < t) {
        unpaidCount++;
        unpaidAmount += due - paid;
      }
    }
    return { unpaidCount, unpaidAmount };
  }, [billings.data, matchedContract?.contract_code]);

  // 1행용 — 차량 자체 상태 (운용 상황)
  const vehicleStateLabel = matchedContract
    ? '사용중'
    : matchedAsset
      ? (carNumber && productCarNumbers.has(carNumber) ? '상품' : '휴차')
      : '—';
  const vehicleStateTone: 'success' | 'warn' | 'neutral' = matchedContract
    ? 'success'
    : matchedAsset
      ? (carNumber && productCarNumbers.has(carNumber) ? 'neutral' : 'warn')
      : 'neutral';

  // 2행용 pill — 미납 상태
  const paymentStateLabel = !matchedContract
    ? null
    : unpaidStatus?.unpaidCount
      ? null  // 미납 있으면 별도 inline 텍스트로 이미 표시
      : '미납없음';
  const paymentStateTone: 'success' | 'danger' = 'success';

  // 계약기간 옆에 만기 임박/경과 표시 (pill 대신 색상 + suffix)
  const contractPeriodSuffix = !matchedContract || dDay === null
    ? null
    : dDay < 0 ? { text: `만기 ${-dDay}일 경과`, tone: 'danger' as const }
      : dDay <= 30 ? { text: `D-${dDay}`, tone: 'warn' as const }
        : null;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!carNumber) {
      toast.error('차량번호를 입력하세요');
      return;
    }

    await run(async () => {
      const fd = new FormData(e.currentTarget);
      const data: Record<string, string> = {};
      fd.forEach((v, k) => { data[k] = String(v ?? ''); });

      // 첨부파일 업로드
      let photoUrls: string[] = [];
      if (showUploader && uploaderRef.current) {
        const basePath = `events/${user?.uid ?? 'anon'}/${carNumber}/${Date.now()}`;
        photoUrls = await uploaderRef.current.commitUpload(basePath);
      }

      const base = {
        type: eventType,
        date,
        car_number: carNumber,
        asset_code: matchedAsset?.asset_code,
        contract_code: matchedContract?.contract_code,
        customer_code: matchedContract?.customer_code,
        partner_code: matchedAsset?.partner_code ?? matchedContract?.partner_code,
        customer_name: matchedContract?.contractor_name,
        customer_phone: matchedContract?.contractor_phone,
        handler_uid: user?.uid,
        handler: user?.displayName ?? user?.email ?? undefined,
      };
      const extra = buildPayload ? buildPayload(data) : data;
      const payload = { ...base, ...extra, photo_urls: photoUrls };

      // 중복 체크 (과태료 제외)
      const dup = await checkEventDuplicate(payload);
      if (dup.exists) {
        const proceed = confirm(
          `⚠ 동일한 이벤트가 이미 존재합니다.\n(${dup.eventCode})\n\n그래도 저장하시겠습니까?`,
        );
        if (!proceed) return;
      }

      const eventKey = await saveEvent(payload);

      if (afterSave) {
        await afterSave(eventKey, payload);
      }

      recent.push(carNumber);
    });
  }

  const hasData = !!carNumber && !!matchedAsset;
  const modelLine = [matchedAsset?.manufacturer, matchedAsset?.detail_model ?? matchedAsset?.car_model, matchedAsset?.car_year]
    .filter(Boolean).join(' ');
  const contractPeriod = matchedContract
    ? `${shortDate(matchedContract.start_date)}~${shortDate(contractEnd)}${matchedContract.rent_months ? ` · ${matchedContract.rent_months}개월` : ''}`
    : null;

  const vehicleRow = !hasData ? (
    <div className="ioc-car-info is-empty">
      <div className="ioc-car-line">
        <i className="ph ph-identification-card text-text-muted" />
        <span className="ioc-car-muted">차량번호 입력 시 차량 스펙 · 현재 상태 · 계약 정보가 여기 표시됩니다</span>
      </div>
      <div className="ioc-car-line ioc-car-line-sub">
        <span className="ioc-car-muted" style={{ opacity: 0.6 }}>계약자 · 연락처 · 미납 · 계약기간</span>
      </div>
    </div>
  ) : (
    <div className="ioc-car-info">
      {/* 1행: 차량스펙 + 현재 상태(어디서 뭐하는지) */}
      <div className="ioc-car-line">
        <span className="ioc-car-num">{carNumber}</span>
        {matchedAsset?.partner_code && (
          <><span className="ioc-car-dot">·</span><span className="ioc-car-muted">{matchedAsset.partner_code}</span></>
        )}
        {modelLine && (
          <><span className="ioc-car-dot">·</span><span className="ioc-car-muted">{modelLine}</span></>
        )}
        {currentLocation && (
          <>
            <span className="ioc-car-dot">·</span>
            <i className="ph ph-map-pin text-base text-text-muted" />
            <span className="ioc-car-strong">{currentLocation.loc}</span>
            <span className="ioc-car-muted text-2xs">
              {currentLocation.date}
              {currentLocation.type && ` · ${LOCATION_TYPE_LABEL[currentLocation.type] ?? currentLocation.type}`}
            </span>
          </>
        )}
        <StatusBadge tone={vehicleStateTone} style={{ marginLeft: 'auto' }}>{vehicleStateLabel}</StatusBadge>
      </div>

      {/* 2행: 계약자 · 연락처 · 미납금액(있으면) · 계약기간 · 계약상태 */}
      {matchedContract ? (
        <div className="ioc-car-line ioc-car-line-sub">
          <span className="ioc-car-strong">{matchedContract.contractor_name}</span>
          {matchedContract.contractor_phone && (
            <>
              <span className="ioc-car-dot">·</span>
              <a href={`tel:${matchedContract.contractor_phone}`} className="ioc-car-tel">
                {matchedContract.contractor_phone}
              </a>
            </>
          )}
          {!!unpaidStatus?.unpaidCount && (
            <>
              <span className="ioc-car-dot">·</span>
              <span className="text-danger" style={{ fontWeight: 600 }}>
                미납 {unpaidStatus.unpaidAmount.toLocaleString()}원
                <span className="text-text-muted" style={{ fontWeight: 400, marginLeft: 4 }}>({unpaidStatus.unpaidCount}회)</span>
              </span>
            </>
          )}
          {contractPeriod && (
            <>
              <span className="ioc-car-dot">·</span>
              <span className="ioc-car-muted">{contractPeriod}</span>
              {contractPeriodSuffix && (
                <span
                  className="text-2xs" style={{ fontWeight: 600, marginLeft: 4, color: contractPeriodSuffix.tone === 'danger' ? 'var(--c-danger)' : 'var(--c-warn)' }}
                >
                  {contractPeriodSuffix.text}
                </span>
              )}
            </>
          )}
          {paymentStateLabel && (
            <StatusBadge tone={paymentStateTone} style={{ marginLeft: 'auto' }}>{paymentStateLabel}</StatusBadge>
          )}
        </div>
      ) : (
        <div className="ioc-car-line ioc-car-line-sub">
          <span className="ioc-car-muted">계약 정보 없음</span>
        </div>
      )}
    </div>
  );

  return (
    <form ref={formRef} id="opForm" onSubmit={onSubmit} className="flex flex-col" style={{ height: '100%' }}>
      {vehicleRow}
      <div className="p-5 overflow-y-auto scrollbar-thin" style={{ flex: 1 }}>
        <div className="form-section">
          <div className="form-section-title">
            <i className="ph ph-identification-card" />기본 정보
          </div>

          {/* 최근 차량 클릭 버튼 */}
          {recent.list.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
              <span className="text-text-muted text-2xs" style={{ alignSelf: 'center' }}>
                최근
              </span>
              {recent.list.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCarNumber(c)}
                  className="text-xs" style={{ height: 22, padding: '0 8px', border: carNumber === c ? '1px solid var(--c-primary)' : '1px solid var(--c-border)', borderRadius: 2, background: carNumber === c ? 'var(--c-primary-bg)' : 'var(--c-surface)', color: carNumber === c ? 'var(--c-primary)' : 'var(--c-text-sub)', fontWeight: carNumber === c ? 600 : 500, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.02em' }}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Field label="차량번호" required>
              <CarNumberPicker
                value={carNumber}
                onChange={(v) => setCarNumber(v)}
                autoFocus
                required
              />
            </Field>
            <Field label="일자" required>
              <div className="date-row">
                <CompactDateInput value={date} onChange={setDate} required />
                <div className="date-quick">
                  <button type="button" className="dq-btn" title="하루 전" onClick={() => setDate(shiftDate(date, -1))}>
                    <i className="ph ph-caret-left" />
                  </button>
                  <button type="button" className="dq-btn" onClick={() => setDate(shiftDate('', -1))}>어제</button>
                  <button type="button" className="dq-btn" onClick={() => setDate(todayStr())}>오늘</button>
                  <button type="button" className="dq-btn" title="예약용" onClick={() => setDate(shiftDate('', +1))}>내일</button>
                  <button type="button" className="dq-btn" title="하루 뒤" onClick={() => setDate(shiftDate(date, +1))}>
                    <i className="ph ph-caret-right" />
                  </button>
                </div>
              </div>
            </Field>
          </div>
        </div>

        <div className="form-section">{children}</div>

        {showUploader && (
          <div className="form-section">
            <div className="form-section-title">
              <i className="ph ph-paperclip" />첨부파일
              {onOcrExtract && (
                <span className="text-text-muted text-2xs" style={{ marginLeft: 8, fontWeight: 500 }}>
                  · 업로드 후 OCR 버튼으로 금액·날짜·차량번호 자동 채움
                </span>
              )}
            </div>
            <PhotoUploader
              ref={uploaderRef}
              label={uploaderLabel}
              accept={uploaderAccept}
              onOcrExtract={onOcrExtract ? (r) => {
                if (r.car_number && !carNumber) setCarNumber(r.car_number);
                if (r.date) setDate(r.date);
                onOcrExtract(r);
              } : undefined}
            />
          </div>
        )}
      </div>
    </form>
  );
}

/**
 * 계약 action_status 업데이트 (시동제어 등 afterSave에서 사용).
 */
export async function syncContractActionStatus(contractKey: string, actionStatus: string) {
  await update(rtdbRef(getRtdb(), `contracts/${contractKey}`), {
    action_status: actionStatus,
    updated_at: serverTimestamp(),
  });
}
