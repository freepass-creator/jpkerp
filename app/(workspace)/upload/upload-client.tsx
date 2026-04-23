'use client';

import { useMemo, useState, useRef, useCallback } from 'react';
import { Workspace } from '@/components/shared/panel';
import { JpkGrid, type JpkGridApi } from '@/components/shared/jpk-grid';
import { typedColumn } from '@/lib/grid/typed-column';
import { toast } from 'sonner';
import { ref as rtdbRef, push, set, get, query, orderByChild, equalTo } from 'firebase/database';
import { getRtdb } from '@/lib/firebase/rtdb';
import { parseCsvObjects } from '@/lib/csv';
import { ocrFile, extractCarNumber, extractAmount, extractDate } from '@/lib/ocr';
import { detectInsurance, parseInsurance, type InsuranceParsed } from '@/lib/parsers/insurance';
import { detectVehicleReg, parseVehicleReg } from '@/lib/parsers/vehicle-reg';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import { normalizeAsset } from '@/lib/asset-normalize';
import type { RtdbCarModel, RtdbAsset } from '@/lib/types/rtdb-entities';
import { deriveBillingsFromContract } from '@/lib/derive/billings';
import type { RtdbContract } from '@/lib/types/rtdb-entities';
import type { ColDef } from 'ag-grid-community';

// ───────── 스키마 정의 (간단 버전) ─────────
interface SchemaField {
  col: string;
  label: string;
  required?: boolean;
  num?: boolean;
}

interface TypeSpec {
  key: string;
  label: string;
  schema: SchemaField[];
  path: string; // RTDB 저장 경로
  groupLabel?: string;
}

