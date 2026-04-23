'use client';

import { useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { InputFormShell } from './input-form-shell';
import { Field, TextInput, NumberInput, DateInput, TextArea } from '@/components/form/field';
import { BtnGroup } from '@/components/form/btn-group';
import { EntityPicker } from '@/components/form/entity-picker';
import { CarNumberPicker } from '@/components/form/car-number-picker';
import { sanitizeCarNumber } from '@/lib/format-input';
import { extractVehicleReg } from '@/lib/claude-extract';
import { inferMakerFromVin } from '@/lib/vin-wmi';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import type { RtdbAsset } from '@/lib/types/rtdb-entities';
import {
  FUEL_TYPES, DRIVE_TYPES, EXT_COLORS, INT_COLORS,
  USAGE_TYPES, ASSET_STATUS_OPTS, type FuelType,
} from '@/lib/data/vehicle-constants';

interface PartnerRec extends Record<string, unknown> { _key?: string; partner_code?: string; partner_name?: string }

interface CarModelRec extends Record<string, unknown> {
  _key?: string;
  maker?: string; model?: string; sub?: string;
  category?: string; origin?: string; powertrain?: string;
  fuel_type?: string; seats?: number; displacement?: number;
  battery_kwh?: number; code?: string; transmission?: string;
  year_start?: string | number; year_end?: string | number;
  production_start?: string; production_end?: string;
  archived?: boolean;
}

const SHOW_ALL_SENTINEL = '__show_all__';

// 국산 6개 — 자산 보유 0대여도 기본 드롭다운에 노출 (처음 쓰는 사용자가 바로 선택 가능)
const DEFAULT_MAKERS = new Set(['현대', '기아', '제네시스', '쉐보레', '르노', 'KGM']);

// 제조사 인기순 (보유 대수 같을 때 + 자산 0대 기본 노출 시 정렬 기준)
// 국산 → 수입 주요 브랜드 순
const POPULAR_MAKER_ORDER = [
  '현대', '기아', '제네시스', '쉐보레', '르노', 'KGM',
  'BMW', '벤츠', '아우디', '폭스바겐', '볼보', '테슬라',
  '포르쉐', '미니', '렉서스', '토요타', '혼다',
  '지프', '포드', '랜드로버', '마세라티',
];
const POPULAR_INDEX = new Map(POPULAR_MAKER_ORDER.map((name, i) => [name, i] as const));

export function AssetCreateForm() {
  // 차량번호
  const [carNumber, setCarNumber] = useState('');
  const [partnerCode, setPartnerCode] = useState('');

  // 제조사 스펙 (차종마스터 단계별 선택)
  const vehicleMasters = useRtdbCollection<CarModelRec>('vehicle_master');
  const allAssets = useRtdbCollection<RtdbAsset>('assets');
  const [manufacturer, setManufacturer] = useState('');
  const [carModel, setCarModel] = useState('');
  const [detailModel, setDetailModel] = useState('');
  const [extColor, setExtColor] = useState('');
  const [intColor, setIntColor] = useState('');
  const [driveType, setDriveType] = useState('');
  // 보유 0대 항목을 드롭다운에 펼칠지 여부
  const [showAllMakers, setShowAllMakers] = useState(false);
  const [showAllModels, setShowAllModels] = useState(false);

  // 자산 보유 카운트 (제조사별, 제조사+모델별)
  const assetCounts = useMemo(() => {
    const byMaker = new Map<string, number>();
    const byMakerModel = new Map<string, number>();
    for (const a of allAssets.data) {
      if ((a as { status?: string }).status === 'deleted') continue;
      const mk = a.manufacturer ?? '';
      const md = a.car_model ?? '';
      if (mk) byMaker.set(mk, (byMaker.get(mk) ?? 0) + 1);
      if (mk && md) byMakerModel.set(`${mk}|${md}`, (byMakerModel.get(`${mk}|${md}`) ?? 0) + 1);
    }
    return { byMaker, byMakerModel };
  }, [allAssets.data]);

  // 단계별 옵션 목록 — 보유 대수 내림차순, 0대는 숨김 (더보기로 펼침)
  const makers = useMemo(() => {
    const set = new Set<string>();
    for (const m of vehicleMasters.data) {
      if ((m as { status?: string }).status === 'deleted') continue;
      if (m.archived) continue;
      if (m.maker) set.add(m.maker);
    }
    const all = [...set]
      .map((name) => ({
        name,
        count: assetCounts.byMaker.get(name) ?? 0,
        popular: DEFAULT_MAKERS.has(name),
        rank: POPULAR_INDEX.get(name) ?? 999,
      }))
      .sort((a, b) => {
        // 1) 자산 보유 내림차순 (우리 회사에 많은 순)
        if (b.count !== a.count) return b.count - a.count;
        // 2) 보유 0대인 경우 → 통상 인기순 (POPULAR_MAKER_ORDER 배열 순서)
        if (a.rank !== b.rank) return a.rank - b.rank;
        // 3) 가나다
        return a.name.localeCompare(b.name, 'ko');
      });
    // 자산 보유 있거나 국산 기본이면 바로 노출, 아니면 '더보기'에 감춤
    const withCount = all.filter((m) => m.count > 0 || m.popular);
    const zeroCount = all.filter((m) => m.count === 0 && !m.popular);
    return { withCount, zeroCount, all };
  }, [vehicleMasters.data, assetCounts]);

  const models = useMemo(() => {
    if (!manufacturer) return { withCount: [], zeroCount: [], all: [] as { name: string; count: number }[] };
    const set = new Set<string>();
    for (const m of vehicleMasters.data) {
      if ((m as { status?: string }).status === 'deleted') continue;
      if (m.archived) continue;
      if (m.maker === manufacturer && m.model) set.add(m.model);
    }
    const all = [...set]
      .map((name) => ({ name, count: assetCounts.byMakerModel.get(`${manufacturer}|${name}`) ?? 0 }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.name.localeCompare(b.name, 'ko');
      });
    // 국산 제조사라면 전체 모델 기본 노출 (수입은 자산 있는 것만)
    const isKoreanMaker = DEFAULT_MAKERS.has(manufacturer);
    const withCount = all.filter((m) => m.count > 0 || isKoreanMaker);
    const zeroCount = all.filter((m) => m.count === 0 && !isKoreanMaker);
    return { withCount, zeroCount, all };
  }, [vehicleMasters.data, manufacturer, assetCounts]);

  // 세부모델: 최신 연식(production_start 내림차순) 우선
  const subs = useMemo(() => {
    if (!manufacturer || !carModel) return [];
    return vehicleMasters.data
      .filter((m) => (m as { status?: string }).status !== 'deleted' && !m.archived)
      .filter((m) => m.maker === manufacturer && m.model === carModel && m.sub)
      .sort((a, b) => {
        // production_start desc, fallback: year_start desc, fallback: 이름 오름차순
        const pa = a.production_start ?? (a.year_start ? `${a.year_start}-01` : '');
        const pb = b.production_start ?? (b.year_start ? `${b.year_start}-01` : '');
        if (pa && pb && pa !== pb) return pb.localeCompare(pa);
        if (pa && !pb) return -1;
        if (!pa && pb) return 1;
        return (a.sub ?? '').localeCompare(b.sub ?? '', 'ko');
      })
      .map((m) => m.sub!);
  }, [vehicleMasters.data, manufacturer, carModel]);

  const masterSpec = useMemo(() => {
    if (!manufacturer || !carModel || !detailModel) return null;
    return vehicleMasters.data.find(
      (m) => m.maker === manufacturer && m.model === carModel && m.sub === detailModel,
    ) ?? null;
  }, [vehicleMasters.data, manufacturer, carModel, detailModel]);

  // 등록증 스펙
  const [vin, setVin] = useState('');
  const [carYear, setCarYear] = useState('');
  const [fuelType, setFuelType] = useState<string>('가솔린');
  const [displacement, setDisplacement] = useState('');
  const [seats, setSeats] = useState('');
  const [usageType, setUsageType] = useState('렌터카');
  const [firstRegDate, setFirstRegDate] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [typeNumber, setTypeNumber] = useState('');
  const [engineType, setEngineType] = useState('');
  const [status, setStatus] = useState('active');

  // OCR 상태
  const [ocrBusy, setOcrBusy] = useState(false);

  // 세부모델 선택 시 스펙 자동 채움
  const applySpec = useCallback((spec: CarModelRec | null) => {
    if (!spec) return;
    if (spec.fuel_type && FUEL_TYPES.includes(spec.fuel_type as FuelType)) setFuelType(spec.fuel_type);
    if (spec.displacement) setDisplacement(String(spec.displacement));
    if (spec.seats) setSeats(String(spec.seats));
  }, []);

  // 등록증 OCR — Gemini Vision + 차종마스터 컨텍스트로 제조사/모델/세부모델까지 자동 매칭
  const handleRegUpload = useCallback(async (file: File) => {
    setOcrBusy(true);
    try {
      // 활성 마스터만 컨텍스트로 전달 (archived 제외) — Gemini가 정확한 sub 값 선택
      const activeMasters = vehicleMasters.data.filter(
        (m) => (m as { status?: string }).status !== 'deleted' && !m.archived,
      );
      const res = await extractVehicleReg(file, activeMasters);
      const reg = res.extracted;
      if (!reg) {
        toast.error('등록증 추출 실패');
        return;
      }

      // 기본 필드
      if (reg.car_number) setCarNumber(reg.car_number);
      if (reg.vin) setVin(reg.vin);
      if (reg.car_year) setCarYear(String(reg.car_year));
      if (reg.fuel_type) setFuelType(reg.fuel_type);
      if (reg.displacement) setDisplacement(String(reg.displacement));
      if (reg.seats) setSeats(String(reg.seats));
      if (reg.usage_type) setUsageType(reg.usage_type);
      if (reg.first_registration_date) setFirstRegDate(reg.first_registration_date);
      if (reg.owner_name) setOwnerName(reg.owner_name);
      if (reg.type_number) setTypeNumber(reg.type_number);
      if (reg.engine_type) setEngineType(reg.engine_type);

      // 제조사/모델/세부모델 — Gemini가 마스터 보고 매칭한 값
      let matchedMfr = reg.manufacturer ?? '';
      let matchedModel = reg.car_model ?? '';
      const matchedSub = reg.detail_model ?? '';

      // VIN WMI 폴백: Gemini가 제조사를 못 찾은 경우
      if (!matchedMfr && reg.vin) {
        const hint = inferMakerFromVin(reg.vin);
        if (hint) matchedMfr = hint;
      }

      // 세부모델이 마스터에 정확히 존재하는지 확인. 없으면 fuzzy(공백/괄호 제거) 재시도.
      let finalSub = '';
      let masterHit: CarModelRec | null = null;
      if (matchedMfr && matchedModel && matchedSub) {
        const norm = (s: string) => s.replace(/[\s()]/g, '').toLowerCase();
        const target = norm(matchedSub);
        masterHit = activeMasters.find(
          (m) => m.maker === matchedMfr && m.model === matchedModel && m.sub === matchedSub,
        ) ?? activeMasters.find(
          (m) => m.maker === matchedMfr && m.model === matchedModel && m.sub && norm(m.sub) === target,
        ) ?? null;
        if (masterHit) {
          finalSub = masterHit.sub ?? '';
          // Gemini가 matchedModel을 살짝 다르게 반환했을 수 있으니 마스터 값으로 교정
          matchedModel = masterHit.model ?? matchedModel;
          matchedMfr = masterHit.maker ?? matchedMfr;
        }
      }

      if (matchedMfr) setManufacturer(matchedMfr);
      if (matchedModel) setCarModel(matchedModel);
      if (finalSub) setDetailModel(finalSub);
      if (masterHit) applySpec(masterHit);

      const filled = [
        reg.car_number && '차량번호',
        reg.vin && '차대번호',
        matchedMfr && '제조사',
        matchedModel && '모델',
        finalSub && '세부모델',
        reg.displacement && '배기량',
        reg.fuel_type && '연료',
        reg.seats && '승차정원',
      ].filter(Boolean);
      if (matchedSub && !finalSub) {
        toast.warning(`등록증 OCR 완료 · 세부모델 "${matchedSub}" 마스터에 없음 — 수동 선택 필요`);
      } else {
        toast.success(`등록증 OCR 완료 · ${filled.join(', ')} 자동 채움`);
      }
    } catch (err) {
      toast.error(`OCR 실패: ${(err as Error).message}`);
    } finally {
      setOcrBusy(false);
    }
  }, [vehicleMasters.data, applySpec]);

  return (
    <InputFormShell
      collection="assets"
      validate={() => {
        if (!partnerCode) return '회사코드를 입력하세요';
        if (!carNumber) return '차량번호를 입력하세요';
        return null;
      }}
      buildPayload={() => ({
        car_number: sanitizeCarNumber(carNumber),
        partner_code: partnerCode || undefined,
        manufacturer: manufacturer || undefined,
        car_model: carModel || undefined,
        detail_model: detailModel || undefined,
        trim: undefined,
        car_year: carYear ? Number(carYear) : undefined,
        fuel_type: fuelType,
        drive_type: driveType || undefined,
        ext_color: extColor || undefined,
        int_color: intColor || undefined,
        category: masterSpec?.category,
        origin: masterSpec?.origin,
        powertrain: masterSpec?.powertrain,
        displacement: displacement ? Number(displacement) : masterSpec?.displacement,
        seats: seats ? Number(seats) : masterSpec?.seats,
        battery_kwh: masterSpec?.battery_kwh,
        model_code: masterSpec?.code,
        vin: vin || undefined,
        type_number: typeNumber || undefined,
        engine_type: engineType || undefined,
        usage_type: usageType || undefined,
        first_registration_date: firstRegDate || undefined,
        owner_name: ownerName || undefined,
        key_count: 2,
        status,
      })}
      onSaved={() => {
        setCarNumber(''); setVin(''); setManufacturer(''); setCarModel('');
        setDetailModel(''); setCarYear(''); setDisplacement(''); setSeats('');
        setDriveType(''); setExtColor(''); setIntColor(''); setUsageType('렌터카');
        setFirstRegDate(''); setOwnerName(''); setTypeNumber(''); setEngineType('');
      }}
    >
      {/* ── ① 차량번호 ── */}
      <div className="form-section-title">
        <i className="ph ph-car" />차량 식별
      </div>
      <div className="form-row">
        <Field label="차량번호" required>
          <CarNumberPicker
            name="car_number"
            value={carNumber}
            onChange={(v) => setCarNumber(v)}
            autoFocus
            required
            showCreate={false}
          />
        </Field>
        <Field label="회원사">
          <EntityPicker<PartnerRec>
            collection="partners"
            value={partnerCode}
            onChange={(v) => setPartnerCode(v.toUpperCase())}
            primaryField="partner_code"
            secondaryField="partner_name"
            searchFields={['partner_code', 'partner_name']}
            placeholder="예: JPK"
            createHref="/input?type=partner"
            createLabel="새 회원사 등록"
          />
        </Field>
      </div>

      {/* ── ② 제조사 스펙 ── */}
      <div className="form-section">
        <div className="form-section-title">
          <i className="ph ph-factory" />제조사 스펙
        </div>

        {/* 제조사 → 모델 → 세부모델 단계별 선택 */}
        {/* 제조사/모델은 보유대수 내림차순, 0대는 "더보기"로 펼침 */}
        <div className="form-row">
          <Field label="제조사">
            <select
              className="input"
              value={manufacturer}
              onChange={(e) => {
                if (e.target.value === SHOW_ALL_SENTINEL) { setShowAllMakers(true); return; }
                setManufacturer(e.target.value); setCarModel(''); setDetailModel('');
                setShowAllModels(false);
              }}
            >
              <option value="">선택</option>
              {makers.withCount.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}{m.count > 0 ? ` (${m.count})` : ''}
                </option>
              ))}
              {showAllMakers && makers.zeroCount.length > 0 && (
                <optgroup label="── 미보유 ──">
                  {makers.zeroCount.map((m) => (
                    <option key={m.name} value={m.name}>{m.name}</option>
                  ))}
                </optgroup>
              )}
              {!showAllMakers && makers.zeroCount.length > 0 && (
                <option value={SHOW_ALL_SENTINEL}>⇣ 더보기 ({makers.zeroCount.length})</option>
              )}
            </select>
          </Field>
          <Field label="모델">
            <select
              className="input"
              value={carModel}
              onChange={(e) => {
                if (e.target.value === SHOW_ALL_SENTINEL) { setShowAllModels(true); return; }
                setCarModel(e.target.value); setDetailModel('');
              }}
              disabled={!manufacturer}
            >
              <option value="">선택</option>
              {models.withCount.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}{m.count > 0 ? ` (${m.count})` : ''}
                </option>
              ))}
              {showAllModels && models.zeroCount.length > 0 && (
                <optgroup label="── 미보유 ──">
                  {models.zeroCount.map((m) => (
                    <option key={m.name} value={m.name}>{m.name}</option>
                  ))}
                </optgroup>
              )}
              {!showAllModels && models.zeroCount.length > 0 && (
                <option value={SHOW_ALL_SENTINEL}>⇣ 더보기 ({models.zeroCount.length})</option>
              )}
            </select>
          </Field>
          <Field label="세부모델">
            <select
              className="input"
              value={detailModel}
              onChange={(e) => {
                setDetailModel(e.target.value);
                const spec = vehicleMasters.data.find(
                  (m) => m.maker === manufacturer && m.model === carModel && m.sub === e.target.value,
                );
                applySpec(spec ?? null);
              }}
              disabled={!carModel}
            >
              <option value="">선택 (최신순)</option>
              {subs.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>

        {masterSpec && (
          <div className="text-xs" style={{ marginTop: 8, padding: 8, background: 'var(--c-bg-sub)', borderRadius: 2, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {masterSpec.category && <SpecItem k="분류" v={masterSpec.category} />}
            {masterSpec.origin && <SpecItem k="구분" v={String(masterSpec.origin)} />}
            {masterSpec.powertrain && <SpecItem k="동력" v={String(masterSpec.powertrain)} />}
            {masterSpec.displacement && <SpecItem k="배기량" v={`${masterSpec.displacement.toLocaleString()}cc`} />}
            {masterSpec.seats && <SpecItem k="승차" v={`${masterSpec.seats}인승`} />}
            {masterSpec.battery_kwh && <SpecItem k="배터리" v={`${masterSpec.battery_kwh}kWh`} />}
          </div>
        )}

        <div className="form-row" style={{ marginTop: 12 }}>
          <Field label="세부트림">
            <TextInput name="trim" placeholder="예: 프리미엄" />
          </Field>
          <Field label="선택옵션">
            <TextInput name="options" placeholder="예: 선루프, HUD" />
          </Field>
        </div>
        <div className="form-row" style={{ marginTop: 12 }}>
          <Field label="외장색">
            <BtnGroup value={extColor} onChange={setExtColor} options={[...EXT_COLORS]} />
          </Field>
          <Field label="내장색">
            <BtnGroup value={intColor} onChange={setIntColor} options={[...INT_COLORS]} />
          </Field>
        </div>
        <div style={{ marginTop: 12 }}>
          <Field label="구동방식">
            <BtnGroup value={driveType} onChange={setDriveType} options={[...DRIVE_TYPES]} />
          </Field>
        </div>
      </div>

      {/* ── ③ 등록증 스펙 (OCR) ── */}
      <div className="form-section">
        <div className="form-section-title">
          <i className="ph ph-file-text" />등록증 스펙
          <span className="text-text-muted text-2xs" style={{ fontWeight: 400, marginLeft: 8 }}>
            등록증 업로드 시 자동 채움
          </span>
        </div>

        {/* 등록증 업로드 */}
        <label
          className="jpk-uploader-drop"
          style={{ marginBottom: 12, padding: 12 }}
        >
          <input
            type="file"
            accept="application/pdf,image/*"
            hidden
            onChange={(e) => { if (e.target.files?.[0]) handleRegUpload(e.target.files[0]); e.target.value = ''; }}
          />
          <i className="ph ph-file-arrow-up" style={{ fontSize: 18 }} />
          <div>
            <div className="text-base" style={{ fontWeight: 600 }}>
              {ocrBusy ? 'OCR 처리 중...' : '자동차등록증 업로드'}
            </div>
            <div className="text-2xs text-text-muted">PDF · 이미지 · 클릭 또는 드래그</div>
          </div>
        </label>

        <div className="form-row">
          <Field label="차대번호 (VIN)">
            <TextInput value={vin} onChange={(e) => setVin(e.target.value)} placeholder="17자리" />
          </Field>
          <Field label="연식">
            <NumberInput value={carYear} onChange={(e) => setCarYear(e.target.value)} placeholder="2024" />
          </Field>
        </div>
        <div className="form-row" style={{ marginTop: 12 }}>
          <Field label="배기량 (cc)">
            <NumberInput value={displacement} onChange={(e) => setDisplacement(e.target.value)} placeholder="2199" />
          </Field>
          <Field label="승차정원">
            <NumberInput value={seats} onChange={(e) => setSeats(e.target.value)} placeholder="5" />
          </Field>
        </div>
        <div style={{ marginTop: 12 }}>
          <Field label="연료">
            <BtnGroup value={fuelType} onChange={setFuelType} options={[...FUEL_TYPES]} />
          </Field>
        </div>
        <div className="form-row" style={{ marginTop: 12 }}>
          <Field label="형식번호">
            <TextInput value={typeNumber} onChange={(e) => setTypeNumber(e.target.value)} placeholder="NKC90D" />
          </Field>
          <Field label="원동기형식">
            <TextInput value={engineType} onChange={(e) => setEngineType(e.target.value)} placeholder="D4HB" />
          </Field>
        </div>
        <div className="form-row" style={{ marginTop: 12 }}>
          <Field label="최초등록일">
            <DateInput value={firstRegDate} onChange={(e) => setFirstRegDate(e.target.value)} />
          </Field>
          <Field label="용도">
            <BtnGroup value={usageType} onChange={setUsageType} options={[...USAGE_TYPES]} />
          </Field>
        </div>
        <div style={{ marginTop: 12 }}>
          <Field label="소유자">
            <TextInput value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="법인명 또는 개인명" />
          </Field>
        </div>
      </div>

      {/* ── ④ 상태 ── */}
      <div className="form-section">
        <div className="form-section-title"><i className="ph ph-check-circle" />상태</div>
        <Field label="자산 상태">
          <BtnGroup value={status} onChange={setStatus} options={ASSET_STATUS_OPTS} />
        </Field>
      </div>
    </InputFormShell>
  );
}

function SpecItem({ k, v }: { k: string; v: string }) {
  return (
    <span>
      <span className="text-text-muted">{k}</span> <b className="text-text">{v}</b>
    </span>
  );
}
