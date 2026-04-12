/**
 * contracts.js — 계약 컬렉션
 * 키: contract_code (자동 채번 CT00001)
 *
 * 저장 시 계약자(고객) 정보를 함께 받아 customers 컬렉션에 자동 upsert.
 */
import {
  watchCollection, fetchOne, setRecord, updateRecord, softDelete, nextSequence,
} from './db.js';
import { upsertByRegNo } from './customers.js';
import { generateBillingsForContract } from './billings.js';

const PATH = 'contracts';

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

  const code = await nextSequence('contract', 'CT');
  const now = Date.now();
  const record = {
    ...data,
    contract_code: code,
    contractor_code: customerCode,
    contract_status: data.contract_status || '계약진행',
    created_at: now,
    updated_at: now,
  };
  await setRecord(`${PATH}/${code}`, record);

  // 회차 자동 생성
  if (record.start_date && record.rent_months && record.rent_amount) {
    try { await generateBillingsForContract(record); } catch (e) { console.warn('[contract] billing gen failed', e); }
  }

  return record;
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