const SCHEMAS: TypeSpec[] = [
  {
    key: 'asset', label: '자산 (차량)', path: 'assets', groupLabel: '기본 마스터',
    schema: [
      { col: 'partner_code', label: '회원사코드' },
      { col: 'car_number', label: '차량번호', required: true },
      { col: 'vin', label: '차대번호' },
      { col: 'manufacturer', label: '제조사' },
      { col: 'car_model', label: '모델' },
      { col: 'detail_model', label: '세부모델' },
      { col: 'car_year', label: '연식', num: true },
      { col: 'fuel_type', label: '연료' },
      { col: 'displacement', label: '배기량', num: true },
      { col: 'seats', label: '승차정원', num: true },
      { col: 'category', label: '차종' },
      { col: 'transmission', label: '변속기' },
      { col: 'drive_type', label: '구동방식' },
      { col: 'usage_type', label: '용도' },
      { col: 'type_number', label: '형식번호' },
      { col: 'engine_type', label: '원동기형식' },
      { col: 'gross_weight_kg', label: '총중량', num: true },
      { col: 'curb_weight_kg', label: '차량자중', num: true },
      { col: 'ext_color', label: '외장색' },
      { col: 'first_registration_date', label: '최초등록일' },
    ],
  },
  {
    key: 'contract', label: '계약', path: 'contracts', groupLabel: '기본 마스터',
    schema: [
      { col: 'partner_code', label: '회원사코드', required: true },
      { col: 'contract_code', label: '계약코드' },
      { col: 'car_number', label: '차량번호', required: true },
      { col: 'contractor_name', label: '계약자명', required: true },
      { col: 'contractor_phone', label: '연락처' },
      { col: 'start_date', label: '시작일', required: true },
      { col: 'end_date', label: '종료일' },
      { col: 'rent_months', label: '기간(개월)', num: true },
      { col: 'rent_amount', label: '월 대여료', num: true },
      { col: 'deposit_amount', label: '보증금', num: true },
    ],
  },
  {
    key: 'customer', label: '고객', path: 'customers', groupLabel: '기본 마스터',
    schema: [
      { col: 'partner_code', label: '회원사코드' },
      { col: 'name', label: '이름', required: true },
      { col: 'phone', label: '연락처', required: true },
      { col: 'birth', label: '생년월일' },
      { col: 'address', label: '주소' },
      { col: 'license_no', label: '면허번호' },
    ],
  },
  {
    key: 'member', label: '회원사', path: 'partners', groupLabel: '기본 마스터',
    schema: [
      { col: 'partner_name', label: '회원사명', required: true },
      { col: 'ceo', label: '대표자' },
      { col: 'biz_no', label: '사업자등록번호', required: true },
      { col: 'corp_no', label: '법인등록번호', required: true },
      { col: 'phone', label: '전화' },
      { col: 'contact_name', label: '담당자' },
    ],
  },
  {
    key: 'vendor', label: '거래처', path: 'vendors', groupLabel: '기본 마스터',
    schema: [
      { col: 'vendor_name', label: '거래처명', required: true },
      { col: 'vendor_type', label: '업종' },
      { col: 'contact_name', label: '담당자' },
      { col: 'phone', label: '연락처' },
      { col: 'biz_no', label: '사업자번호' },
      { col: 'bank_account', label: '계좌' },
    ],
  },
  {
    key: 'loan', label: '할부', path: 'loans', groupLabel: '기본 마스터',
    schema: [
      { col: 'car_number', label: '차량번호', required: true },
      { col: 'loan_company', label: '금융사' },
      { col: 'loan_principal', label: '원금', num: true },
      { col: 'loan_balance', label: '잔액', num: true },
      { col: 'monthly_payment', label: '월 납입', num: true },
      { col: 'loan_end_date', label: '만기일' },
    ],
  },
  {
    key: 'insurance', label: '보험', path: 'insurances', groupLabel: '기본 마스터',
    schema: [
      { col: 'partner_code', label: '회원사코드' },
      { col: 'car_number', label: '차량번호', required: true },
      { col: 'car_name', label: '차명' },
      { col: 'insurance_company', label: '보험사' },
      { col: 'policy_no', label: '증권번호' },
      { col: 'start_date', label: '개시일' },
      { col: 'end_date', label: '만기일' },
      { col: 'premium', label: '총보험료', num: true },
      { col: 'paid', label: '납입액', num: true },
      { col: 'age_limit', label: '연령한정' },
      { col: 'driver_range', label: '운전자범위' },
      { col: 'deductible', label: '자기부담금', num: true },
      { col: 'coverage', label: '담보' },
      { col: 'installment_method', label: '분납방법' },
      { col: 'auto_debit_bank', label: '이체은행' },
      { col: 'auto_debit_account', label: '이체계좌' },
      { col: 'inst_1_date', label: '1회 납부일' },
      { col: 'inst_1_amount', label: '1회 금액', num: true },
      { col: 'inst_2_date', label: '2회 납부일' },
      { col: 'inst_2_amount', label: '2회 금액', num: true },
      { col: 'inst_3_date', label: '3회 납부일' },
      { col: 'inst_3_amount', label: '3회 금액', num: true },
      { col: 'inst_4_date', label: '4회 납부일' },
      { col: 'inst_4_amount', label: '4회 금액', num: true },
      { col: 'inst_5_date', label: '5회 납부일' },
      { col: 'inst_5_amount', label: '5회 금액', num: true },
      { col: 'inst_6_date', label: '6회 납부일' },
      { col: 'inst_6_amount', label: '6회 금액', num: true },
      { col: 'car_value', label: '차량가액', num: true },
      { col: 'year', label: '연식', num: true },
      { col: 'cc', label: '배기량', num: true },
      { col: 'seats', label: '정원', num: true },
      { col: 'doc_type', label: '구분' },
    ],
  },
  {
    key: 'gps', label: 'GPS 장착', path: 'gps_devices', groupLabel: '기본 마스터',
    schema: [
      { col: 'car_number', label: '차량번호', required: true },
      { col: 'partner_code', label: '회원사코드' },
      { col: 'gps_company', label: '제조사' },
      { col: 'gps_serial', label: '시리얼번호', required: true },
      { col: 'gps_install_date', label: '장착일' },
      { col: 'gps_status', label: '상태' },
      { col: 'gps_location', label: '장착 위치' },
    ],
  },
  {
    key: 'autodebit', label: '자동이체', path: 'autodebits', groupLabel: '기본 마스터',
    schema: [
      { col: 'contract_code', label: '계약코드', required: true },
      { col: 'bank_name', label: '은행' },
      { col: 'account_no', label: '계좌번호', required: true },
      { col: 'holder', label: '예금주' },
      { col: 'debit_day', label: '이체일', num: true },
      { col: 'amount', label: '금액', num: true },
    ],
  },
  {
    key: 'bank', label: '통장 거래내역', path: 'events', groupLabel: '거래·이력',
    schema: [
      { col: 'date', label: '일자', required: true },
      { col: 'amount', label: '금액', required: true, num: true },
      { col: 'title', label: '내역', required: true },
      { col: 'vendor', label: '거래처' },
      { col: 'memo', label: '메모' },
    ],
  },
  {
    key: 'card', label: '카드 이용내역', path: 'events', groupLabel: '거래·이력',
    schema: [
      { col: 'date', label: '일자', required: true },
      { col: 'amount', label: '금액', required: true, num: true },
      { col: 'title', label: '가맹점', required: true },
      { col: 'vendor', label: '거래처' },
      { col: 'memo', label: '메모' },
    ],
  },
];

