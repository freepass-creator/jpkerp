/**
 * pages/input-contract.js — 계약등록
 */
import { mountInputPage } from '../core/input-page.js';
import { CONTRACT_SCHEMA, CONTRACT_SECTIONS } from '../data/schemas/contract.js';
import { saveContract, watchContracts } from '../firebase/contracts.js';
import { watchAssets } from '../firebase/assets.js';

let existingAssets = [];
let existingContracts = [];

function normalizeDate(s) {
  if (!s) return '';
  let v = String(s).trim().replace(/[./]/g, '-');
  const m = v.match(/^(\d{2})-(\d{1,2})-(\d{1,2})$/);
  if (m) v = `${Number(m[1]) < 50 ? 2000 + Number(m[1]) : 1900 + Number(m[1])}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  return v;
}

function validateContract(row, ctx) {
  const errs = [];
  // 차량번호가 자산에 존재?
  if (row.car_number && ctx?.cars?.length && !ctx.cars.includes(row.car_number)) {
    errs.push({ col: '차량번호', msg: '미등록 차량 — 자산등록 먼저' });
  }
  // 시작일 형식
  const start = normalizeDate(row.start_date);
  if (row.start_date && !start) {
    errs.push({ col: '시작일', msg: '날짜 형식 확인' });
  }
  // 월대여료 양수
  const rent = Number(String(row.rent_amount || '').replace(/,/g, ''));
  if (row.rent_amount && rent <= 0) {
    errs.push({ col: '월대여료', msg: '0 이상' });
  }
  // 같은 차량 기간 중복
  if (row.car_number && start && row.rent_months && ctx?.contracts) {
    const end = new Date(start);
    end.setMonth(end.getMonth() + Number(row.rent_months));
    const endStr = end.toISOString().slice(0, 10);
    const overlap = ctx.contracts.find(c => {
      if (c.car_number !== row.car_number) return false;
      const cs = normalizeDate(c.start_date);
      if (!cs) return false;
      const ce = new Date(cs);
      ce.setMonth(ce.getMonth() + (Number(c.rent_months) || 0));
      return cs < endStr && ce.toISOString().slice(0, 10) > start;
    });
    if (overlap) {
      errs.push({ col: '차량번호', msg: `기간 중복 (${overlap.contract_code})` });
    }
  }
  return errs;
}

export async function mount() {
  watchAssets((items) => { existingAssets = items.map(a => a.car_number); });
  watchContracts((items) => { existingContracts = items; });
  mountInputPage({
    schema: CONTRACT_SCHEMA,
    sections: CONTRACT_SECTIONS,
    keyField: 'contract_code',
    label: '계약',
    saveFn: saveContract,
    validate: validateContract,
    context: () => ({ cars: existingAssets, contracts: existingContracts }),
  });
}
