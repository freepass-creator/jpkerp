/**
 * contracts.js — 계약 컬렉션
 * 키: contract_code (자동 채번 CT00001)
 *
 * 저장 시 계약자(고객) 정보를 함께 받아 customers 컬렉션에 자동 upsert.
 */
import { ref, get } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js';
import { db } from './config.js';
import {
  watchCollection, fetchOne, setRecord, updateRecord, softDelete, nextSequence,
} from './db.js';
import { upsertByRegNo } from './customers.js';
import { generateBillingsForContract } from './billings.js';
import { saveEvent } from './events.js';
import { CONTRACT_SCHEMA } from '../data/schemas/contract.js';

const PATH = 'contracts';

/** 스키마 required 필드 검증 — 빈 값/공백/플레이스홀더 모두 거부 */
function isEmpty(v) {
  if (v === undefined || v === null) return true;
  const s = String(v).trim();
  return s === '' || s === '-' || s === '_' || s === 'N/A' || s === 'null';
}
function validateRequired(data) {
  const missing = [];
  for (const s of CONTRACT_SCHEMA) {
    if (!s.required) continue;
    if (isEmpty(data[s.col])) missing.push(s.label);
  }
  if (missing.length) {
    throw new Error(`필수 항목 누락: ${missing.join(', ')}`);
  }
}

/** 날짜 정규화 (YY-M-D, YYYY.M.D 등 → YYYY-MM-DD) */
function normalizeDate(s) {
  if (!s) return '';
  let v = String(s).trim().replace(/[./]/g, '-');
  const m2 = v.match(/^(\d{2})-(\d{1,2})-(\d{1,2})$/);
  if (m2) v = `${Number(m2[1]) < 50 ? 2000 + Number(m2[1]) : 1900 + Number(m2[1])}-${m2[2].padStart(2,'0')}-${m2[3].padStart(2,'0')}`;
  return v;
}
function computeEndDate(d) {
  if (d.end_date) return normalizeDate(d.end_date);
  const s = normalizeDate(d.start_date);
  if (!s || !d.rent_months) return '';
  const dt = new Date(s);
  if (isNaN(dt)) return '';
  dt.setMonth(dt.getMonth() + Number(d.rent_months));
  dt.setDate(dt.getDate() - 1);
  return dt.toISOString().slice(0, 10);
}

/**
 * 계약상태 자동 결정 (사용자가 '계약해지'로 명시한 건 유지)
 *  - 계약해지: 그대로 유지
 *  - 시작일 > 오늘: 계약대기
 *  - 종료일 < 오늘: 계약완료
 *  - 그 외: 계약진행
 */
function autoContractStatus(data) {
  if (data.contract_status === '계약해지') return '계약해지';
  const today = new Date().toISOString().slice(0, 10);
  const start = normalizeDate(data.start_date);
  const end = computeEndDate(data);
  if (start && start > today) return '계약대기';
  if (end && end < today) return '계약완료';
  return '계약진행';
}

// 계약 → 고객 컬럼 매핑 (이름이 살짝 다름)
function buildCustomerData(contract) {
  return {
    customer_reg_no: contract.contractor_reg_no,
    code_name:       contract.contractor_name,
    phone:           contract.contractor_phone,
    type:            contract.contractor_type,
    address:         contract.contractor_address,
    biz_no:          contract.biz_no,
    biz_name:        contract.biz_name,
    ceo_name:        contract.ceo_name,
    biz_type:        contract.biz_type,
    biz_item:        contract.biz_item,
    tax_email:       contract.tax_email,
    driver_name:     contract.driver_name,
    driver_phone:    contract.driver_phone,
    driver_ssn:      contract.driver_ssn,
    driver_license:  contract.driver_license,
  };
}

export function watchContracts(callback) {
  return watchCollection(PATH, callback);
}

export async function getContract(code) {
  return fetchOne(`${PATH}/${code}`);
}