// 타입별 샘플 값 (스키마 헤더 아래 1줄 미리보기용)
const SAMPLE_MAP: Record<string, Record<string, string>> = {
  asset: {
    partner_code: 'PT00001', car_number: '12가3456', vin: 'KMHD14LE1AA123456',
    manufacturer: '현대', car_model: '아반떼', detail_model: 'CN7 스마트',
    car_year: '2023', fuel_type: '가솔린', displacement: '1598', seats: '5',
    category: '준중형', transmission: '자동', drive_type: '전륜',
    usage_type: '렌터카', type_number: 'NKC90D', engine_type: 'G4FL',
    gross_weight_kg: '1820', curb_weight_kg: '1280',
    ext_color: '흰색', first_registration_date: '2023-03-15',
  },
  contract: {
    partner_code: 'PT00001', contract_code: '(자동생성)', car_number: '12가3456',
    contractor_name: '홍길동', contractor_phone: '010-1234-5678',
    start_date: '2026-01-01', end_date: '2027-12-31',
    rent_months: '24', rent_amount: '450000', deposit_amount: '1000000',
  },
  customer: {
    partner_code: 'PT00001', name: '홍길동', phone: '010-1234-5678',
    birth: '1985-06-20', address: '서울시 강남구 ...', license_no: '11-22-334455-66',
  },
  member: {
    partner_name: '스위치플랜', ceo: '박영현',
    biz_no: '158-81-03213', corp_no: '110111-8596368',
    phone: '031-555-1234', contact_name: '담당자',
  },
  vendor: {
    vendor_name: '○○정비공장', vendor_type: '정비',
    contact_name: '김정비', contact_phone: '010-...',
  },
  insurance: {
    partner_code: 'PT00001', car_number: '12가3456', car_name: '아반떼',
    insurance_company: '삼성화재', policy_no: '2-2026-1234567',
    start_date: '2026-03-14', end_date: '2027-03-14',
    premium: '1388610', paid: '1002090',
    age_limit: '만21세', driver_range: '누구나',
  },
  loan: {
    car_number: '12가3456', loan_bank: '○○캐피탈', loan_amount: '20000000',
    loan_start_date: '2024-01-01', monthly_payment: '450000', loan_end_date: '2027-12-31',
  },
  gps: {
    car_number: '12가3456', gps_serial: 'GPS-12345',
    install_date: '2026-01-01',
  },
  autodebit: {
    car_number: '12가3456', bank: '신한은행', account_no: '110-...',
    debit_day: '25',
  },
  bank_tx: {
    date: '2026-04-22', direction: 'in', amount: '500000',
    content: '홍길동-렌트료', balance: '5000000',
  },
  card_tx: {
    date: '2026-04-22', amount: '150000', vendor: '현대카드', approval: '12345',
  },
};

// 헤더 매핑 — 스키마 라벨과 비슷한 헤더를 col로 매핑
function mapHeaders(rows: Array<Record<string, string>>, schema: SchemaField[]): Array<Record<string, unknown>> {
  if (rows.length === 0) return [];
  const headers = Object.keys(rows[0]);
  const map: Record<string, string> = {};
  for (const h of headers) {
    const match = schema.find((f) => f.label === h || f.col === h);
    if (match) map[h] = match.col;
  }
  return rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [h, v] of Object.entries(r)) {
      const key = map[h] ?? h;
      const fld = schema.find((f) => f.col === key);
      out[key] = fld?.num ? (Number(String(v).replace(/,/g, '')) || 0) : v;
    }
    return out;
  });
}

// ───────── 차종마스터 매칭 ─────────
function matchVehicleMaster(rows: Array<Record<string, unknown>>, masters: RtdbCarModel[]): Array<Record<string, unknown>> {
  if (!masters.length) return rows;
  const byMakerModel = new Map<string, RtdbCarModel[]>();
  const byMaker = new Map<string, RtdbCarModel[]>();
  for (const m of masters) {
    if (m.status === 'deleted') continue;
    const mk = (m.maker ?? '').trim();
    const md = (m.model ?? '').trim();
    if (!mk) continue;
    const key = `${mk}|${md}`.toLowerCase();
    if (!byMakerModel.has(key)) byMakerModel.set(key, []);
    byMakerModel.get(key)!.push(m);
    if (!byMaker.has(mk.toLowerCase())) byMaker.set(mk.toLowerCase(), []);
    byMaker.get(mk.toLowerCase())!.push(m);
  }
  return rows.map((row) => {
    const maker = String(row.manufacturer ?? row.maker ?? '').trim();
    const model = String(row.car_model ?? row.model ?? '').trim();
    const detail = String(row.detail_model ?? row.sub ?? '').trim();
    if (!maker) return row;
    let candidates = byMakerModel.get(`${maker}|${model}`.toLowerCase());
    if (!candidates?.length) candidates = byMaker.get(maker.toLowerCase());
    if (!candidates?.length) return row;
    let best = candidates[0];
    if (detail) {
      const exact = candidates.find((c) => (c.sub ?? '').toLowerCase() === detail.toLowerCase());
      if (exact) best = exact;
      else {
        const partial = candidates.find((c) =>
          (c.sub ?? '').toLowerCase().includes(detail.toLowerCase()) ||
          detail.toLowerCase().includes((c.sub ?? '').toLowerCase()),
        );
        if (partial) best = partial;
      }
    }
    const enriched = { ...row };
    if (!enriched.manufacturer && best.maker) enriched.manufacturer = best.maker;
    if (!enriched.car_model && best.model) enriched.car_model = best.model;
    if (!enriched.detail_model && best.sub) enriched.detail_model = best.sub;
    if (!enriched.fuel_type && best.fuel_type) enriched.fuel_type = best.fuel_type;
    if (!enriched.category && best.category) enriched.category = best.category;
    if (!enriched.origin && best.origin) enriched.origin = best.origin;
    if (!enriched.powertrain && best.powertrain) enriched.powertrain = best.powertrain;
    if (!enriched.displacement && best.displacement) enriched.displacement = best.displacement;
    if (!enriched.seats && best.seats) enriched.seats = best.seats;
    if (!enriched.battery_kwh && best.battery_kwh) enriched.battery_kwh = best.battery_kwh;
    enriched._master_matched = `${best.maker} ${best.model} ${best.sub}`;
    return enriched;
  });
}

