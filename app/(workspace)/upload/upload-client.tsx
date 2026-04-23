'use client';

import { useMemo, useState, useRef, useCallback } from 'react';
import { Workspace } from '@/components/shared/panel';
import { JpkGrid, type JpkGridApi } from '@/components/shared/jpk-grid';
import { typedColumn } from '@/lib/grid/typed-column';
import { toast } from 'sonner';
import { ref as rtdbRef, push, set, update, get, query, orderByChild, equalTo } from 'firebase/database';
import { getRtdb } from '@/lib/firebase/rtdb';
import { parseCsvObjects } from '@/lib/csv';
import { ocrFile, extractCarNumber, extractAmount, extractDate } from '@/lib/ocr';
import { detectInsurance, parseInsurance, type InsuranceParsed } from '@/lib/parsers/insurance';
import { detectPenalty, parsePenalty } from '@/lib/parsers/penalty';
import { detectVehicleReg } from '@/lib/parsers/vehicle-reg';
import { detectBusinessReg } from '@/lib/parsers/business-reg';
import { extractVehicleReg, extractBusinessReg } from '@/lib/claude-extract';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import { normalizeAsset } from '@/lib/asset-normalize';
import { inferMakerFromVin } from '@/lib/vin-wmi';
import {
  nextPartnerCode, nextCustomerCode, nextAssetCode,
  nextVendorCode, nextLoanCode, nextInsuranceCode, nextGpsCode,
} from '@/lib/code-gen';
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
    // 개별입력 폼(asset-create-form.tsx)의 buildPayload와 동일 필드 구성
    key: 'asset', label: '자산 (차량)', path: 'assets', groupLabel: '기본 마스터',
    schema: [
      // 차량 식별
      { col: 'partner_code', label: '회사코드' },
      { col: 'car_number', label: '차량번호', required: true },
      // 제조사 스펙
      { col: 'manufacturer', label: '제조사' },
      { col: 'car_model', label: '모델' },
      { col: 'detail_model', label: '세부모델' },
      { col: 'trim', label: '세부트림' },
      { col: 'options', label: '선택옵션' },
      { col: 'ext_color', label: '외장색' },
      { col: 'int_color', label: '내장색' },
      { col: 'drive_type', label: '구동방식' },
      { col: 'category', label: '분류' },
      { col: 'origin', label: '구분' },
      { col: 'powertrain', label: '동력' },
      { col: 'battery_kwh', label: '배터리(kWh)', num: true },
      { col: 'model_code', label: '모델코드' },
      // 등록증 스펙
      { col: 'vin', label: '차대번호' },
      { col: 'car_year', label: '연식', num: true },
      { col: 'displacement', label: '배기량', num: true },
      { col: 'seats', label: '승차정원', num: true },
      { col: 'fuel_type', label: '연료' },
      { col: 'type_number', label: '형식번호' },
      { col: 'engine_type', label: '원동기형식' },
      { col: 'first_registration_date', label: '최초등록일' },
      { col: 'usage_type', label: '용도' },
      { col: 'owner_name', label: '소유자' },
      { col: 'owner_biz_no', label: '법인등록번호' },
      { col: 'address', label: '사용본거지' },
      { col: 'length_mm', label: '전장(mm)', num: true },
      { col: 'width_mm', label: '전폭(mm)', num: true },
      { col: 'height_mm', label: '전고(mm)', num: true },
      { col: 'gross_weight_kg', label: '총중량(kg)', num: true },
    ],
  },
  {
    key: 'contract', label: '계약', path: 'contracts', groupLabel: '기본 마스터',
    schema: [
      { col: 'partner_code', label: '회사코드', required: true },
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
      { col: 'partner_code', label: '회사코드' },
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
      { col: 'corp_no', label: '법인등록번호' },
      { col: 'address', label: '사업장주소' },
      { col: 'email', label: '이메일' },
      { col: 'phone', label: '전화' },
      { col: 'contact_name', label: '담당자' },
      { col: 'open_date', label: '개업일' },
      { col: 'industry', label: '업태' },
      { col: 'category', label: '종목' },
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
      { col: 'partner_code', label: '회사코드' },
      { col: 'insured_name', label: '계약자명' },
      { col: 'insured_biz_no', label: '사업자번호' },
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
    key: 'penalty', label: '과태료·범칙금', path: 'events', groupLabel: '거래·이력',
    schema: [
      { col: 'partner_code', label: '회사코드' },
      { col: 'car_number', label: '차량번호', required: true },
      { col: 'payer_name', label: '부담자' },
      { col: 'doc_type', label: '구분' },
      { col: 'notice_no', label: '고지번호', required: true },
      { col: 'issuer', label: '발부기관' },
      { col: 'issue_date', label: '고지일' },
      { col: 'date', label: '위반일시' },
      { col: 'location', label: '위반장소' },
      { col: 'description', label: '위반내용' },
      { col: 'law_article', label: '법조항' },
      { col: 'amount', label: '금액', num: true },
      { col: 'penalty_amount', label: '과태료', num: true },
      { col: 'fine_amount', label: '범칙금', num: true },
      { col: 'toll_amount', label: '통행료', num: true },
      { col: 'surcharge_amount', label: '가산금', num: true },
      { col: 'demerit_points', label: '벌점', num: true },
      { col: 'due_date', label: '납부기한' },
      { col: 'opinion_period', label: '의견진술기한' },
      { col: 'pay_account', label: '납부계좌' },
    ],
  },
  {
    key: 'gps', label: 'GPS 장착', path: 'gps_devices', groupLabel: '기본 마스터',
    schema: [
      { col: 'car_number', label: '차량번호', required: true },
      { col: 'partner_code', label: '회사코드' },
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
    partner_code: 'CP01', car_number: '12가3456',
    manufacturer: '현대', car_model: '아반떼', detail_model: 'CN7 스마트',
    trim: '프리미엄', options: '선루프, HUD', ext_color: '흰색', int_color: '블랙',
    drive_type: '전륜', category: '준중형', origin: '국산', powertrain: '내연기관',
    battery_kwh: '', model_code: 'AD',
    vin: 'KMHD14LE1AA123456', car_year: '2023',
    displacement: '1598', seats: '5',
    fuel_type: '가솔린', type_number: 'NKC90D', engine_type: 'G4FL',
    first_registration_date: '2023-03-15', usage_type: '렌터카',
    owner_name: '스위치플랜(주)',
  },
  contract: {
    partner_code: 'CP01', contract_code: '(자동생성)', car_number: '12가3456',
    contractor_name: '홍길동', contractor_phone: '010-1234-5678',
    start_date: '2026-01-01', end_date: '2027-12-31',
    rent_months: '24', rent_amount: '450000', deposit_amount: '1000000',
  },
  customer: {
    partner_code: 'CP01', name: '홍길동', phone: '010-1234-5678',
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
    partner_code: 'CP01', car_number: '12가3456', car_name: '아반떼',
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
    if (m.archived) continue;  // 15년 초과 단종 제외
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
    // 마스터에 있는 필드(maker/model/sub/category/origin)만 자동 채움.
    // 연료/배기량/승차/배터리 등은 등록증 OCR에서 직접 취득 (마스터에 없음).
    if (!enriched.manufacturer && best.maker) enriched.manufacturer = best.maker;
    if (!enriched.car_model && best.model) enriched.car_model = best.model;
    if (!enriched.detail_model && best.sub) enriched.detail_model = best.sub;
    if (!enriched.category && best.category) enriched.category = best.category;
    if (!enriched.origin && best.origin) enriched.origin = best.origin;
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
  const partners = useRtdbCollection<Record<string, unknown>>('partners');
  const insurances = useRtdbCollection<Record<string, unknown>>('insurances');
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
        const { data, corrections, fuzzyMatches } = normalizeAsset(row as Record<string, unknown>, vehicleMasters.data);
        if (Object.keys(corrections).length > 0) data._corrections = corrections;
        if (Object.keys(fuzzyMatches).length > 0) data._fuzzy_matches = fuzzyMatches;
        return data;
      });

      // 차종마스터 미등록 행 식별 → 저장 스킵
      // 정책: 제조사 또는 모델이 마스터에 없으면 저장 안 함. 사용자가 마스터 먼저 등록 후 재업로드.
      const activeMasters = vehicleMasters.data.filter((m) => m.status !== 'deleted');
      const validMakers = new Set(activeMasters.map((m) => m.maker).filter(Boolean) as string[]);
      const modelsByMaker = new Map<string, Set<string>>();
      for (const m of activeMasters) {
        if (!m.maker || !m.model) continue;
        if (!modelsByMaker.has(m.maker)) modelsByMaker.set(m.maker, new Set());
        modelsByMaker.get(m.maker)!.add(m.model);
      }
      rows = rows.map((row) => {
        const mfg = String(row.manufacturer ?? '');
        const mdl = String(row.car_model ?? '');
        if (!mfg || !validMakers.has(mfg)) {
          return { ...row, _skip_reason: `차종마스터에 제조사 "${mfg || '(없음)'}" 미등록` };
        }
        const modelsForMaker = modelsByMaker.get(mfg);
        if (!mdl || !modelsForMaker?.has(mdl)) {
          return { ...row, _skip_reason: `차종마스터에 "${mfg}/${mdl || '(없음)'}" 미등록` };
        }
        return row;
      });
    }

    // 자산 — 차량번호 빈 값일 때 VIN으로 기존 assets에서 역추론
    // (OCR이 한글 인식 실패해도 VIN 맞으면 자동 채움)
    if (spec.key === 'asset' && assets.data.length > 0) {
      const byVin = new Map<string, string>();
      for (const a of assets.data) {
        if (a.status === 'deleted') continue;
        if (a.vin && a.car_number) byVin.set(String(a.vin), String(a.car_number));
      }
      rows = rows.map((row) => {
        if (row.car_number) return row;
        if (!row.vin) return row;
        const inferred = byVin.get(String(row.vin));
        if (inferred) {
          const corrections = (row._corrections as Record<string, string>) ?? {};
          const fuzzy = (row._fuzzy_matches as Record<string, boolean>) ?? {};
          return {
            ...row,
            car_number: inferred,
            _corrections: { ...corrections, car_number: '' },
            _fuzzy_matches: { ...fuzzy, car_number: true },  // VIN 추론 표시
            _car_number_from_vin: true,
          };
        }
        return row;
      });
    }

    // 자산 — partner_code 자동 매칭 (CSV/링크 업로드도 소유자 정보로 회사 찾기)
    // PDF OCR에서는 이미 처리되지만, CSV는 partner_code 비어있는 경우 많아서 여기서 공통 처리
    if (spec.key === 'asset' && partners.data.length > 0) {
      const digits = (s: string) => String(s).replace(/\D/g, '');
      // 법인 접미어/괄호/공백 정규화: "스위치플랜(주)" === "스위치플랜 주식회사" === "스위치플랜㈜"
      const normalizeCorpName = (s: string) => String(s)
        .replace(/\s+/g, '')
        .replace(/주식회사|유한회사|\(주\)|\(유\)|㈜|㈕|주\)|유\)/g, '')
        .replace(/[().,\-_]/g, '')
        .toLowerCase();
      const partnersLive = partners.data.filter((p) => (p as { status?: string }).status !== 'deleted');
      rows = rows.map((row) => {
        // 이미 partner_code 있으면 그대로 (사용자 명시 입력 존중)
        if (row.partner_code) return row;
        const ownerNameNorm = row.owner_name ? normalizeCorpName(String(row.owner_name)) : '';
        const ownerBizDigits = row.owner_biz_no ? digits(String(row.owner_biz_no)) : '';
        let matched = '';
        // 1순위: 법인번호/사업자번호 (digits만 비교 → 포맷 무관)
        if (ownerBizDigits) {
          for (const p of partnersLive) {
            const pCorpDigits = p.corp_no ? digits(String(p.corp_no)) : '';
            const pBizDigits = p.biz_no ? digits(String(p.biz_no)) : '';
            if (ownerBizDigits === pCorpDigits || ownerBizDigits === pBizDigits) {
              matched = String(p.partner_code ?? '');
              break;
            }
          }
        }
        // 2순위: 회사명 (괄호/접미어 흡수 후 비교)
        if (!matched && ownerNameNorm) {
          for (const p of partnersLive) {
            const pNameNorm = p.partner_name ? normalizeCorpName(String(p.partner_name)) : '';
            if (!pNameNorm) continue;
            if (pNameNorm === ownerNameNorm || pNameNorm.includes(ownerNameNorm) || ownerNameNorm.includes(pNameNorm)) {
              matched = String(p.partner_code ?? '');
              break;
            }
          }
        }
        if (matched) return { ...row, partner_code: matched };
        return row;
      });
    }

    // ── 기존 데이터와 대조해서 신규/보완수정/변경없음 상태 부여 ──
    // asset: car_number → VIN(차대번호) 순으로 폴백 매칭
    // insurance: car_number|policy_no, member: biz_no
    let findExisting: ((r: Record<string, unknown>) => Record<string, unknown> | null) | null = null;

    if (spec.key === 'asset') {
      const byCarNum = new Map<string, Record<string, unknown>>();
      const byVin = new Map<string, Record<string, unknown>>();
      for (const a of assets.data) {
        if (a.status === 'deleted') continue;
        const rec = a as unknown as Record<string, unknown>;
        if (a.car_number) byCarNum.set(String(a.car_number), rec);
        if (a.vin) byVin.set(String(a.vin), rec);
      }
      findExisting = (r) => {
        if (r.car_number) {
          const hit = byCarNum.get(String(r.car_number));
          if (hit) return hit;
        }
        if (r.vin) {
          const hit = byVin.get(String(r.vin));
          if (hit) return hit;
        }
        return null;
      };
    } else if (spec.key === 'insurance') {
      const map = new Map<string, Record<string, unknown>>();
      for (const ins of insurances.data) {
        if (ins.policy_no && ins.status !== 'deleted') {
          map.set(`${ins.car_number ?? ''}|${ins.policy_no}`, ins);
        }
      }
      findExisting = (r) => map.get(`${r.car_number ?? ''}|${r.policy_no ?? ''}`) ?? null;
    } else if (spec.key === 'member') {
      const map = new Map<string, Record<string, unknown>>();
      for (const p of partners.data) {
        if (p.biz_no && p.status !== 'deleted') {
          map.set(String(p.biz_no), p);
        }
      }
      findExisting = (r) => r.biz_no ? (map.get(String(r.biz_no)) ?? null) : null;
    }

    if (findExisting) {
      rows = rows.map((row) => {
        // 마스터 미등록 플래그가 이미 있으면 '스킵' 상태로 고정
        if (row._skip_reason) {
          return { ...row, _upsert_status: 'skip' };
        }
        const existing = findExisting!(row);
        if (!existing) {
          return { ...row, _upsert_status: 'new' };
        }
        // diff: 비어있지 않고 기존과 다른 필드 목록
        const changed: string[] = [];
        for (const [k, v] of Object.entries(row)) {
          if (k.startsWith('_')) continue;
          if (v === '' || v == null) continue;
          const oldV = existing[k];
          if (String(oldV ?? '') !== String(v)) changed.push(k);
        }
        return {
          ...row,
          _upsert_status: changed.length > 0 ? 'update' : 'unchanged',
          _changed_fields: changed,
        };
      });
    }

    return rows;
  }, [rawRows, spec, vehicleMasters.data, assets.data, insurances.data, partners.data]);

  const columnDefs = useMemo<ColDef[]>(() => {
    if (!spec) return [];
    const UPSERT_SUPPORTED = spec.key === 'asset' || spec.key === 'insurance' || spec.key === 'member';
    return [
      typedColumn<Record<string, unknown>>('action', { headerName: '#', valueGetter: (p) => (p.node?.rowIndex ?? 0) + 1, width: 45, cellStyle: { color: 'var(--c-text-muted)' } }),
      // 신규/보완수정/변경없음 상태 컬럼 (지원 타입만)
      ...(UPSERT_SUPPORTED ? [typedColumn<Record<string, unknown>>('text', {
        headerName: '상태',
        field: '_upsert_status',
        width: 90,
        valueFormatter: (p: { value: unknown }) => {
          if (p.value === 'new') return '🆕 신규';
          if (p.value === 'update') return '🔄 보완수정';
          if (p.value === 'unchanged') return '✓ 동일';
          if (p.value === 'skip') return '⏭️ 스킵';
          return '-';
        },
        cellStyle: (p) => {
          if (p.value === 'new') return { color: 'var(--c-success)', fontWeight: 600 };
          if (p.value === 'update') return { color: 'var(--c-primary)', fontWeight: 600 };
          if (p.value === 'unchanged') return { color: 'var(--c-text-muted)' };
          if (p.value === 'skip') return { color: 'var(--c-danger)', fontWeight: 600, background: 'var(--c-danger-bg)' };
          return undefined;
        },
        tooltipValueGetter: (p) => {
          const skipReason = (p.data as Record<string, unknown>)?._skip_reason as string | undefined;
          if (skipReason) return `저장 안 됨: ${skipReason}`;
          const changed = (p.data as Record<string, unknown>)?._changed_fields as string[] | undefined;
          if (changed && changed.length > 0) {
            const labels = changed.map((c) => spec.schema.find((f) => f.col === c)?.label ?? c);
            return `변경: ${labels.join(', ')}`;
          }
          return undefined;
        },
      })] : []),
      ...(spec.schema.map((f) =>
        typedColumn<Record<string, unknown>>(f.num ? 'number' : 'text', {
          headerName: f.label + (f.required ? ' *' : ''),
          field: f.col,
          width: 120,
          // 셀 직접 편집 허용 — OCR이 못 채운 필드(세부트림·선택옵션·색상 등)를 미리보기에서 입력
          editable: true,
          ...(f.num ? { valueFormatter: (p: { value: unknown }) => {
            const v = Number(p.value);
            if (!v) return '-';
            // 연도(year) 필드는 천단위 콤마 없이 출력
            if (/year$/.test(f.col) || f.col === 'year') return String(v);
            return v.toLocaleString('ko-KR');
          } } : {}),
          cellStyle: (p) => {
            // 0) 자산 타입: 필수인 차량번호가 빈 값이면 빨간색 경고 (OCR 실패 + VIN 미존재)
            if (spec.key === 'asset' && f.col === 'car_number' && !p.value) {
              return { background: 'var(--c-danger-bg)', color: 'var(--c-danger)', fontWeight: 700 };
            }
            // 1) 보완수정 대상 필드는 노란색 배경
            const changed = (p.data as Record<string, unknown>)?._changed_fields as string[] | undefined;
            const status = (p.data as Record<string, unknown>)?._upsert_status as string | undefined;
            if (status === 'update' && changed?.includes(f.col)) {
              return { background: 'var(--c-warning-bg)', color: 'var(--c-warning)', fontWeight: 600 };
            }
            // 2) 유사 매칭 / VIN 추론 등 — 노란색 이탤릭
            const fuzzy = (p.data as Record<string, unknown>)?._fuzzy_matches as Record<string, boolean> | undefined;
            if (fuzzy && fuzzy[f.col]) {
              return { color: 'var(--c-warning)', fontWeight: 600, fontStyle: 'italic' };
            }
            // 3) normalizeAsset 보정(정확 매칭)은 primary 색상
            const corr = (p.data as Record<string, unknown>)?._corrections as Record<string, string> | undefined;
            if (corr && f.col in corr) {
              return { color: 'var(--c-primary)', fontWeight: 600 };
            }
            return undefined;
          },
          tooltipValueGetter: (p) => {
            const inferred = (p.data as Record<string, unknown>)?._car_number_from_vin;
            if (f.col === 'car_number' && inferred) {
              return '차량번호 OCR 실패 → VIN(차대번호)으로 기존 자산에서 자동 조회';
            }
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

  // 같은 타입 문서를 연속 업로드하면 기존 목록 위에 누적 (중복은 자연키로 제거).
  // 다른 타입이면 기존 덮어쓰기 (경고 토스트).
  const appendOrReplace = useCallback((
    newRows: Array<Record<string, string>>,
    targetKey: string,
  ) => {
    const getNaturalKey = (r: Record<string, string>): string => {
      if (targetKey === 'asset') return r.car_number ?? '';
      if (targetKey === 'insurance') return `${r.car_number ?? ''}|${r.policy_no ?? ''}`;
      if (targetKey === 'member') return r.biz_no ?? '';
      return '';
    };

    let addedCount = 0;
    let skippedCount = 0;
    let replaced = false;

    setRawRows((prev) => {
      if (prev.length > 0 && detectedKey && detectedKey !== targetKey) {
        replaced = true;
        addedCount = newRows.length;
        return newRows;
      }
      // 같은 타입 → 누적 + 배치 내·기존과 자연키 중복 제거
      const existing = new Set<string>();
      for (const r of prev) {
        const k = getNaturalKey(r as Record<string, string>);
        if (k) existing.add(k);
      }
      const toAdd: Array<Record<string, string>> = [];
      for (const r of newRows) {
        const k = getNaturalKey(r);
        if (k && existing.has(k)) { skippedCount++; continue; }
        if (k) existing.add(k);
        toAdd.push(r);
        addedCount++;
      }
      return [...prev, ...toAdd];
    });
    setDetectedKey(targetKey);
    return { addedCount, skippedCount, replaced };
  }, [detectedKey]);

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

        // ── 자동차등록증 감지: Gemini OCR로 구조화 추출 ──
        const isVehicleReg = pages.some((p) => detectVehicleReg(p));
        if (isVehicleReg) {
          setOcrProgress('Gemini OCR로 등록증 분석 중...');
          try {
            // Gemini에는 raw 차명만 뽑게 하고, 차종마스터 매칭은 client의 normalizeAsset에서 처리.
            // (마스터 ~1000개를 매 요청에 넣으면 분당 토큰 한도 쉽게 초과함)
            const claudeRes = await extractVehicleReg(file);
            const reg = claudeRes.extracted;
            if (reg && (reg.car_number || reg.vin || reg.car_name)) {
              // Gemini가 vehicle_master 컨텍스트 보고 이미 매칭한 값 사용
              // (차종마스터 전달 → Gemini가 직접 maker/model/sub 선택)
              let manufacturer = reg.manufacturer ?? '';
              let carModel = reg.car_model ?? '';
              const detailModel = reg.detail_model ?? '';

              // Gemini가 매칭 못 한 경우 폴백:
              if (!manufacturer && reg.car_name) {
                // 차명에서 토큰 분리 시도 + VIN WMI 폴백
                const KNOWN_MAKERS = new Set([
                  '현대', '기아', '제네시스', '쉐보레', 'KGM', '르노',
                  '벤츠', 'BMW', '아우디', '폭스바겐', '포르쉐', '미니',
                  '테슬라', '볼보', '렉서스', '토요타', '혼다', '닛산', '마쓰다',
                  '포드', '지프', '짚', '캐딜락', '랜드로버', '재규어',
                  '푸조', '시트로엥', '링컨', '크라이슬러',
                ]);
                const rawName = reg.car_name.replace(/\s*\([^)]*\)/g, '').trim();
                const nameTokens = rawName.split(/\s+/).filter(Boolean);
                if (nameTokens.length > 1 && KNOWN_MAKERS.has(nameTokens[0])) {
                  manufacturer = nameTokens[0];
                  if (!carModel) carModel = nameTokens.slice(1).join(' ');
                } else if (!carModel) {
                  carModel = rawName;
                }
              }
              const vinMakerHint = manufacturer ? '' : (inferMakerFromVin(reg.vin) ?? '');
              if (vinMakerHint && !manufacturer) manufacturer = vinMakerHint;

              // partner_code 자동 매칭은 mappedRows useMemo에서 공통 처리 (CSV도 동일)
              // owner_biz_no = 법인(사업자)등록번호 → partners.biz_no / corp_no 와 매칭
              const assetRow: Record<string, string> = {
                partner_code: '',
                car_number: reg.car_number ?? '',
                vin: reg.vin ?? '',
                manufacturer,
                car_model: carModel,
                detail_model: detailModel,
                car_year: reg.car_year ? String(reg.car_year) : '',
                fuel_type: reg.fuel_type ?? '',
                displacement: reg.displacement ? String(reg.displacement) : '',
                seats: reg.seats ? String(reg.seats) : '',
                usage_type: reg.usage_type ?? '',
                first_registration_date: reg.first_registration_date ?? '',
                type_number: reg.type_number ?? '',
                engine_type: reg.engine_type ?? '',
                owner_name: reg.owner_name ?? '',
                owner_biz_no: reg.owner_biz_no ?? '',
                address: reg.address ?? '',
                length_mm: reg.length_mm ? String(reg.length_mm) : '',
                width_mm: reg.width_mm ? String(reg.width_mm) : '',
                height_mm: reg.height_mm ? String(reg.height_mm) : '',
                gross_weight_kg: reg.gross_weight_kg ? String(reg.gross_weight_kg) : '',
                _vin_maker_hint: vinMakerHint,
              };
              setOcrRawText(`[Gemini OCR — ${claudeRes.model}]\n${JSON.stringify(reg, null, 2)}`);
              const res = appendOrReplace([assetRow], 'asset');
              const dupMsg = res.skippedCount > 0 ? ` · 중복 ${res.skippedCount}건 제외` : '';
              const replaceMsg = res.replaced ? ' · 이전 데이터 교체됨' : '';
              const usage = claudeRes.usage;
              const costMsg = usage ? ` · ${usage.input_tokens}+${usage.output_tokens} tokens` : '';
              toast.success(`자동차등록증 추출 완료 (Gemini OCR) · ${res.addedCount}대${dupMsg}${replaceMsg}${costMsg}`);
              return;
            } else {
              toast.warning('Gemini OCR이 등록증을 인식했으나 핵심 필드 추출 실패');
            }
          } catch (err) {
            console.error('Gemini OCR 호출 실패:', err);
            toast.error(`Gemini OCR 실패: ${(err as Error).message}`);
            return;
          }
        }

        // ── 사업자등록증 감지: Gemini OCR로 구조화 추출 ──
        const isBizReg = pages.some((p) => detectBusinessReg(p));
        if (isBizReg) {
          setOcrProgress('Gemini OCR로 사업자등록증 분석 중...');
          try {
            const claudeRes = await extractBusinessReg(file);
            const biz = claudeRes.extracted;
            if (biz && biz.biz_no) {
              const memberRow: Record<string, string> = {
                partner_name: biz.partner_name ?? '',
                ceo: biz.ceo ?? '',
                biz_no: biz.biz_no,
                corp_no: biz.corp_no ?? '',
                address: biz.address ?? biz.hq_address ?? '',
                email: biz.email ?? '',
                open_date: biz.open_date ?? '',
                industry: biz.industry ?? '',
                category: biz.category ?? '',
              };
              setOcrRawText(`[Gemini OCR — ${claudeRes.model}]\n${JSON.stringify(biz, null, 2)}`);
              const res = appendOrReplace([memberRow], 'member');
              const dupMsg = res.skippedCount > 0 ? ` · 중복 ${res.skippedCount}건 제외` : '';
              const replaceMsg = res.replaced ? ' · 이전 데이터 교체됨' : '';
              toast.success(`사업자등록증 추출 완료 (Gemini OCR) · ${res.addedCount}건${dupMsg}${replaceMsg}`);
              return;
            } else {
              toast.warning('Gemini OCR이 사업자등록증을 인식했으나 사업자번호 추출 실패');
            }
          } catch (err) {
            console.error('Gemini OCR 호출 실패:', err);
            toast.error(`Gemini OCR 실패: ${(err as Error).message}`);
            return;
          }
        }

        // ── (레거시 — 위에서 모두 return하므로 여기 도달 안 함) 사업자등록증 정규식 ──
        const bizPages: string[] = [];
        if (bizPages.length > 0) {
          const memberRows: Array<Record<string, string>> = [];
          const seenBizNo = new Set<string>();
          for (const p of bizPages) {
            const biz = { biz_no: '', partner_name: '', ceo: '', corp_no: '', address: '', hq_address: '', email: '', open_date: '', industry: '', category: '' };
            if (!biz.biz_no || seenBizNo.has(biz.biz_no)) continue;
            seenBizNo.add(biz.biz_no);
            memberRows.push({
              partner_name: biz.partner_name,
              ceo: biz.ceo,
              biz_no: biz.biz_no,
              corp_no: biz.corp_no,
              address: biz.address || biz.hq_address,
              email: biz.email,
              open_date: biz.open_date,
              industry: biz.industry,
              category: biz.category,
            });
          }
          if (memberRows.length > 0) {
            const res = appendOrReplace(memberRows, 'member');
            const dupMsg = res.skippedCount > 0 ? ` · 중복 ${res.skippedCount}건 제외` : '';
            const replaceMsg = res.replaced ? ' · 이전 데이터 교체됨' : '';
            toast.success(`사업자등록증 OCR 완료 · ${res.addedCount}건 추가${dupMsg}${replaceMsg}`);
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

            // 사업자번호 + 회사명 → partner_code fallback 매칭 (차량 미등록 시 대비)
            const bizToPartner = new Map<string, string>();
            const nameToPartner = new Map<string, string>();
            const normalizeCorpName = (s: string) => String(s)
              .replace(/\s+/g, '')
              .replace(/주식회사|유한회사|\(주\)|\(유\)|㈜|㈕|주\)|유\)/g, '')
              .replace(/[().,\-_]/g, '')
              .toLowerCase();
            try {
              const pSnap = await get(rtdbRef(getRtdb(), 'partners'));
              if (pSnap.exists()) {
                for (const v of Object.values(pSnap.val() as Record<string, { biz_no?: string; corp_no?: string; partner_name?: string; partner_code?: string; status?: string }>)) {
                  if (v?.status === 'deleted' || !v?.partner_code) continue;
                  if (v.biz_no) {
                    const norm = String(v.biz_no).replace(/\D/g, '');
                    if (norm) bizToPartner.set(norm, v.partner_code);
                  }
                  if (v.corp_no) {
                    const norm = String(v.corp_no).replace(/\D/g, '');
                    if (norm) bizToPartner.set(norm, v.partner_code);
                  }
                  if (v.partner_name) {
                    const key = normalizeCorpName(v.partner_name);
                    if (key) nameToPartner.set(key, v.partner_code);
                  }
                }
              }
            } catch { /* silent */ }

            let matchedCount = 0;

            // col 키로 직접 매핑 — mapHeaders를 거치지 않도록 col 이름 사용
            const insuranceRows: Array<Record<string, string>> = parsed.map((ins) => {
              // 1차: 차량번호 → 2차: 사업자번호(10자리 이상 full match) → 3차: 피보험자 회사명
              let partnerCode = carToPartner.get(ins.car_number) ?? '';
              if (!partnerCode && ins.insured_biz_no) {
                const normBiz = ins.insured_biz_no.replace(/\D/g, '');
                // 10자리 이상이고 '*' 마스킹 없을 때만 사용 (마스킹된 '158-81-*****'는 5자리만 남아 오매칭 방지)
                if (normBiz.length >= 9 && !ins.insured_biz_no.includes('*')) {
                  partnerCode = bizToPartner.get(normBiz) ?? '';
                }
              }
              // 3차: 회사명 매칭 — 마스킹된 사업자번호 케이스 커버
              if (!partnerCode && ins.insured_name) {
                const nameKey = normalizeCorpName(ins.insured_name);
                if (nameKey) {
                  partnerCode = nameToPartner.get(nameKey) ?? '';
                  // 정확 매치 실패 시 부분 매칭 (스위치플랜(주) ↔ 스위치플랜)
                  if (!partnerCode) {
                    for (const [k, v] of nameToPartner) {
                      if (k === nameKey || k.includes(nameKey) || nameKey.includes(k)) {
                        partnerCode = v;
                        break;
                      }
                    }
                  }
                }
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
            const res = appendOrReplace(insuranceRows, 'insurance');
            const partnerMsg = matchedCount > 0 ? ` · 회원사 ${matchedCount}건 매칭` : '';
            const dupMsg = res.skippedCount > 0 ? ` · 중복 ${res.skippedCount}건 제외` : '';
            const replaceMsg = res.replaced ? ' · 이전 데이터 교체됨' : '';
            toast.success(`보험증권 OCR 완료 · ${res.addedCount}대 추가 (${pages.length}페이지)${partnerMsg}${dupMsg}${replaceMsg}`);
          } else {
            setRawRows([]);
            toast.info('보험증권 인식됐으나 차량번호 추출 실패');
          }
          return;
        }

        // ── 과태료·범칙금 고지서 감지 ──
        const penaltyPages = pages.filter((p) => detectPenalty(p));
        if (penaltyPages.length > 0 && penaltyPages.length >= pages.length * 0.5) {
          const parsed: ReturnType<typeof parsePenalty>[] = [];
          const seen = new Set<string>();
          for (const p of penaltyPages) {
            const lines = p.split('\n').map((l) => l.trim()).filter(Boolean);
            const pen = parsePenalty(p, lines);
            if (!pen.car_number && !pen.notice_no) continue;
            const key = `${pen.car_number}|${pen.notice_no}`;
            if (seen.has(key)) continue;
            seen.add(key);
            parsed.push(pen);
          }

          if (parsed.length > 0) {
            // 차량번호 → partner_code 매칭 (assets 기반)
            const carToPartner = new Map<string, string>();
            for (const a of assets.data) {
              if (a.car_number && a.partner_code && a.status !== 'deleted') {
                carToPartner.set(a.car_number, a.partner_code);
              }
            }
            let matchedCount = 0;
            const penaltyRows: Array<Record<string, string>> = parsed.map((pen) => {
              const partnerCode = carToPartner.get(pen.car_number) ?? '';
              if (partnerCode) matchedCount++;
              return {
                partner_code: partnerCode,
                car_number: pen.car_number,
                payer_name: pen.payer_name,
                doc_type: pen.doc_type,
                notice_no: pen.notice_no,
                issuer: pen.issuer,
                issue_date: pen.issue_date,
                date: pen.date,
                location: pen.location,
                description: pen.description,
                law_article: pen.law_article,
                amount: String(pen.amount),
                penalty_amount: String(pen.penalty_amount),
                fine_amount: String(pen.fine_amount),
                toll_amount: String(pen.toll_amount),
                surcharge_amount: String(pen.surcharge_amount),
                demerit_points: String(pen.demerit_points),
                due_date: pen.due_date,
                opinion_period: pen.opinion_period,
                pay_account: pen.pay_account,
              };
            });
            const res = appendOrReplace(penaltyRows, 'penalty');
            const partnerMsg = matchedCount > 0 ? ` · 회원사 ${matchedCount}건 매칭` : '';
            const dupMsg = res.skippedCount > 0 ? ` · 중복 ${res.skippedCount}건 제외` : '';
            const replaceMsg = res.replaced ? ' · 이전 데이터 교체됨' : '';
            toast.success(`과태료·범칙금 OCR 완료 · ${res.addedCount}건 추가 (${pages.length}페이지)${partnerMsg}${dupMsg}${replaceMsg}`);
          } else {
            setRawRows([]);
            toast.info('과태료 고지서 인식됐으나 필수 정보 추출 실패');
          }
          return;
        }

        {
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
  }, [appendOrReplace]);

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

      // ── 기존 레코드 조회 (upsert용) ──
      // asset: car_number → VIN 폴백, insurance: car_number|policy_no, partner: biz_no
      const UPSERT_PATHS = new Set(['assets', 'partners', 'insurances']);
      const byCarNumAsset = new Map<string, { key: string; data: Record<string, unknown> }>();
      const byVinAsset = new Map<string, { key: string; data: Record<string, unknown> }>();
      const byCompositeIns = new Map<string, { key: string; data: Record<string, unknown> }>();
      const byBizNoMember = new Map<string, { key: string; data: Record<string, unknown> }>();

      if (UPSERT_PATHS.has(spec.path)) {
        const snap = await get(rtdbRef(db, spec.path));
        if (snap.exists()) {
          const raw = snap.val() as Record<string, Record<string, unknown>>;
          for (const [k, v] of Object.entries(raw)) {
            if (v?.status === 'deleted') continue;
            if (spec.key === 'asset') {
              if (v.car_number) byCarNumAsset.set(String(v.car_number), { key: k, data: v });
              if (v.vin) byVinAsset.set(String(v.vin), { key: k, data: v });
            } else if (spec.key === 'insurance' && v.policy_no) {
              byCompositeIns.set(`${v.car_number ?? ''}|${v.policy_no}`, { key: k, data: v });
            } else if (spec.key === 'member' && v.biz_no) {
              byBizNoMember.set(String(v.biz_no), { key: k, data: v });
            }
          }
        }
      }

      const findExisting = (row: Record<string, unknown>): { key: string; data: Record<string, unknown> } | null => {
        if (spec.key === 'asset') {
          if (row.car_number) {
            const hit = byCarNumAsset.get(String(row.car_number));
            if (hit) return hit;
          }
          if (row.vin) {
            const hit = byVinAsset.get(String(row.vin));
            if (hit) return hit;
          }
          return null;
        }
        if (spec.key === 'insurance') {
          return byCompositeIns.get(`${row.car_number ?? ''}|${row.policy_no ?? ''}`) ?? null;
        }
        if (spec.key === 'member') {
          return row.biz_no ? (byBizNoMember.get(String(row.biz_no)) ?? null) : null;
        }
        return null;
      };

      // 보험 업로드 전용: 차량→회원사 매칭
      let carToPartnerMap: Map<string, string> | null = null;
      if (spec.key === 'insurance') {
        carToPartnerMap = new Map();
        for (const a of assets.data) {
          if (a.car_number && a.partner_code && a.status !== 'deleted') {
            carToPartnerMap.set(a.car_number, a.partner_code);
          }
        }
      }

      let newCount = 0;
      let updatedCount = 0;
      let unchangedCount = 0;
      let totalFieldChanges = 0;
      let derivedBillings = 0;
      let skippedMissing = 0;
      let skippedMaster = 0;

      for (const row of mappedRows) {
        // 마스터 미등록 행은 저장 스킵
        if (row._skip_reason) { skippedMaster++; continue; }
        // 필수필드 검증
        const missing = spec.schema.filter((f) => f.required && !row[f.col]).map((f) => f.label);
        if (missing.length) { skippedMissing++; continue; }

        // 보험: partner_code 자동 매칭 (빈 경우)
        if (carToPartnerMap && row.car_number && !row.partner_code) {
          row.partner_code = carToPartnerMap.get(String(row.car_number)) ?? '';
        }

        // 내부 힌트/보정 메타 필드는 RTDB에 저장하지 않음
        const cleanRow: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) {
          if (!k.startsWith('_')) cleanRow[k] = v;
        }

        const existing = UPSERT_PATHS.has(spec.path) ? findExisting(cleanRow) : null;

        if (existing && UPSERT_PATHS.has(spec.path)) {
          // ── 보완수정: 비어있지 않고 기존과 다른 값만 업데이트 ──
          const updates: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(cleanRow)) {
            if (v === '' || v == null) continue;
            const oldV = existing.data[k];
            if (String(oldV ?? '') !== String(v)) {
              updates[k] = v;
            }
          }
          if (Object.keys(updates).length > 0) {
            updates.updated_at = Date.now();
            await update(rtdbRef(db, `${spec.path}/${existing.key}`), updates);
            updatedCount++;
            totalFieldChanges += Object.keys(updates).length - 1; // updated_at 제외
          } else {
            unchangedCount++;
          }
        } else {
          // ── 신규등록 ──
          // 타입별 코드 자동 생성 (비어있을 때만) — RTDB에서 max(code)+1 조회
          const CODE_GEN_MAP: Record<string, { field: string; gen: () => Promise<string> }> = {
            member: { field: 'partner_code', gen: nextPartnerCode },
            customer: { field: 'customer_code', gen: nextCustomerCode },
            asset: { field: 'asset_code', gen: nextAssetCode },
            vendor: { field: 'vendor_code', gen: nextVendorCode },
            loan: { field: 'loan_code', gen: nextLoanCode },
            insurance: { field: 'insurance_code', gen: nextInsuranceCode },
            gps: { field: 'gps_code', gen: nextGpsCode },
          };
          const codeSpec = CODE_GEN_MAP[spec.key];
          if (codeSpec && !cleanRow[codeSpec.field]) {
            cleanRow[codeSpec.field] = await codeSpec.gen();
          }
          const payload = { ...cleanRow, created_at: Date.now(), status: 'active' };
          const r = push(base);
          await set(r, payload);
          newCount++;

          // 계약 업로드 시 billings 자동 파생
          if (spec.key === 'contract' && r.key) {
            try {
              const dr = await deriveBillingsFromContract({ ...payload, _key: r.key } as RtdbContract);
              derivedBillings += dr.created;
            } catch { /* 파생 실패는 전체 저장 중단 안 함 */ }
          }
        }
      }

      // 결과 리포트 (목록은 유지 — 실시간 구독으로 상태가 ✓ 동일로 갱신됨)
      const parts: string[] = [];
      if (newCount > 0) parts.push(`신규 ${newCount}건`);
      if (updatedCount > 0) parts.push(`보완수정 ${updatedCount}건(${totalFieldChanges}필드)`);
      if (unchangedCount > 0) parts.push(`변경없음 ${unchangedCount}건`);
      if (skippedMaster > 0) parts.push(`⏭️ 스킵 ${skippedMaster}건(마스터 미등록)`);
      if (skippedMissing > 0) parts.push(`필수누락 ${skippedMissing}건`);
      if (derivedBillings > 0) parts.push(`수납스케줄 ${derivedBillings}건 자동생성`);
      toast.success(parts.join(' · ') || '변경사항 없음');
      // reset() 호출 안 함 — 사용자가 결과를 확인할 수 있도록 미리보기 유지
      // 새로 업로드하거나 '초기화' 버튼으로 수동 리셋
    } catch (e) {
      toast.error(`저장 실패: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }, [spec, mappedRows, reset, assets.data]);

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
              onDrop={async (e) => {
                e.preventDefault(); setDragOver(false);
                // 폴더 드롭 지원: DataTransferItem.webkitGetAsEntry()로 디렉토리 재귀 순회
                const items = Array.from(e.dataTransfer.items ?? []);
                const hasEntries = items.some((it) => typeof (it as DataTransferItem & { webkitGetAsEntry?: () => unknown }).webkitGetAsEntry === 'function');
                let files: File[] = [];
                if (hasEntries) {
                  setOcrProgress('폴더 탐색 중...');
                  const entries = items
                    .map((it) => (it as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntry | null }).webkitGetAsEntry?.())
                    .filter((ent): ent is FileSystemEntry => !!ent);
                  const readEntry = async (entry: FileSystemEntry): Promise<File[]> => {
                    if (entry.isFile) {
                      return new Promise((resolve) => {
                        (entry as FileSystemFileEntry).file((f) => resolve([f]), () => resolve([]));
                      });
                    }
                    if (entry.isDirectory) {
                      const reader = (entry as FileSystemDirectoryEntry).createReader();
                      const children: FileSystemEntry[] = [];
                      // readEntries는 한 번에 일부만 반환 → 빈 배열 나올 때까지 반복
                      await new Promise<void>((resolve) => {
                        const read = () => reader.readEntries((batch) => {
                          if (batch.length === 0) return resolve();
                          children.push(...batch);
                          read();
                        }, () => resolve());
                        read();
                      });
                      const nested = await Promise.all(children.map(readEntry));
                      return nested.flat();
                    }
                    return [];
                  };
                  const collected = await Promise.all(entries.map(readEntry));
                  files = collected.flat();
                  setOcrProgress('');
                } else {
                  files = Array.from(e.dataTransfer.files ?? []);
                }
                if (files.length === 0) { toast.warning('유효한 파일이 없습니다'); return; }
                let done = 0;
                const startedAt = Date.now();
                const updateProgress = () => {
                  const pct = Math.round((done / files.length) * 100);
                  const elapsed = Math.round((Date.now() - startedAt) / 1000);
                  setOcrProgress(`${done} / ${files.length} (${pct}%) · ${elapsed}초`);
                };
                const timer = setInterval(updateProgress, 500);
                updateProgress();
                // 완전 병렬 — 모든 파일 동시 발사 (브라우저 HTTP/2로 알아서 큐잉)
                try {
                  await Promise.all(files.map(async (f) => {
                    await handleFile(f);
                    done++;
                    updateProgress();
                  }));
                } finally {
                  clearInterval(timer);
                }
                if (files.length > 1) {
                  const total = Math.round((Date.now() - startedAt) / 1000);
                  toast.success(`총 ${files.length}개 파일 처리 완료 · ${total}초 소요`);
                }
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
                multiple
                onChange={async (e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = '';
                  if (files.length === 0) return;
                  let done = 0;
                  const startedAt = Date.now();
                  const updateProgress = () => {
                    const pct = Math.round((done / files.length) * 100);
                    const elapsed = Math.round((Date.now() - startedAt) / 1000);
                    setOcrProgress(`${done} / ${files.length} (${pct}%) · ${elapsed}초`);
                  };
                  const timer = setInterval(updateProgress, 500);
                  updateProgress();
                  // 완전 병렬 — 모든 파일 동시 발사
                  try {
                    await Promise.all(files.map(async (f) => {
                      await handleFile(f);
                      done++;
                      updateProgress();
                    }));
                  } finally {
                    clearInterval(timer);
                  }
                  if (files.length > 1) {
                    const total = Math.round((Date.now() - startedAt) / 1000);
                    toast.success(`총 ${files.length}개 파일 처리 완료 · ${total}초 소요`);
                  }
                }}
              />
              <i className="ph ph-upload-simple text-[18px]" />
              <div>
                <div className="text-base" style={{ fontWeight: 600 }}>
                  {fileName || '파일 불러오기 (여러 개 가능)'}
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
              {mappedRows.length > 0 && (() => {
                const n = mappedRows.filter((r) => r._upsert_status === 'new').length;
                const u = mappedRows.filter((r) => r._upsert_status === 'update').length;
                const s = mappedRows.filter((r) => r._upsert_status === 'unchanged').length;
                const sk = mappedRows.filter((r) => r._upsert_status === 'skip').length;
                const bits: string[] = [];
                if (n > 0) bits.push(`신규 ${n}`);
                if (u > 0) bits.push(`보완 ${u}`);
                if (s > 0) bits.push(`동일 ${s}`);
                if (sk > 0) bits.push(`⏭️ 스킵 ${sk}`);
                return ` · ${mappedRows.length}건${bits.length ? ` (${bits.join(', ')})` : ''}`;
              })()}
            </span>
          </div>
          <div className="panel-head-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={commit}
              disabled={!spec || mappedRows.length === 0 || saving || mappedRows.every((r) => r._upsert_status === 'unchanged')}
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
              options={{
                tooltipShowDelay: 300,
                // 셀 편집 시 rawRows에 역반영 — normalizeAsset도 재실행되어 의존 필드 자동 갱신
                onCellValueChanged: (event) => {
                  const field = event.colDef.field;
                  if (!field) return;
                  const editedData = event.data as Record<string, unknown>;
                  const newValue = event.newValue;
                  // 매칭 키로 rawRows에서 해당 행 찾기
                  const matches = (r: Record<string, string>) => {
                    if (spec?.key === 'asset' && editedData.car_number) {
                      return r.car_number === editedData.car_number;
                    }
                    if (spec?.key === 'member' && editedData.biz_no) {
                      return r.biz_no === editedData.biz_no;
                    }
                    if (spec?.key === 'insurance' && editedData.car_number && editedData.policy_no) {
                      return r.car_number === editedData.car_number && r.policy_no === editedData.policy_no;
                    }
                    return false;
                  };
                  setRawRows((prev) => {
                    const idx = prev.findIndex(matches);
                    if (idx < 0) {
                      // 자연키가 없어 못 찾은 경우 rowIndex 사용 (신규 행 대응)
                      const rowIdx = event.node?.rowIndex;
                      if (rowIdx == null) return prev;
                      const next = [...prev];
                      next[rowIdx] = { ...next[rowIdx], [field]: String(newValue ?? '') };
                      return next;
                    }
                    const next = [...prev];
                    next[idx] = { ...next[idx], [field]: String(newValue ?? '') };
                    return next;
                  });
                },
              }}
            />
          )}
        </div>
      </section>
    </Workspace>
  );
}