export async function saveContract(data) {
  // 0. 필수값 검증 — 빈 값이면 즉시 거부
  validateRequired(data);

  // 1. 고객 upsert (있으면 update, 없으면 create) → customer_code 회수
  let customerCode = '';
  if (data.contractor_reg_no) {
    try {
      const result = await upsertByRegNo(buildCustomerData(data));
      customerCode = result.customer_code || '';
    } catch (e) {
      console.warn('[contract] customer upsert failed', e);
    }
  }

  // 계약코드 — 회원사 있으면 CP01CT00001, 없으면 CT00001
  let code = data.contract_code || '';
  if (!code) {
    const partner = (data.partner_code || '').trim();
    if (partner) {
      const seq = await nextSequence(`contract_${partner}`, '', 5);
      code = `${partner}CT${seq}`;
    } else {
      code = await nextSequence('contract', 'CT', 5);
    }
  }
  const now = Date.now();
  const record = {
    ...data,
    contract_code: code,
    contractor_code: customerCode,
    contract_status: autoContractStatus(data),
    created_at: now,
    updated_at: now,
  };
  await setRecord(`${PATH}/${code}`, record);

  // 회차 자동 생성
  if (record.start_date && record.rent_months && record.rent_amount) {
    try { await generateBillingsForContract(record); } catch (e) { console.warn('[contract] billing gen failed', e); }
  }

  // 반납 예정 이벤트 자동 생성
  try { await generateReturnEvent(record); } catch (e) { console.warn('[contract] return event gen failed', e); }

  return record;
}

/** 계약 종료일 기준 반납 예정 이벤트 생성 */
async function generateReturnEvent(contract) {
  if (!contract.start_date || !contract.rent_months) return;
  // 종료일 계산
  let endDate = contract.end_date;
  if (!endDate) {
    const d = new Date(contract.start_date);
    if (isNaN(d)) return;
    d.setMonth(d.getMonth() + Number(contract.rent_months));
    d.setDate(d.getDate() - 1);
    endDate = d.toISOString().slice(0, 10);
  }
  await saveEvent({
    event_type: 'return_scheduled',
    schedule: true,
    date: endDate,
    car_number: contract.car_number,
    vin: contract.vin || '',
    title: `반납 예정 — ${contract.contractor_name || ''}`,
    contract_code: contract.contract_code,
    customer_name: contract.contractor_name,
    customer_phone: contract.contractor_phone,
    partner_code: contract.partner_code || '',
    status: 'scheduled',
    note: `자동 생성 (계약 ${contract.contract_code})`,
  });
}

export async function updateContract(code, data) {
  // 수정 시에도 고객 정보가 바뀌면 같이 갱신
  if (data.contractor_reg_no) {
    try {
      const result = await upsertByRegNo(buildCustomerData(data));
      data.contractor_code = result.customer_code || data.contractor_code || '';
    } catch (e) {
      console.warn('[contract] customer upsert failed', e);
    }
  }
  return updateRecord(`${PATH}/${code}`, data);
}

export async function deleteContract(code) {
  return softDelete(`${PATH}/${code}`);
}

/**
 * 동일 계약 (차번호 + 시작일) 찾기 — 삭제된 것 포함
 * @returns {{contract_code, ...} | null}
 */
async function findExistingContract(carNumber, startDate) {
  if (!carNumber || !startDate) return null;
  const snap = await get(ref(db, PATH));
  if (!snap.exists()) return null;
  const all = snap.val();
  for (const rec of Object.values(all)) {
    if (rec.car_number === carNumber && rec.start_date === startDate) return rec;
  }
  return null;
}

/**
 * Upsert: 동일 계약(차번호+시작일) 있으면 갱신, 없으면 신규 등록.
 * 삭제됐던 계약이면 status를 'active'로 복구.
 */
export async function upsertContract(data) {
  validateRequired(data);
  const existing = await findExistingContract(data.car_number, data.start_date);

  if (existing && existing.contract_code) {
    // 갱신 — 기존 contract_code 유지
    const patch = {
      ...data,
      contract_code: existing.contract_code,
      contract_status: autoContractStatus({ ...existing, ...data }),
      status: 'active',  // 삭제 상태였으면 살림
      updated_at: Date.now(),
    };
    // 고객 upsert
    if (data.contractor_reg_no) {
      try {
        const result = await upsertByRegNo(buildCustomerData(data));
        patch.contractor_code = result.customer_code || existing.contractor_code || '';
      } catch (e) { console.warn('[contract upsert] customer upsert failed', e); }
    }
    await updateRecord(`${PATH}/${existing.contract_code}`, patch);
    return { ...existing, ...patch, _wasUpdate: true };
  }

  // 신규 — saveContract 그대로 호출
  return saveContract(data);
}
