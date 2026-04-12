/**
 * pages/input-asset.js — 자산등록
 */
import { mountInputPage } from '../core/input-page.js';
import { ASSET_SCHEMA, ASSET_SECTIONS } from '../data/schemas/asset.js';
import { saveAsset, watchAssets } from '../firebase/assets.js';

let existingVins = [];

function validateAsset(row, ctx) {
  const errs = [];
  // 차대번호 중복
  if (row.vin && ctx?.vins?.includes(row.vin)) {
    errs.push({ col: '차대번호', msg: '이미 등록된 차대번호' });
  }
  // 차량번호 형식 (간이)
  if (row.car_number && !/\d{2,3}[가-힣]\d{4}/.test(row.car_number)) {
    errs.push({ col: '차량번호', msg: '형식 확인 (예: 02무0357)' });
  }
  // 연식 4자리
  if (row.car_year && !/^\d{4}$/.test(row.car_year)) {
    errs.push({ col: '연식', msg: '4자리 숫자' });
  }
  return errs;
}

export async function mount() {
  watchAssets((items) => { existingVins = items.map(a => a.vin); });
  mountInputPage({
    schema: ASSET_SCHEMA,
    sections: ASSET_SECTIONS,
    keyField: 'vin',
    label: '자산',
    saveFn: saveAsset,
    validate: validateAsset,
    context: () => ({ vins: existingVins }),
  });
}
