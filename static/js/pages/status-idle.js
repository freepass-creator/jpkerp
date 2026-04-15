/**
 * pages/status-idle.js — 휴차 현황
 *
 * 휴차 = 다음 중 하나라도 해당하는 차량
 *  - 활성 계약이 없음 (계약 자체가 없거나, 종료됨)
 *  - 계약자 정보가 비어있음 (잘못 등록된 계약은 무효 처리)
 */
import { watchAssets } from '../firebase/assets.js';
import { watchContracts } from '../firebase/contracts.js';
import { buildSchemaColumns, baseGridOptions, orderColumnsByPriority, ASSET_DEFAULT_ORDER } from '../core/grid-utils.js';
import { ASSET_SCHEMA } from '../data/schemas/asset.js';

const $ = s => document.querySelector(s);

function normalizeDate(s) {
  if (!s) return '';
  let v = String(s).trim().replace(/[./]/g, '-');
  const m = v.match(/^(\d{2})-(\d{1,2})-(\d{1,2})$/);
  if (m) v = `${Number(m[1]) < 50 ? 2000 + Number(m[1]) : 1900 + Number(m[1])}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return v;
}

function computeContractEnd(c) {
  if (c.end_date) return normalizeDate(c.end_date);
  const start = normalizeDate(c.start_date);
  if (!start || !c.rent_months) return '';
  const d = new Date(start);
  if (isNaN(d.getTime())) return '';
  d.setMonth(d.getMonth() + Number(c.rent_months));
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let gridApi, assets = [], contracts = [];

function refresh() {
  const today = new Date().toISOString().slice(0, 10);

  // 유효한 활성 계약 = 계약자명 있고, 오늘이 시작~종료 사이
  const activeContracts = contracts.filter(c => {
    if (c.status === 'deleted') return false;
    if (!c.contractor_name || !String(c.contractor_name).trim()) return false;
    const start = normalizeDate(c.start_date);
    if (!start || start > today) return false;
    const end = computeContractEnd(c);
    if (end && end < today) return false;
    return true;
  });
  const activeCars = new Set(activeContracts.map(c => c.car_number).filter(Boolean));

  // 차량번호별 모든 계약 (사유 판정용)
  const contractsByCar = {};
  contracts.filter(c => c.status !== 'deleted').forEach(c => {
    if (!c.car_number) return;
    if (!contractsByCar[c.car_number]) contractsByCar[c.car_number] = [];
    contractsByCar[c.car_number].push(c);
  });

  // 사용자가 명시적으로 설정한 운영 상태 (자동 덮어쓰지 않음)
  const MANUAL_STATES = new Set(['정비중', '매각예정', '폐차', '상품화중']);

  // 휴차 + 사유 + 자동 자산상태 부여
  const idle = assets
    .filter(a => a.status !== 'deleted' && !activeCars.has(a.car_number))
    .map(a => {
      const cs = contractsByCar[a.car_number] || [];
      let reason = '계약없음';
      let reasonDetail = '';
      let derivedStatus = '상품대기';  // 휴차이면서 사용자 명시 없으면 기본 상품대기

      if (cs.length) {
        const latest = cs.sort((x, y) => String(y.start_date || '').localeCompare(String(x.start_date || '')))[0];
        if (!latest.contractor_name?.trim()) {
          reason = '계약자정보누락';
          reasonDetail = latest.contract_code || '';
        } else {
          const s = normalizeDate(latest.start_date);
          const e = computeContractEnd(latest);
          if (s && s > today) {
            reason = '미래계약';
            reasonDetail = `${latest.contractor_name} · 시작 ${s}`;
            derivedStatus = '계약대기';
          } else if (e && e < today) {
            reason = '계약만료';
            reasonDetail = `${latest.contractor_name} · ~${e}`;
            derivedStatus = '상품대기';
          } else {
            reason = '계약무효';
            reasonDetail = latest.contract_code || '';
          }
        }
      }

      // 사용자 수동 설정값 우선, 없거나 '가동중'(휴차인데 가동중일 수 없음)이면 자동값
      const manual = a.asset_status;
      const finalStatus = (manual && MANUAL_STATES.has(manual)) ? manual : derivedStatus;

      return {
        ...a,
        asset_status: finalStatus,
        _idleReason: reason,
        _idleReasonDetail: reasonDetail,
        _statusAuto: !MANUAL_STATES.has(manual),
      };
    });

  gridApi?.setGridOption('rowData', idle);
  const cnt = $('#idleCount');
  if (cnt) cnt.textContent = idle.length;
}

export async function mount() {
  const el = $('#idleGrid');
  if (!el) return;

  const REASON_COLOR = {
    '계약없음':       'var(--c-text-muted)',
    '계약만료':       '#c08a2b',
    '미래계약':       'var(--c-primary)',
    '계약자정보누락': 'var(--c-danger)',
    '계약무효':       'var(--c-danger)',
  };
  const STATUS_COLOR = {
    '가동중':   'var(--c-success)',
    '상품대기': 'var(--c-text-muted)',
    '계약대기': 'var(--c-primary)',
    '상품화중': 'var(--c-primary)',
    '정비중':   '#c08a2b',
    '매각예정': '#c08a2b',
    '폐차':     'var(--c-danger)',
  };
  const reasonCol = {
    headerName: '휴차사유', field: '_idleReason', width: 110,
    cellStyle: p => ({ color: REASON_COLOR[p.value] || 'var(--c-text)', fontWeight: 600 }),
  };
  const statusCol = {
    headerName: '자산상태', field: 'asset_status', width: 100,
    cellStyle: p => ({ color: STATUS_COLOR[p.value] || 'var(--c-text-muted)', fontWeight: 600 }),
    valueFormatter: p => (p.value || '미지정') + (p.data._statusAuto ? ' (자동)' : ''),
  };
  const detailCol = { headerName: '세부', field: '_idleReasonDetail', flex: 1, minWidth: 180,
    cellStyle: { color: 'var(--c-text-sub)' } };

  // 현황 페이지에선 자산코드 + 기존 asset_status 컬럼은 빼고 (위에 별도 statusCol로 추가)
  const schemaForIdle = ASSET_SCHEMA.filter(s => s.col !== 'asset_code' && s.col !== 'asset_status');
  const baseCols = buildSchemaColumns(schemaForIdle, { includeRowNum: true });
  const [rowNumCol, ...rest] = baseCols;
  // # → 자산상태 → 휴차사유 → 세부 → 자산표준 순서
  const columnDefs = [rowNumCol, statusCol, reasonCol, detailCol, ...orderColumnsByPriority(rest, ASSET_DEFAULT_ORDER)];

  gridApi = agGrid.createGrid(el, baseGridOptions({
    columnDefs,
    keyField: 'vin',
    dirtyRows: {},
    onColStateChange: () => {},
    colStateKey: 'jpk.grid.idle',
  }));
  el._agApi = gridApi;

  watchAssets(items => { assets = items; refresh(); });
  watchContracts(items => { contracts = items; refresh(); });

  $('#idleSearch')?.addEventListener('input', e => {
    gridApi?.setGridOption('quickFilterText', e.target.value);
  });
}