// ───────── 컴포넌트 ─────────
export function UploadClient() {
  const [typeKey, setTypeKey] = useState<string>('auto');
  const [rawRows, setRawRows] = useState<Array<Record<string, string>>>([]);
  const [detectedKey, setDetectedKey] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const vehicleMasters = useRtdbCollection<RtdbCarModel>('vehicle_master');
  const assets = useRtdbCollection<RtdbAsset>('assets');
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState('');
  const [ocrRawText, setOcrRawText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  const gridRef = useRef<JpkGridApi<Record<string, unknown>> | null>(null);

  const effectiveKey = typeKey === 'auto' ? detectedKey : typeKey;
  const spec = SCHEMAS.find((s) => s.key === effectiveKey);

  const mappedRows = useMemo(() => {
    if (!spec) return [];
    let rows = mapHeaders(rawRows, spec.schema);
    // 자산 타입이면 정규화 (제조사/모델/세부모델/연료/차종 자동 매칭)
    if (spec.key === 'asset' && vehicleMasters.data.length > 0) {
      rows = rows.map((row) => {
        const { data, corrections } = normalizeAsset(row as Record<string, unknown>, vehicleMasters.data);
        // 보정 정보를 _corrections에 저장 (셀 스타일링용)
        if (Object.keys(corrections).length > 0) data._corrections = corrections;
        return data;
      });
    }
    return rows;
  }, [rawRows, spec, vehicleMasters.data]);

  const columnDefs = useMemo<ColDef[]>(() => {
    if (!spec) return [];
    return [
      typedColumn<Record<string, unknown>>('action', { headerName: '#', valueGetter: (p) => (p.node?.rowIndex ?? 0) + 1, width: 45, cellStyle: { color: 'var(--c-text-muted)' } }),
      ...(spec.schema.map((f) =>
        typedColumn<Record<string, unknown>>(f.num ? 'number' : 'text', {
          headerName: f.label + (f.required ? ' *' : ''),
          field: f.col,
          width: 120,
          ...(f.num ? { valueFormatter: (p: { value: unknown }) => { const v = Number(p.value); return v ? v.toLocaleString('ko-KR') : '-'; } } : {}),
          cellStyle: (p) => {
            const corr = (p.data as Record<string, unknown>)?._corrections as Record<string, string> | undefined;
            if (corr && f.col in corr) {
              return { color: 'var(--c-primary)', fontWeight: 600 };
            }
            return undefined;
          },
          tooltipValueGetter: (p) => {
            const corr = (p.data as Record<string, unknown>)?._corrections as Record<string, string> | undefined;
            if (corr && f.col in corr) {
              const orig = corr[f.col];
              return orig ? `원본: ${orig}` : '자동 채움';
            }
            return undefined;
          },
        }),
      )),
    ];
  }, [spec]);

  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name);
    setOcrRawText('');
    const ext = (file.name.split('.').pop() ?? '').toLowerCase();
    const isCsv = ext === 'csv' || ext === 'tsv' || ext === 'txt';

    if (isCsv) {
      // CSV 파싱
      const text = await file.text();
      const rows = parseCsvObjects(text);
      setRawRows(rows);
      if (rows.length > 0) {
        const headers = Object.keys(rows[0]);
        let best = { key: '', score: 0 };
        for (const s of SCHEMAS) {
          const score = s.schema.filter((f) => headers.includes(f.label) || headers.includes(f.col)).length;
          if (score > best.score) best = { key: s.key, score };
        }
        if (best.score > 0) setDetectedKey(best.key);
        toast.success(`${rows.length}행 파싱 · ${best.key ? `감지: ${SCHEMAS.find((s) => s.key === best.key)?.label}` : '유형 선택 필요'}`);
      }
    } else {
      // PDF/이미지 → OCR (페이지별 분리)
      setOcrBusy(true);
      setOcrProgress('OCR 준비 중...');
      try {
        const result = await ocrFile(file, {
          onProgress: (p) => setOcrProgress(p.message),
        });
        setOcrRawText(result.text);

        // 페이지 구분자로 분리 — 각 페이지를 독립 행으로
        const pages = result.text.split(/---\s*페이지 구분\s*---/).map((t) => t.trim()).filter(Boolean);
        // 이미지(1페이지)면 pages가 1개

        // ── 자동차등록증 감지: 등록증이면 자산 row 생성 + vehicle_master 매칭 ──
        const regPages = pages.filter((p) => detectVehicleReg(p));
        if (regPages.length > 0) {
          const assetRows: Array<Record<string, string>> = [];
          const seenCars = new Set<string>();
          for (const p of regPages) {
            const reg = parseVehicleReg(p, p.split('\n'));
            // 차량번호 없어도 VIN이나 차명이 있으면 row 생성 (사용자가 미리보기에서 확인/수정)
            const hasAny = reg.car_number || reg.vin || reg.car_name || reg.type_number;
            if (!hasAny) continue;
            if (reg.car_number && seenCars.has(reg.car_number)) continue;
            if (reg.car_number) seenCars.add(reg.car_number);

            // 제조사/모델 분리 (차명 = "현대 아반떼 1.6" → maker + model)
            // "차대번호" 같은 잘못된 값은 버림
            let manufacturer = '';
            let carModel = '';
            const rawName = (reg.car_name ?? '').trim();
            const invalidNames = ['차대번호', '형식', '차종', '제조사', '모델'];
            if (rawName && !invalidNames.includes(rawName)) {
              const nameTokens = rawName.split(/\s+/).filter(Boolean);
              if (nameTokens.length > 1) {
                manufacturer = nameTokens[0];
                carModel = nameTokens.slice(1).join(' ');
              } else if (nameTokens.length === 1) {
                // 단일 토큰이면 모델로만 쓰고 제조사는 비워둠 (normalizeAsset이 채워줌)
                carModel = nameTokens[0];
              }
            }

            assetRows.push({
              car_number: reg.car_number,
              vin: reg.vin,
              manufacturer,
              car_model: carModel,
              car_year: String(reg.car_year ?? ''),
              fuel_type: reg.fuel_type,
              displacement: String(reg.displacement ?? ''),
              seats: String(reg.seats ?? ''),
              usage_type: reg.usage_type,
              first_registration_date: reg.first_registration_date,
              type_number: reg.type_number,
              engine_type: reg.engine_type,
              gross_weight_kg: String(reg.gross_weight_kg ?? ''),
              curb_weight_kg: String(reg.curb_weight_kg ?? ''),
            });
          }
          if (assetRows.length > 0) {
            setRawRows(assetRows);
            setDetectedKey('asset');
            toast.success(`자동차등록증 OCR 완료 · ${assetRows.length}대 추출 — 제조사 스펙 자동 매칭됩니다`);
            return;
          }
        }

        // ── 보험증권 감지: 3페이지 이상 보험증권이면 전용 파서 ──
        const insurancePages = pages.filter((p) => detectInsurance(p));
        if (insurancePages.length >= 1 && insurancePages.length >= pages.length * 0.5) {
          const parsed: InsuranceParsed[] = [];
          const seen = new Set<string>();
          for (const p of insurancePages) {
            const ins = parseInsurance(p);
            if (!ins.car_number) continue;
            const key = `${ins.car_number}|${ins.policy_no}`;
            if (seen.has(key)) continue;
            seen.add(key);
            parsed.push(ins);
          }

          if (parsed.length > 0) {
            // 차량번호 → partner_code 매칭 맵 구축
            const carToPartner = new Map<string, string>();
            for (const a of assets.data) {
              if (a.car_number && a.partner_code && a.status !== 'deleted') {
                carToPartner.set(a.car_number, a.partner_code);
              }
            }

            // 사업자번호 → partner_code fallback 매칭 (차량 미등록 시 대비)
            const bizToPartner = new Map<string, string>();
            try {
              const pSnap = await get(rtdbRef(getRtdb(), 'partners'));
              if (pSnap.exists()) {
                for (const v of Object.values(pSnap.val() as Record<string, { biz_no?: string; partner_code?: string; status?: string }>)) {
                  if (v?.status === 'deleted' || !v?.biz_no || !v?.partner_code) continue;
                  const norm = String(v.biz_no).replace(/\D/g, '');
                  if (norm) bizToPartner.set(norm, v.partner_code);
                }
              }
            } catch { /* silent */ }

            let matchedCount = 0;

            // col 키로 직접 매핑 — mapHeaders를 거치지 않도록 col 이름 사용
            const insuranceRows: Array<Record<string, string>> = parsed.map((ins) => {
              // 1차: 차량번호 매칭 → 2차: 피보험자 사업자번호 매칭
              let partnerCode = carToPartner.get(ins.car_number) ?? '';
              if (!partnerCode && ins.insured_biz_no) {
                const normBiz = ins.insured_biz_no.replace(/\D/g, '');
                partnerCode = bizToPartner.get(normBiz) ?? '';
              }
              if (partnerCode) matchedCount++;
              const row: Record<string, string> = {
                partner_code: partnerCode,
                insured_name: ins.insured_name,
                insured_biz_no: ins.insured_biz_no,
                car_number: ins.car_number,
                insurance_company: ins.insurance_company,
                policy_no: ins.policy_no,
                start_date: ins.start_date,
                end_date: ins.end_date,
                premium: String(ins.premium),
                age_limit: ins.age_limit,
                driver_range: ins.driver_range,
                deductible: String(ins.deductible),
                coverage: ins.coverage,
                car_name: ins.car_name,
                car_value: String(ins.car_value),
                paid: String(ins.paid),
                year: String(ins.year ?? ''),
                cc: String(ins.cc ?? ''),
                seats: String(ins.seats ?? ''),
                doc_type: ins.doc_type,
                installment_method: ins.installment_method,
                auto_debit_bank: ins.auto_debit_bank,
                auto_debit_account: ins.auto_debit_account,
                installments: ins.installments.length > 0 ? JSON.stringify(ins.installments) : '',
              };
              // 분납 스케줄 flat 컬럼
              for (const entry of ins.installments) {
                row[`inst_${entry.seq}_date`] = entry.date;
                row[`inst_${entry.seq}_amount`] = String(entry.amount);
              }
              // 1회차 납부일 = 보험 개시일 (fallback)
              if (!row.inst_1_date && ins.start_date) {
                row.inst_1_date = ins.start_date;
              }
              return row;
            });
            setRawRows(insuranceRows);
            setDetectedKey('insurance');
            const partnerMsg = matchedCount > 0 ? ` · 회원사 ${matchedCount}건 매칭` : '';
            toast.success(`보험증권 OCR 완료 · ${parsed.length}대 추출 (${pages.length}페이지)${partnerMsg}`);
          } else {
            setRawRows([]);
            toast.info('보험증권 인식됐으나 차량번호 추출 실패');
          }
        } else {
          // ── 범용 OCR 추출 ──
          const allRows: Array<Record<string, string>> = [];

          for (const pageText of pages) {
            const carNumber = extractCarNumber(pageText);
            const amount = extractAmount(pageText);
            const date = extractDate(pageText);
            const row: Record<string, string> = {};
            if (carNumber) row['차량번호'] = carNumber;
            if (amount) row['금액'] = String(amount);
            if (date) row['일자'] = date;

            // 줄 단위 키:값 파싱
            const lines = pageText.split('\n').map((l) => l.trim()).filter(Boolean);
            for (const line of lines) {
              const kv = line.match(/^(.+?)\s*[:：]\s*(.+)$/);
              if (kv && kv[1].length < 15 && !row[kv[1].trim()]) {
                row[kv[1].trim()] = kv[2].trim();
              }
            }

            if (Object.keys(row).length > 0) allRows.push(row);
          }

          if (allRows.length > 0) {
            setRawRows(allRows);
            toast.success(`OCR 완료 · ${allRows.length}건 추출 (${pages.length}페이지)`);
          } else {
            setRawRows([]);
            toast.info('OCR 완료 · 자동 추출 항목 없음 (원문 텍스트 확인)');
          }
        }
      } catch (err) {
        toast.error(`OCR 실패: ${(err as Error).message}`);
      } finally {
        setOcrBusy(false);
        setOcrProgress('');
      }
    }
  }, []);

  const handleLink = useCallback(async () => {
    if (!linkUrl.trim()) return;
    setLinkBusy(true);
    try {
      let url = linkUrl.trim();
      // Google Sheets 공유 링크 → CSV export 변환
      const sheetsMatch = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
      if (sheetsMatch) {
        const gidMatch = url.match(/gid=(\d+)/);
        const gid = gidMatch ? gidMatch[1] : '0';
        url = `https://docs.google.com/spreadsheets/d/${sheetsMatch[1]}/export?format=csv&gid=${gid}`;
      }
      // Google Drive 파일 링크 → direct download
      const driveMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (driveMatch) {
        url = `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`;
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const rows = parseCsvObjects(text);
      setRawRows(rows);
      setFileName(`링크 (${rows.length}행)`);
      if (rows.length > 0) {
        const headers = Object.keys(rows[0]);
        let best = { key: '', score: 0 };
        for (const s of SCHEMAS) {
          const score = s.schema.filter((f) => headers.includes(f.label) || headers.includes(f.col)).length;
          if (score > best.score) best = { key: s.key, score };
        }
        if (best.score > 0) setDetectedKey(best.key);
        toast.success(`${rows.length}행 불러옴 · ${best.key ? `감지: ${SCHEMAS.find((s) => s.key === best.key)?.label}` : '유형 선택 필요'}`);
      }
    } catch (err) {
      toast.error(`링크 불러오기 실패: ${(err as Error).message}`);
    } finally {
      setLinkBusy(false);
    }
  }, [linkUrl]);

  const copyHeaders = useCallback(() => {
    if (!spec) return;
    const line = spec.schema.map((f) => f.label).join('\t');
    navigator.clipboard.writeText(line);
    toast.success('헤더 복사됨 (Excel에 붙여넣기)');
  }, [spec]);

  const downloadSample = useCallback(() => {
    if (!spec) return;
    const csv = `${spec.schema.map((f) => f.label).join(',')}\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${spec.key}_sample.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [spec]);

  const reset = useCallback(() => {
    setRawRows([]);
    setDetectedKey(null);
    setFileName('');
  }, []);

  const commit = useCallback(async () => {
    if (!spec || mappedRows.length === 0) return;
    setSaving(true);
    try {
      const db = getRtdb();
      const base = rtdbRef(db, spec.path);
      let ok = 0;
      let skippedDup = 0;
      let derivedBillings = 0;

      // 보험 업로드 시 차량→회원사 매칭 + 기존 증권번호 조회 (중복 방지)
      let carToPartnerMap: Map<string, string> | null = null;
      let existingPolicyKeys: Set<string> | null = null;
      if (spec.key === 'insurance') {
        carToPartnerMap = new Map();
        for (const a of assets.data) {
          if (a.car_number && a.partner_code && a.status !== 'deleted') {
            carToPartnerMap.set(a.car_number, a.partner_code);
          }
        }
        existingPolicyKeys = new Set();
        const snap = await get(rtdbRef(db, 'insurances'));
        if (snap.exists()) {
          for (const v of Object.values(snap.val() as Record<string, { car_number?: string; policy_no?: string; status?: string }>)) {
            if (v?.status === 'deleted' || !v?.policy_no) continue;
            existingPolicyKeys.add(`${v.car_number ?? ''}|${v.policy_no}`);
          }
        }
      }

      for (const row of mappedRows) {
        // 필수필드 검증
        const missing = spec.schema.filter((f) => f.required && !row[f.col]).map((f) => f.label);
        if (missing.length) continue;

        // 보험: partner_code 자동 매칭 (빈 경우)
        if (carToPartnerMap && row.car_number && !row.partner_code) {
          row.partner_code = carToPartnerMap.get(String(row.car_number)) ?? '';
        }

        // 보험: 증권번호 중복 체크
        if (existingPolicyKeys && row.policy_no) {
          const dupKey = `${row.car_number ?? ''}|${row.policy_no}`;
          if (existingPolicyKeys.has(dupKey)) {
            skippedDup++;
            continue;
          }
          existingPolicyKeys.add(dupKey); // 현재 배치 내 중복도 방지
        }

        const payload = { ...row, created_at: Date.now(), status: 'active' };
        const r = push(base);
        await set(r, payload);
        ok++;

        // 계약 업로드 시 billings 자동 파생
        if (spec.key === 'contract' && r.key) {
          try {
            const dr = await deriveBillingsFromContract({ ...payload, _key: r.key } as RtdbContract);
            derivedBillings += dr.created;
          } catch { /* 파생 실패는 전체 저장 중단 안 함 */ }
        }
      }
      const derivedMsg = derivedBillings > 0 ? ` · 수납스케줄 ${derivedBillings}건 자동 생성` : '';
      const dupMsg = skippedDup > 0 ? ` · 중복 ${skippedDup}건 스킵` : '';
      const skipMsg = mappedRows.length - ok - skippedDup;
      toast.success(`${ok}건 저장 (필수필드 누락 ${skipMsg}건${dupMsg})${derivedMsg}`);
      reset();
    } catch (e) {
      toast.error(`저장 실패: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }, [spec, mappedRows, reset]);

  return (
    <Workspace layout="layout-37">
      {/* Panel 1 — 업로드 컨트롤 */}
      <section className="panel">
        <div className="panel-head">
          <div>
            <i className="ph ph-upload-simple" />
            <span className="panel-title">불러오기</span>
          </div>
          <div className="panel-head-actions">
            <button type="button" className="btn btn-sm btn-outline" onClick={reset}>
              <i className="ph ph-arrow-counter-clockwise" /> 초기화
            </button>
          </div>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* ① 데이터 종류 */}
          <div>
            <label className="form-label" style={{ display: 'block', marginBottom: 6 }}>① 데이터 종류</label>
            <select
              className="select"
              value={typeKey}
              onChange={(e) => setTypeKey(e.target.value)}
            >
              <option value="auto">자동 감지</option>
              <optgroup label="📂 기본 마스터">
                {SCHEMAS.filter((s) => s.groupLabel === '기본 마스터').map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </optgroup>
              <optgroup label="📊 거래·이력">
                {SCHEMAS.filter((s) => s.groupLabel === '거래·이력').map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </optgroup>
            </select>
            {typeKey === 'auto' && detectedKey && (
              <div className="form-hint" style={{ marginTop: 6 }}>
                ✓ 감지됨: <b>{SCHEMAS.find((s) => s.key === detectedKey)?.label}</b>
              </div>
            )}
          </div>

          {/* ② 스키마 안내 — 2줄 테이블 (헤더 + 샘플) */}
          {spec && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                <label className="form-label">
                  ② 스키마 <span className="text-text-muted">({spec.schema.length}개 · 빨강=필수)</span>
                </label>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                  <button type="button" className="btn btn-2xs btn-outline" onClick={copyHeaders}>
                    <i className="ph ph-copy" /> 헤더 복사
                  </button>
                  <button type="button" className="btn btn-2xs btn-outline" onClick={downloadSample}>
                    <i className="ph ph-download-simple" /> 샘플
                  </button>
                </div>
              </div>
              <div style={{ border: '1px solid var(--c-border)', borderRadius: 2, overflow: 'auto', maxWidth: '100%' }}>
                <table className="text-2xs" style={{ borderCollapse: 'collapse', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                  <thead>
                    <tr style={{ background: 'var(--c-bg-sub)' }}>
                      {spec.schema.map((f) => (
                        <th
                          key={f.col}
                          style={{
                            padding: '4px 8px',
                            borderRight: '1px solid var(--c-border)',
                            borderBottom: '1px solid var(--c-border)',
                            fontWeight: 600,
                            color: f.required ? 'var(--c-danger)' : 'var(--c-text-sub)',
                            textAlign: 'left',
                          }}
                        >
                          {f.label}{f.required && '*'}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {spec.schema.map((f) => (
                        <td
                          key={f.col}
                          style={{
                            padding: '4px 8px',
                            borderRight: '1px solid var(--c-border)',
                            color: 'var(--c-text-muted)',
                          }}
                        >
                          {SAMPLE_MAP[spec.key]?.[f.col] ?? '-'}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ③ 링크 불러오기 */}
          <div>
            <label className="form-label" style={{ display: 'block', marginBottom: 6 }}>③ 링크 불러오기</label>
            <div className="form-row">
              <div style={{ flex: 1 }}>
                <input
                  type="url"
                  className="input text-xs"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="Google Sheets · Drive · CSV 링크"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleLink(); } }}
                />
              </div>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={handleLink}
                disabled={linkBusy || !linkUrl.trim()}
                style={{ flexShrink: 0 }}
              >
                {linkBusy ? <><i className="ph ph-spinner spin" /> 불러오는 중</> : <><i className="ph ph-link" /> 불러오기</>}
              </button>
            </div>
            <div className="text-2xs text-text-muted" style={{ marginTop: 4 }}>
              Google Sheets 공유 링크 · Google Drive 파일 링크 · CSV URL
            </div>
          </div>

          {/* ④ 파일 불러오기 */}
          <div>
            <label className="form-label" style={{ display: 'block', marginBottom: 6 }}>④ 파일 불러오기</label>
            <label
              className="jpk-uploader-drop"
              onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault(); setDragOver(false);
                if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
              }}
              style={{
                borderColor: dragOver ? 'var(--c-primary)' : 'var(--c-border)',
                background: dragOver ? 'var(--c-primary-bg)' : 'var(--c-bg-sub)',
              }}
            >
              <input
                type="file"
                accept="*/*"
                hidden
                onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value = ''; }}
              />
              <i className="ph ph-upload-simple text-[18px]" />
              <div>
                <div className="text-base" style={{ fontWeight: 600 }}>
                  {fileName || '파일 불러오기'}
                </div>
                <div className="text-text-muted text-2xs">
                  CSV · PDF · 이미지 · 클릭 또는 드래그
                </div>
              </div>
            </label>
          </div>

          {/* OCR 진행 */}
          {ocrBusy && (
            <div
              className="text-xs text-primary" style={{ padding: 10, background: 'var(--c-primary-bg)', border: '1px solid var(--c-primary)', borderRadius: 2, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <i className="ph ph-spinner spin" /> {ocrProgress}
            </div>
          )}

          {/* ④ 감지 결과 */}
          {rawRows.length > 0 && !ocrBusy && (
            <div
              className="text-xs text-success" style={{ padding: 10, background: 'var(--c-success-bg)', border: '1px solid var(--c-success)', borderRadius: 2 }}
            >
              ✓ <b>{rawRows.length}</b>행 파싱 완료 {spec && ` · ${spec.label}로 매핑`}
            </div>
          )}

          {/* OCR 원문 */}
          {ocrRawText && !ocrBusy && (
            <details style={{ marginTop: 4 }}>
              <summary className="text-xs text-text-muted" style={{ cursor: 'pointer', padding: '4px 0' }}>
                OCR 원문 보기
              </summary>
              <pre className="text-2xs" style={{ background: 'var(--c-bg-sub)', padding: 8, borderRadius: 2, maxHeight: 160, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginTop: 4 }}>
                {ocrRawText}
              </pre>
            </details>
          )}
        </div>
      </section>

      {/* Panel 2 — 미리보기 */}
      <section className="panel">
        <div className="panel-head">
          <div>
            <i className="ph ph-eye" />
            <span className="panel-title">데이터 미리보기</span>
            <span className="panel-subtitle">
              {fileName || '파일을 불러오세요'}
              {mappedRows.length > 0 && ` · ${mappedRows.length}건`}
            </span>
          </div>
          <div className="panel-head-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={commit}
              disabled={!spec || mappedRows.length === 0 || saving}
            >
              {saving ? (<><i className="ph ph-spinner spin" /> 저장 중...</>) : (<><i className="ph ph-check" /> 반영</>)}
            </button>
          </div>
        </div>
        <div className="panel-body no-pad" style={{ overflow: 'hidden' }}>
          {mappedRows.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center gap-2 text-text-muted"
              style={{ padding: 40, height: '100%' }}
            >
              <i className="ph ph-table" style={{ fontSize: 32 }} />
              <div className="text-base">좌측에서 파일을 불러오면 여기에 미리보기가 표시됩니다</div>
            </div>
          ) : (
            <JpkGrid
              ref={gridRef}
              columnDefs={columnDefs}
              rowData={mappedRows}
              storageKey={`jpk.grid.upload.${spec?.key ?? 'unknown'}`}
              options={{ tooltipShowDelay: 300 }}
            />
          )}
        </div>
      </section>
    </Workspace>
  );
}
