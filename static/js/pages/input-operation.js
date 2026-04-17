/**
 * pages/input-operation.js — 운영등록
 *
 * 좌: 유형 목록 (정비/사고/과태료/출고반납)
 * 우: 선택한 유형의 입력 폼 + 등록
 */
import { saveEvent, watchEvents } from '../firebase/events.js';
import { watchAssets } from '../firebase/assets.js';
import { watchContracts } from '../firebase/contracts.js';
import { watchBillings } from '../firebase/billings.js';
import { openDetail } from '../core/detail-panel.js';
import { watchVendors } from '../firebase/vendors.js';
import { showToast } from '../core/toast.js';
import { createPhotoUploader, uploadFilesToStorage } from '../core/photo-ui.js';
import { ocrFile, extractAmount, extractDate, extractCarNumber } from '../core/ocr.js';
import { uploadPenaltyFile } from '../firebase/file-storage.js';
import { generateRentalConfirmation, buildConfirmationContent } from '../core/doc-generator.js';

let iocUploader = null;

const $ = (s) => document.querySelector(s);

// 최근 차량 / 즐겨찾기 / 자주 쓰는 제목
const RECENT_KEY = 'jpk.op.recent_cars';
const FAV_KEY = 'jpk.op.favorites';
const LOC_KEY = 'jpk.op.locations';
const INS_KEY = 'jpk.op.insurance_co';
// 국내 자동차 보험사 기본 목록 (가나다순)
const DEFAULT_INS_CO = [
  '삼성화재', '현대해상', 'DB손해보험', 'KB손해보험', '메리츠화재',
  '한화손해보험', '롯데손해보험', '흥국화재', 'MG손해보험', 'AXA손해보험',
  '캐롯손해보험', '하나손해보험'
];
function loadInsCo() {
  try {
    const saved = JSON.parse(localStorage.getItem(INS_KEY)) || [];
    // 사용자 저장 + 기본 목록 병합 (중복 제거, 사용자 저장을 우선 배치)
    const merged = [...saved, ...DEFAULT_INS_CO.filter(x => !saved.includes(x))];
    return merged;
  } catch { return [...DEFAULT_INS_CO]; }
}
function saveInsCo(name) {
  if (!name) return;
  const list = loadInsCo().filter(x => x !== name);
  list.unshift(name);
  localStorage.setItem(INS_KEY, JSON.stringify(list.slice(0, 20)));
}
function loadLocations() { try { return JSON.parse(localStorage.getItem(LOC_KEY)) || []; } catch { return []; } }
function saveLocation(place) {
  if (!place) return;
  let list = loadLocations();
  if (list.includes(place)) return;
  list.push(place);
  localStorage.setItem(LOC_KEY, JSON.stringify(list.slice(0, 10)));
}
function removeLocation(place) {
  let list = loadLocations().filter(p => p !== place);
  localStorage.setItem(LOC_KEY, JSON.stringify(list));
}
const LAST_FROM_KEY = 'jpk.op.last_from';
const TITLE_KEY = 'jpk.op.titles';

function loadRecent() { try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; } }
function saveRecent(car) {
  let list = loadRecent().filter(c => c !== car);
  list.unshift(car);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 5)));
}
function loadFavorites() { try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch { return []; } }
function saveFavorite(place) {
  let list = loadFavorites().filter(p => p !== place);
  list.unshift(place);
  localStorage.setItem(FAV_KEY, JSON.stringify(list.slice(0, 10)));
}
function loadTitles(type) {
  try { const all = JSON.parse(localStorage.getItem(TITLE_KEY)) || {}; return all[type] || []; } catch { return []; }
}
function saveTitle(type, title) {
  try {
    const all = JSON.parse(localStorage.getItem(TITLE_KEY)) || {};
    if (!all[type]) all[type] = [];
    if (!all[type].includes(title)) { all[type].unshift(title); all[type] = all[type].slice(0, 10); }
    localStorage.setItem(TITLE_KEY, JSON.stringify(all));
  } catch {}
}

// 운영업무 아이콘 — 카테고리별 색상 통일
// 🔵 고객 소통 (파랑)  | 🟢 차량 흐름 (녹색) | 🔴 문제·긴급 (빨강)
// 🟠 관리·수리 (주황)  | 🟣 서비스·부가 (보라)
const OP_ICONS = {
  // ⚫ 입출고센터 (모바일→웹 통합)
  ioc:       { name: 'ph-arrows-in-line-horizontal', color: '#37352f' },
  // ⚫ 상품화센터 (정비+사고수리+상품화 통합)
  pc:        { name: 'ph-sparkle',                    color: '#8b5cf6' },
  // 🔵 고객 소통
  contact:   { name: 'ph-phone',              color: '#3b82f6' },  // blue-500
  collect:   { name: 'ph-envelope',           color: '#2563eb' },  // blue-600

  // 🟢 차량 흐름 (출고/반납/이동)
  delivery:  { name: 'ph-truck',              color: '#10b981' },  // emerald-500
  return:    { name: 'ph-arrow-u-down-left',  color: '#059669' },  // emerald-600
  transfer:  { name: 'ph-arrows-left-right',  color: '#14b8a6' },  // teal-500

  // 🔴 문제·긴급
  force:     { name: 'ph-warning-octagon',    color: '#dc2626' },  // red-600
  accident:  { name: 'ph-car-profile',        color: '#ef4444' },  // red-500
  ignition:  { name: 'ph-engine',             color: '#ea580c' },  // orange-600
  penalty:   { name: 'ph-prohibit',           color: '#b91c1c' },  // red-700
  penalty_notice: { name: 'ph-receipt',       color: '#b91c1c' },  // red-700 (과태료처리)
  product_register: { name: 'ph-storefront', color: '#059669' },  // emerald-600 (상품등록)

  // 🟠 관리·수리
  maint:     { name: 'ph-wrench',             color: '#f97316' },  // orange-500
  repair:    { name: 'ph-hammer',             color: '#ea580c' },  // orange-600
  key:       { name: 'ph-key',                color: '#f59e0b' },  // amber-500

  // 🟣 서비스·부가
  product:   { name: 'ph-sparkle',            color: '#8b5cf6' },  // violet-500
  insurance: { name: 'ph-shield-check',       color: '#7c3aed' },  // violet-600
  wash:      { name: 'ph-drop',               color: '#a855f7' },  // purple-500
  fuel:      { name: 'ph-gas-pump',           color: '#c026d3' },  // fuchsia-600
};

function opIcon(key) {
  const ic = OP_ICONS[key];
  if (!ic) return '';
  return `<i class="ph ${ic.name}" style="color:${ic.color};font-size:18px"></i>`;
}

const DEFAULT_TYPES = [
  { key: 'ioc',         label: '입출고센터',     sub: '출고·반납·강제회수·차량이동',     direction: 'out' },
  { key: 'pc',          label: '차량케어센터',   sub: '정비·사고수리·상품화·세차 통합',    direction: 'out' },
  { key: 'contact',     label: '고객센터',       sub: '통화/상담/컴플레인/문의',         direction: 'out' },
  { key: 'key',         label: '차키 전달/분출', sub: '키 전달/회수/분실',               direction: 'out', hidden: true },
  { key: 'maint',       label: '정비',           sub: '소모품교체 + 기능수리',           direction: 'out', hidden: true },
  { key: 'accident',    label: '사고접수',       sub: '사고 발생/보험접수',        direction: 'out' },
  { key: 'ignition',   label: '시동제어',       sub: '시동제어·회수결정·회수진행', direction: 'out' },
  { key: 'repair',      label: '사고수리',       sub: '판금/도색/수리',             direction: 'out', hidden: true },
  { key: 'product',     label: '상품화',         sub: '반납 후 재상품화',           direction: 'out', hidden: true },
  { key: 'insurance',   label: '보험배서관리',   sub: '연령변경·갱신·신규·해지',     direction: 'out' },
  { key: 'penalty',     label: '과태료 변경부과', sub: '과태료 임차인 변경부과',      direction: 'out', hidden: true },
  { key: 'product_register', label: '상품등록', sub: '휴차 → 상품대기 등록 · 대여조건', direction: 'out' },
  { key: 'penalty_notice', label: '과태료작업',  sub: '고지서 OCR · 확인서 병합 다운로드', direction: 'out' },
  { key: 'collect',     label: '미수관리',       sub: '독촉/내용증명/법적조치',     direction: 'out', hidden: true },
  { key: 'wash',        label: '세차',           sub: '세차/실내크리닝',           direction: 'out', hidden: true },
  { key: 'fuel',        label: '연료보충',       sub: '주유/전기충전',              direction: 'out', hidden: true },
];

const ORDER_KEY = 'jpk.op.order';
function loadTypes() {
  // TYPES 는 전체 목록 유지 (renderForm 이 찾을 수 있게)
  try {
    const saved = JSON.parse(localStorage.getItem(ORDER_KEY));
    if (saved?.length) {
      const ordered = saved.map(k => DEFAULT_TYPES.find(t => t.key === k)).filter(Boolean);
      const missing = DEFAULT_TYPES.filter(t => !saved.includes(t.key));
      return [...ordered, ...missing];
    }
  } catch {}
  return [...DEFAULT_TYPES];
}
function saveOrder(types) {
  localStorage.setItem(ORDER_KEY, JSON.stringify(types.map(t => t.key)));
}
let TYPES = loadTypes();

let assets = [];
let contracts = [];
let allEvents = [];
let vendors = [];
let currentType = null;
let lastCarNumber = '';
let _pcActive = false;
let _pcSubType = '';
let iocInsCertUploader = null;
let _iocInsCertVerified = false;

function renderList() {
  const host = $('#opList');
  host.innerHTML = TYPES.filter(t => !t.hidden).map(t => `
    <div class="op-type${currentType === t.key ? ' is-active' : ''}" data-type="${t.key}">
      <span class="op-type__icon">${opIcon(t.key)}</span>
      <span class="op-type__label">${t.label}</span>
      <span class="op-type__handle" style="margin-left:auto">⠿</span>
    </div>
  `).join('');

  // 클릭
  host.querySelectorAll('.op-type').forEach(el => {
    el.addEventListener('click', () => {
      currentType = el.dataset.type;
      _pcActive = (currentType === 'pc'); // pc 진입시만 true
      renderList();
      renderForm();
      // 우측 패널 — 과태료처리 모드는 매칭 결과 표시, 그 외는 이력관리
      const ctxTitle = $('#opContextTitle');
      const ctxSub = $('#opContextSubtitle');
      const ctxHost = $('#opContextHost');
      if (currentType === 'penalty_notice') {
        if (ctxTitle) ctxTitle.textContent = '매칭 결과';
        if (ctxSub) ctxSub.textContent = '고지서 업로드 시 여기에 누적됩니다';
        renderPenaltyMatchList();
      } else {
        // 과태료 모드 이탈 시 grid 참조 해제, padding 복원
        _penaltyGridApi = null;
        if (ctxHost) {
          ctxHost.classList.add('is-pad');
          ctxHost.style.padding = '';
          ctxHost.innerHTML = '<div style="padding:24px;text-align:center;color:var(--c-text-muted)">차량번호 입력 시<br>계약/수납/운영이력이 여기 표시됩니다.</div>';
        }
        if (ctxTitle) ctxTitle.textContent = '이력관리';
        if (ctxSub) ctxSub.textContent = '차량번호를 입력하세요';
      }
    });
  });

  // Sortable.js로 부드러운 드래그
  if (window.Sortable && !host._sortable) {
    host._sortable = Sortable.create(host, {
      animation: 200,
      handle: '.op-type__handle',
      ghostClass: 'op-type--ghost',
      chosenClass: 'op-type--chosen',
      dragClass: 'op-type--drag',
      onEnd: () => {
        const order = [...host.querySelectorAll('.op-type')].map(el => el.dataset.type);
        TYPES = order.map(k => TYPES.find(t => t.key === k)).filter(Boolean);
        saveOrder(TYPES);
      },
    });
  }
}

function renderForm() {
  const t = TYPES.find(x => x.key === currentType);
  if (!t) return;
  const today = new Date().toISOString().slice(0, 10);
  $('#opFormTitle').innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px">${opIcon(t.key)}<span>${t.label}</span></span>`;
  const subEl = $('#opFormSubtitle');
  if (subEl) subEl.textContent = t.sub || '';

  // 과태료처리 모드: 폼 대신 업로드 UI, 등록/초기화 버튼 숨김
  if (currentType === 'penalty_notice') {
    togglePenaltyButtons(true);
    renderPenaltyNoticeMode();
    return;
  }
  togglePenaltyButtons(false);

  const host = $('#opFormHost');
  const carList = `<datalist id="opCarList">${assets.map(a => {
    const _c = contracts.find(c => c.car_number === a.car_number && c.contract_status !== '계약해지');
    const info = [a.partner_code, a.car_model, _c?.contractor_name].filter(Boolean).join(' ');
    return `<option value="${a.car_number || ''}">${info}</option>`;
  }).join('')}</datalist>`;
  const chk = (name, label) => `<span class="btn-opt btn-toggle" data-name="${name}" data-val="">${label}</span>`;
  const chkGroup = (items) => `<div class="btn-group" style="flex-wrap:wrap">${items}</div>`;
  // 옵션값 → tone 매핑 (성격별 색상 — CSS data-tone 기반)
  const OPT_TONE = {
    // ── danger: 위험/부정/긴급 ──
    '미납': 'danger', '계약위반': 'danger', '사고방치': 'danger',
    '심각손상': 'danger', '파손심함': 'danger', '사고차': 'danger',
    '강제회수': 'danger', '처리불가': 'danger', '거부': 'danger',
    'E': 'danger', '해지': 'danger', '분실': 'danger',
    // ── warn: 주의/경고 ──
    '연락두절': 'warn', '손상있음': 'warn', '수리필요': 'warn',
    '청소필요': 'warn', '세차필요': 'warn',
    '교체필요': 'warn', '편마모': 'warn', '이상있음': 'warn',
    '보류': 'warn', '연락불가': 'warn', '경미흠집': 'warn', '경미손상': 'warn',
    '법적조치진행': 'warn', '법적조치예고': 'warn', '내용증명발송': 'warn', '소송진행': 'warn',
    '미진행': 'warn', '보통': 'warn', '1/4': 'warn',
    '미제공': 'warn', '미정': 'warn', '미납해소': 'warn',
    // ── success: 양호/완료/긍정 ──
    '양호': 'success', '깨끗': 'success', '정상': 'success',
    '납부완료': 'success', '처리완료': 'success', '종결': 'success', '완료': 'success',
    '즉시납부': 'success', 'F': 'success', '분할합의': 'success',
    '대차반납': 'success', '납부약속': 'success', '회수': 'success',
    // ── info: 진행중/접수/중립 ──
    '진행중': 'info', '처리중': 'info', '수리중': 'info', '접수': 'info',
    '대차중': 'info', '대차제공': 'info',
    '전화독촉': 'info', '문자발송': 'info',
    // 이동방식
    '탁송': 'info', '직접': 'success',
    // 입출고 업무구분
    '차량이동': 'info', '정상출고': 'success', '정상반납': 'warn', '강제회수': 'danger',
    // 차량케어 작업구분
    '정비': 'warn', '사고수리': 'danger', '상품화': 'info', '세차': 'success',
    // 작업상태
    '입고': 'warn',
    // 정비유형
    '정기점검': 'info', '소모품교체': 'info', '수리': 'warn', '판금/도색': 'danger',
    // 사고 — 형태/역할
    '단독': 'warn', '쌍방': 'danger', '가해': 'danger', '피해': 'warn',
    // 다음예정
    '재출고': 'success', '정비입고': 'warn', '매각': 'danger',
    // 과태료
    '주정차위반': 'warn', '속도위반': 'danger', '신호위반': 'danger', '버스전용': 'warn',
    '고객부담': 'info', '회사부담': 'warn',
    // 고객센터 유형
    '일반문의': 'info', '컴플레인': 'danger', '계약문의': 'info', '정비요청': 'warn',
    '사고접수': 'danger', '반납협의': 'warn', '연장문의': 'info',
    // 고객센터 처리결과 (접수/진행중 이미 위에 있음)
    // 차키
    '전달': 'success', '복제': 'info',
    // 보험업무
    '배서(연령변경)': 'info', '신규가입': 'success', '갱신': 'info', '보험청구': 'warn',
    // 이동사유
    '배차': 'success', '정비입고': 'warn',
    // 회수사유 (미납/연락두절/계약위반 이미 위에 있음)
    // 세차유형
    '외부세차': 'info', '실내크리닝': 'info', '풀세차': 'success', '광택': 'success',
    // 연료
    '휘발유': 'warn', '경유': 'info', 'LPG': 'info', '전기충전': 'success',
    // 연료잔량
    '3/4': 'success', '1/2': 'info',
    // 운전자연령
    '21세': 'danger', '26세': 'warn', '만30세': 'info', '만35세': 'info', '전연령': 'success',
    // 사고부위
    '앞범퍼': 'warn', '뒷범퍼': 'warn', '앞휀더': 'warn', '뒷휀더': 'warn',
    '도어': 'warn', '본넷': 'danger', '트렁크': 'warn',
    '사이드미러': 'info', '유리': 'danger', '헤드라이트/테일램프': 'warn', '휠': 'info',
    // 점검유형
    '출고전점검': 'success', '반납후점검': 'warn', '정기점검': 'info', '임시점검': 'warn',
  };
  const sel = (name, label, opts) => `<div class="field"><label>${label}</label><input type="hidden" name="${name}"><div class="btn-group" data-name="${name}">${opts.map((o, i) => `<span class="btn-opt${i === 0 ? ' is-active' : ''}" data-val="${o}"${OPT_TONE[o] ? ` data-tone="${OPT_TONE[o]}"` : ''}>${o}</span>`).join('')}</div></div>`;

  // 차량케어센터: 기본정보 고정 + 세부 폼만 교체
  if (currentType === 'pc' || (_pcActive && ['maint', 'repair', 'product', 'wash'].includes(currentType))) {
    renderPcMode(host, today, carList, sel);
    return;
  }

  // 유형별 폼 생성
  let sections = '';

  if (currentType === 'ioc') {
    sections = `
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-info"></i>기본정보</div>
      <div class="form-grid">
        <div class="field is-required"><label>일자</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"><label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
        <div class="field" style="grid-column:1/-1">
          <div style="display:flex;gap:20px;align-items:flex-end;flex-wrap:wrap">
            ${sel('ioc_kind', '업무구분', ['차량이동','정상출고','정상반납','강제회수'])}
            ${sel('handover_by', '이동방식', ['탁송','직접'])}
            <div class="field" data-role="key-return" style="display:none">
              <label>차키 회수</label>
              <div class="btn-group" style="flex-wrap:wrap;gap:4px">
                <span class="btn-opt btn-toggle" data-name="key_returned" data-val="">회수완료</span>
              </div>
            </div>
            <div class="field" data-role="driver-age" style="display:none">
              <label>운전자 연령 확인 <span style="color:var(--c-text-muted);font-size:var(--font-size-xs)">(보험연령: <b data-role="ins-age-ref">—</b>)</span></label>
              <input type="hidden" name="driver_age">
              <div class="btn-group" data-name="driver_age">
                ${['21세','26세','만30세','만35세','전연령'].map((o)=>`<span class="btn-opt" data-val="${o}">${o}</span>`).join('')}
              </div>
            </div>
          </div>
        </div>
        <div class="field"><label>출발지</label><input type="text" name="from_location" list="iocLocList" value="${localStorage.getItem(LAST_FROM_KEY) || ''}" placeholder="출발 위치"></div>
        <div class="field"><label>도착지</label><input type="text" name="to_location" list="iocLocList" placeholder="도착 위치"></div>
        <datalist id="iocLocList">${[...new Set([...loadLocations(), ...loadFavorites()])].map(l => `<option value="${l}">`).join('')}</datalist>
        <div class="field" style="grid-column:1/-1"><label>메모</label><textarea name="note" rows="3" placeholder="탁송기사 연락처 · 특이사항 · 참고" class="ctrl" style="height:auto;padding:6px 8px"></textarea></div>
      </div>
    </div>

    <div class="form-section" id="iocInsCertSection" style="display:none">
      <div class="form-section-title"><i class="ph ph-certificate"></i>보험증권 업로드 <span style="color:var(--c-danger);margin-left:4px">*</span></div>
      <div class="form-grid">
        <div class="field" style="grid-column:1/-1">
          <div id="iocInsCertUploader"></div>
          <div id="iocInsCertStatus" style="margin-top:8px;font-size:var(--font-size-sm);color:var(--c-text-muted)">오늘 발급 증권을 업로드하세요 · 차량번호·날짜 자동 검증</div>
        </div>
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-image"></i>사진 · 파일</div>
      <div class="form-grid">
        <div class="field" style="grid-column:1/-1">
          <div id="iocPhotoUploader"></div>
        </div>
      </div>
    </div>`;
  } else if (currentType === 'maintenance') {
    sections = `
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-wrench"></i>정비 정보</div>
      <div class="form-grid">
        <div class="field is-required"></label>일자</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"></label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
        <div class="field"></label>정비내용</label><input type="text" name="title" placeholder="예: 엔진오일 교환"></div>
        ${sel('maint_type', '정비유형', ['정기점검','소모품교체','수리','판금/도색','타이어','기타'])}
        <div class="field"></label>금액</label><input type="text" name="amount" inputmode="numeric" placeholder="0"></div>
        <div class="field"></label>정비업체</label><input type="text" name="vendor" placeholder="카센터명"></div>
        <div class="field"></label>주행거리</label><input type="text" name="mileage" inputmode="numeric" placeholder="km"></div>
        <div class="field"></label>다음정비예정</label><input type="date" name="next_maint_date"></div>
        <div class="field" style="grid-column:1/-1"></label>메모</label><textarea name="note" rows="2"></textarea></div>
      </div>
    </div>`;

  } else if (currentType === 'accident') {
    sections = `
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-warning"></i>사고 기본</div>
      <div class="form-grid">
        <div class="field is-required"><label>사고일시</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"><label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
        <div class="field"><label>사고내용</label><input type="text" name="title" placeholder="예: 후방추돌"></div>
        <div class="field"><label>사고장소</label><input type="text" name="vendor" placeholder="사고 발생 위치"></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-tag"></i>사고 구분</div>
      <div class="form-grid">
        ${sel('acc_type', '사고형태', ['단독','쌍방'])}
        ${sel('acc_role', '가해/피해', ['가해','피해'])}
      </div>
      <div class="form-grid" style="margin-top:8px">
        <div class="field"><label>보험유형 (복수선택)</label>${chkGroup(
          chk('ins_car','자차') + chk('ins_property','대물') + chk('ins_person','대인') + chk('ins_self','자손') + chk('ins_uninsured','무보험'))}</div>
        ${sel('accident_status', '종결여부', ['접수','처리중','수리중','종결'])}
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-scales"></i>과실 · 금액</div>
      <div class="form-grid">
        <div class="field" style="grid-column:1/-1">
          <label>내 과실</label>
          <input type="hidden" name="fault_pct">
          <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center">
            <div class="btn-group" data-name="fault_pct" style="flex-wrap:wrap;gap:4px">
              ${['0%','10%','20%','30%','40%','50%','60%','70%','80%','90%','100%'].map((o,i)=>`<span class="btn-opt${i===0?' is-active':''}" data-val="${o}" style="min-width:40px;text-align:center">${o}</span>`).join('')}
            </div>
            <div style="display:inline-flex;align-items:center;gap:4px;margin-left:12px">
              <input type="text" name="fault_ratio" inputmode="numeric" maxlength="2" placeholder="00" style="width:44px;height:26px;padding:0 6px;text-align:right;font-size:var(--font-size-sm);border:1px solid var(--c-border);border-radius:var(--r-sm);outline:none;font-family:inherit">
              <span style="color:var(--c-text-muted);font-size:var(--font-size-sm)">%</span>
            </div>
          </div>
        </div>
        <div class="field"><label>수리예상금액</label><input type="text" name="repair_estimate" inputmode="numeric" placeholder="0"></div>
        ${sel('rental_car', '대차', ['미정','대차제공','대차없음'])}
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-shield-check"></i>보험 정보</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-5)">
        <div>
          <div style="font-size:var(--font-size-sm);font-weight:var(--fw-bold);color:var(--c-primary);margin-bottom:var(--sp-2);padding-bottom:var(--sp-1);border-bottom:1px solid var(--c-primary-bg)">우리쪽</div>
          <div class="form-grid" style="grid-template-columns:1fr">
            <div class="field"><label>보험사</label><input type="text" name="insurance_company" placeholder="삼성화재, 현대해상 등"></div>
            <div class="field"><label>접수번호</label><input type="text" name="insurance_no"></div>
            <div class="field"><label>담당자 연락처</label><input type="text" name="insurance_contact" inputmode="tel" placeholder="010-0000-0000"></div>
          </div>
        </div>
        <div>
          <div style="font-size:var(--font-size-sm);font-weight:var(--fw-bold);color:var(--c-text-sub);margin-bottom:var(--sp-2);padding-bottom:var(--sp-1);border-bottom:1px solid var(--c-border)">상대쪽</div>
          <div class="form-grid" style="grid-template-columns:1fr">
            <div class="field"><label>상대 차량번호</label><input type="text" name="accident_other" placeholder="예: 12가3456"></div>
            <div class="field"><label>보험사</label><input type="text" name="other_insurance" placeholder="상대 보험사"></div>
            <div class="field"><label>접수번호</label><input type="text" name="other_insurance_no" placeholder="상대측 접수번호"></div>
            <div class="field"><label>담당자 연락처</label><input type="text" name="other_insurance_contact" inputmode="tel" placeholder="010-0000-0000"></div>
          </div>
        </div>
      </div>
      <div style="margin-top:var(--sp-4);display:flex;gap:6px;align-items:center;padding-top:var(--sp-3);border-top:1px solid var(--c-border)">
        <i class="ph ph-plus" style="color:var(--c-text-muted);font-size:var(--icon-sm)"></i>
        <span style="font-size:var(--font-size-sm);color:var(--c-text-muted);font-weight:var(--fw-medium)">보험사 즐겨찾기:</span>
        <input type="text" id="iocNewInsCo" class="ctrl" placeholder="새 보험사 이름" style="flex:1;max-width:240px">
        <button type="button" class="btn" id="iocAddInsCo"><i class="ph ph-plus"></i> 등록</button>
      </div>
    </div>
    <div class="form-section">
      <div class="form-grid">
        <div class="field" style="grid-column:1/-1"><label>메모</label><textarea name="note" rows="2"></textarea></div>
      </div>
    </div>`;

  } else if (currentType === 'product_register') {
    sections = `
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-info"></i>상품등록</div>
      <div class="form-grid">
        <div class="field is-required"><label>등록일</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"><label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-tag"></i>대여조건</div>
      <div class="form-grid">
        ${sel('rental_type', '대여형태', ['장기렌트','단기렌트','리스','기타'])}
        <div class="field"><label>월 렌탈료</label><input type="text" name="monthly_rent" inputmode="numeric" placeholder="0"></div>
        <div class="field"><label>보증금</label><input type="text" name="deposit" inputmode="numeric" placeholder="0"></div>
        <div class="field"><label>약정기간</label><input type="text" name="contract_period" placeholder="예: 12개월, 24개월"></div>
        <div class="field"><label>약정주행</label><input type="text" name="mileage_limit" placeholder="예: 월 2,000km"></div>
        ${sel('insurance_type', '보험조건', ['완전자차','일반자차','자차미포함'])}
        <div class="field"><label>면책금</label><input type="text" name="deductible" inputmode="numeric" placeholder="0"></div>
        ${sel('age_limit', '연령제한', ['만21세이상','만26세이상','제한없음'])}
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-note"></i>특이사항</div>
      <div class="form-grid">
        <div class="field" style="grid-column:1/-1"><textarea name="note" rows="3" placeholder="상품 특이사항, 컨디션 메모"></textarea></div>
      </div>
    </div>`;

  } else if (currentType === 'penalty') {
    sections = `
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-info"></i>기본정보</div>
      <div class="form-grid">
        <div class="field is-required"><label>위반일자</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"><label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-prohibit"></i>과태료 정보</div>
      <div class="form-grid">
        <div class="field"><label>위반내용</label><input type="text" name="title" placeholder="예: 주정차위반, 속도위반"></div>
        ${sel('penalty_type', '위반유형', ['주정차위반','속도위반','신호위반','버스전용','기타'])}
        <div class="field"><label>위반장소</label><input type="text" name="vendor" placeholder="위반 위치"></div>
        <div class="field"><label>납부기한</label><input type="date" name="due_date"></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-wallet"></i>금액 · 부담</div>
      <div class="form-grid">
        <div class="field"><label>과태료금액</label><input type="text" name="amount" inputmode="numeric" placeholder="0"></div>
        ${sel('payer', '부담자', ['고객부담','회사부담'])}
        <div class="field"><label>고객명</label><input type="text" name="customer_name" placeholder="해당 고객"></div>
        ${sel('paid_status', '납부여부', ['미납','납부완료'])}
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-note"></i>메모</div>
      <div class="form-grid">
        <div class="field" style="grid-column:1/-1"><textarea name="note" rows="2"></textarea></div>
      </div>
    </div>`;

  } else if (currentType === 'delivery') {
    sections = `
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-truck"></i>출고 기본</div>
      <div class="form-grid">
        <div class="field is-required"></label>출고일</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"></label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
        <input type="hidden" name="title">
        <div class="field"></label>인도장소</label><input type="text" name="delivery_location" placeholder="사무실/고객방문/탁송"></div>
        <div class="field"></label>인수자명</label><input type="text" name="receiver_name"></div>
        <div class="field"></label>인수자연락처</label><input type="text" name="receiver_phone" placeholder="010-0000-0000"></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-gauge"></i>차량 상태</div>
      <div class="form-grid">
        <div class="field"></label>주행거리</label><input type="text" name="mileage" inputmode="numeric" placeholder="km"></div>
        ${sel('fuel_level', '연료잔량', ['F','3/4','1/2','1/4','E'])}
        ${sel('exterior', '외관상태', ['양호','경미흠집','손상있음'])}
        ${sel('interior', '실내상태', ['양호','보통','청소필요'])}
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-key"></i>키 인도</div>
      <div class="form-grid" style="grid-template-columns:repeat(4,1fr)">
        ${chk('key_main', '메인키')}
        ${chk('key_sub', '보조키')}
        ${chk('key_card', '카드키')}
        ${chk('key_etc', '기타')}
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-check-square"></i>출고 필수 확인</div>
      <div class="form-grid" style="grid-template-columns:repeat(3,1fr)">
        ${chk('check_gps', 'GPS 확인')}
        ${chk('check_contract', '계약서 확인')}
        ${chk('check_insurance_age', '보험연령 확인')}
        ${chk('check_payment', '잔금/입금 확인')}
        ${chk('check_license', '면허증 확인')}
        ${chk('check_insurance', '보험가입 확인')}
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-camera"></i>차량 사진</div>
      <label id="photoDrop" style="border:2px dashed var(--c-border-strong);border-radius:var(--r-md);padding:16px;text-align:center;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;color:var(--c-text-muted);transition:background var(--t-fast)">
        <input type="file" id="photoFile" multiple accept="image/*" hidden>
        <span style="font-size:20px">📷</span>
        <div style="font-size:var(--font-size-sm)">사진 추가 (드래그 또는 클릭)</div>
      </label>
      <div class="photo-grid" id="photoGrid" style="margin-top:8px"></div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-clipboard"></i>비품 확인</div>
      <div class="form-grid">
        ${chk('equip_navi', '내비게이션')}
        ${chk('equip_blackbox', '블랙박스')}
        ${chk('equip_hipass', '하이패스')}
        ${chk('equip_charger', '충전케이블')}
        ${chk('equip_triangle', '삼각대')}
        ${chk('equip_fire', '소화기')}
      </div>
    </div>
    <div class="form-section">
      <div class="form-grid">
        <div class="field" style="grid-column:1/-1"></label>특이사항</label><textarea name="note" rows="2" placeholder="기스 위치, 고객 요청사항 등"></textarea></div>
      </div>
    </div>`;

  } else if (currentType === 'return') {
    sections = `
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-arrow-u-down-left"></i>반납 기본</div>
      <div class="form-grid">
        <div class="field is-required"></label>반납일</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"></label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
        <input type="hidden" name="title">
        <div class="field"></label>반납장소</label><input type="text" name="return_location" placeholder="사무실/고객방문/탁송"></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-gauge"></i>차량 상태</div>
      <div class="form-grid">
        <div class="field"></label>주행거리</label><input type="text" name="mileage" inputmode="numeric" placeholder="km"></div>
        ${sel('fuel_level', '연료잔량', ['F','3/4','1/2','1/4','E'])}
        ${sel('car_condition', '차량상태', ['양호','경미손상','수리필요','사고차'])}
        ${sel('wash_status', '세차상태', ['깨끗','보통','세차필요'])}
        ${sel('exterior', '외관상태', ['양호','경미흠집','손상있음'])}
        ${sel('interior', '실내상태', ['양호','보통','청소필요'])}
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-key"></i>키 회수</div>
      <div class="form-grid" style="grid-template-columns:repeat(4,1fr)">
        ${chk('key_main', '메인키')}
        ${chk('key_sub', '보조키')}
        ${chk('key_card', '카드키')}
        ${chk('key_etc', '기타')}
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-receipt"></i>추가청구</div>
      <div class="form-grid">
        <div class="field"></label>과주행 추가금</label><input type="text" name="extra_mileage" inputmode="numeric" placeholder="0"></div>
        <div class="field"></label>연료부족 추가금</label><input type="text" name="extra_fuel" inputmode="numeric" placeholder="0"></div>
        <div class="field"></label>손상수리 추가금</label><input type="text" name="extra_damage" inputmode="numeric" placeholder="0"></div>
        ${sel('next_plan', '다음예정', ['재출고','정비입고','상품화','매각'])}
      </div>
    </div>
    <div class="form-section">
      <div class="form-grid">
        <div class="field" style="grid-column:1/-1"></label>특이사항</label><textarea name="note" rows="2" placeholder="손상부위, 추가청구 사유 등"></textarea></div>
      </div>
    </div>`;

  } else if (currentType === 'force') {
    sections = `
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-warning-octagon"></i>강제회수 정보</div>
      <div class="form-grid">
        <div class="field is-required"><label>회수일</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"><label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
        <input type="hidden" name="title">
        ${sel('force_reason', '회수사유', ['미납','연락두절','계약위반','사고방치','기타'])}
        <div class="field"><label>회수장소</label><input type="text" name="return_location" placeholder="회수 위치"></div>
        <div class="field"><label>회수담당</label><input type="text" name="handler"></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-gauge"></i>차량 상태</div>
      <div class="form-grid">
        <div class="field"><label>주행거리</label><input type="text" name="mileage" inputmode="numeric" placeholder="km"></div>
        ${sel('fuel_level', '연료잔량', ['F','3/4','1/2','1/4','E'])}
        ${sel('car_condition', '차량상태', ['양호','경미손상','수리필요','사고차','파손심함'])}
        ${sel('exterior', '외관', ['양호','경미흠집','손상있음','심각손상'])}
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-key"></i>키 회수</div>
      <div class="form-grid" style="grid-template-columns:repeat(4,1fr)">
        ${chk('key_main', '메인키')}
        ${chk('key_sub', '보조키')}
        ${chk('key_card', '카드키')}
        ${chk('key_etc', '기타')}
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-wallet"></i>미수/정산</div>
      <div class="form-grid">
        <div class="field"><label>미납금액</label><input type="text" name="unpaid_amount" inputmode="numeric" placeholder="0"></div>
        <div class="field"><label>손해배상청구</label><input type="text" name="damage_claim" inputmode="numeric" placeholder="0"></div>
        ${sel('legal_action', '법적조치', ['미진행','내용증명발송','소송진행','완료'])}
        <div class="field" style="grid-column:1/-1"><label>상세내역</label><textarea name="note" rows="3" placeholder="회수 경위, 차량 상태, 고객 대응 등"></textarea></div>
      </div>
    </div>`;

  } else if (currentType === 'transfer') {
    sections = `
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-arrows-left-right"></i>이동 정보</div>
      <div class="form-grid">
        <div class="field is-required"></label>이동일</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"></label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
        <input type="hidden" name="title">
        <div class="field"></label>출발지</label><input type="text" name="from_location" placeholder="출발 위치"></div>
        <div class="field"></label>도착지</label><input type="text" name="to_location" placeholder="도착 위치"></div>
        ${sel('transfer_reason', '이동사유', ['배차','정비입고','탁송','기타'])}
        <div class="field"></label>주행거리</label><input type="text" name="mileage" inputmode="numeric" placeholder="km"></div>
        <div class="field"></label>비용</label><input type="text" name="amount" inputmode="numeric" placeholder="0"></div>
        <div class="field" style="grid-column:1/-1"></label>메모</label><textarea name="note" rows="2"></textarea></div>
      </div>
    </div>`;

  } else if (currentType === 'ignition') {
    sections = `
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-engine"></i>시동제어</div>
      <div class="form-grid">
        <div class="field is-required"><label>일자</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"><label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
        <input type="hidden" name="title">
        <div class="field"><label>조치구분</label><input type="hidden" name="ignition_action" value="시동제어">
          <div class="btn-group" data-name="ignition_action">
            <span class="btn-opt is-active" data-val="시동제어" data-tone="warn">시동제어</span>
            <span class="btn-opt" data-val="제어해제" data-tone="success">제어해제</span>
          </div>
        </div>
        <div class="field" id="ignitionReasonWrap"><label>사유</label>
          <input type="hidden" name="ignition_reason">
          <div class="btn-group" data-name="ignition_reason" id="ignitionReasonGroup"></div>
        </div>
        <div class="field"><label>미납액</label><input type="text" name="unpaid_amount" inputmode="numeric" placeholder="0"></div>
        <div class="field"><label>담당자</label><input type="text" name="handler" placeholder="담당자"></div>
        <div class="field" style="grid-column:1/-1"><label>상세내역</label><textarea name="note" rows="3" placeholder="시동제어 사유, 고객 연락 상황 등"></textarea></div>
      </div>
    </div>`;

  } else if (currentType === 'key') {
    sections = `
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-info"></i>기본정보</div>
      <div class="form-grid">
        <div class="field is-required"><label>일자</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"><label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-key"></i>차키 업무</div>
      <div class="form-grid">
        <input type="hidden" name="title">
        ${sel('key_action', '구분', ['전달','회수','분실','복제'])}
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-list-checks"></i>키 종류</div>
      <div class="form-grid" style="grid-template-columns:repeat(4,1fr)">
        ${chk('key_main', '메인키')}
        ${chk('key_sub', '보조키')}
        ${chk('key_card', '카드키')}
        ${chk('key_etc', '기타')}
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-note"></i>메모</div>
      <div class="form-grid">
        <div class="field"><label>키번호/위치</label><input type="text" name="key_info" placeholder="키번호 또는 보관위치"></div>
        <div class="field" style="grid-column:1/-1"><textarea name="note" rows="2"></textarea></div>
      </div>
    </div>`;

  } else if (currentType === 'maint') {
    const vendorList = vendors.filter(v => ['정비소','타이어','부품','도색/판금'].includes(v.vendor_type)).map(v => `<option value="${v.vendor_name}">`).join('');
    sections = `
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-info"></i>정비 기본</div>
      <div class="form-grid">
        <div class="field is-required"><label>일자</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"><label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-wrench"></i>소모품 교체 <button type="button" class="btn" id="addPartsRow" style="margin-left:auto">+ 항목추가</button></div>
      <table class="grid-table" id="partsTable">
        <thead><tr><th>항목</th><th style="width:120px">금액</th><th style="width:40px"></th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-hammer"></i>기능수리 <button type="button" class="btn" id="addFixRow" style="margin-left:auto">+ 항목추가</button></div>
      <table class="grid-table" id="fixTable">
        <thead><tr><th>수리내용</th><th style="width:120px">금액</th><th style="width:40px"></th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-calculator"></i>합계</div>
      <div class="form-grid">
        <div class="field"><label>총 금액</label><input type="text" name="amount" inputmode="numeric" placeholder="자동 계산" readonly id="maintTotal"></div>
        <div class="field"><label>다음정비예정</label><input type="date" name="next_maint_date"></div>
        <div class="field" style="grid-column:1/-1"><label>메모</label><textarea name="note" rows="2"></textarea></div>
      </div>
    </div>`;

  } else if (currentType === 'product') {
    sections = `
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-sparkle"></i>상품화 기본</div>
      <div class="form-grid">
        <div class="field is-required"><label>일자</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"><label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-puzzle-piece"></i>부속품 설치 <button type="button" class="btn prod-add" data-table="prodAccessory" style="margin-left:auto">+ 추가</button></div>
      <table class="grid-table prod-table" id="prodAccessory">
        <thead><tr><th>항목</th><th style="width:90px">업체</th><th style="width:120px">금액</th><th style="width:40px"></th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-drop"></i>세차/광택 <button type="button" class="btn prod-add" data-table="prodWash" style="margin-left:auto">+ 추가</button></div>
      <table class="grid-table prod-table" id="prodWash">
        <thead><tr><th>항목</th><th style="width:90px">업체</th><th style="width:120px">금액</th><th style="width:40px"></th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-paint-brush"></i>외판수리 <button type="button" class="btn prod-add" data-table="prodBody" style="margin-left:auto">+ 추가</button></div>
      <table class="grid-table prod-table" id="prodBody">
        <thead><tr><th>항목</th><th style="width:90px">업체</th><th style="width:120px">금액</th><th style="width:40px"></th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-wrench"></i>소모품교체 <button type="button" class="btn prod-add" data-table="prodParts" style="margin-left:auto">+ 추가</button></div>
      <table class="grid-table prod-table" id="prodParts">
        <thead><tr><th>항목</th><th style="width:90px">업체</th><th style="width:120px">금액</th><th style="width:40px"></th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-hammer"></i>기능수리 <button type="button" class="btn prod-add" data-table="prodFix" style="margin-left:auto">+ 추가</button></div>
      <table class="grid-table prod-table" id="prodFix">
        <thead><tr><th>항목</th><th style="width:90px">업체</th><th style="width:120px">금액</th><th style="width:40px"></th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-gauge"></i>차량 상태</div>
      <div class="form-grid">
        ${sel('exterior', '외관', ['양호','경미흠집','손상있음'])}
        ${sel('interior', '실내', ['양호','보통','청소필요'])}
        ${sel('tire_status', '타이어', ['양호','교체필요','편마모'])}
      </div>
    </div>
    <div class="form-section">
      <div class="form-grid">
        <div class="field"><label>총 비용</label><input type="text" name="amount" inputmode="numeric" placeholder="자동 계산" readonly id="productTotal"></div>
        <div class="field" style="grid-column:1/-1"><label>메모</label><textarea name="note" rows="2"></textarea></div>
      </div>
    </div>`;

  } else if (currentType === 'repair') {
    const repairVendors = vendors.filter(v => ['정비소','도색/판금'].includes(v.vendor_type)).map(v => `<option value="${v.vendor_name}">`).join('');
    sections = `
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-info"></i>기본정보</div>
      <div class="form-grid">
        <div class="field is-required"><label>일자</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"><label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-car-profile"></i>사고 부위 · 정도</div>
      <div class="form-grid">
        ${sel('damage_area', '사고부위', ['앞범퍼','뒷범퍼','앞휀더','뒷휀더','도어','본넷','트렁크','사이드미러','유리','헤드라이트/테일램프','휠','기타'])}
        ${sel('damage_frame', '골격 손상', ['없음','경미','있음'])}
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-wallet"></i>수리 비용</div>
      <div class="form-grid">
        <div class="field"><label>총 수리비</label><input type="text" name="amount" inputmode="numeric" placeholder="0"></div>
        <div class="field"><label>보험처리금액</label><input type="text" name="insurance_amount" inputmode="numeric" placeholder="0"></div>
        <div class="field"><label>자기부담금</label><input type="text" name="self_pay" inputmode="numeric" placeholder="0"></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-calendar"></i>수리 일정</div>
      <div class="form-grid">
        <div class="field"><label>입고일</label><input type="date" name="repair_in_date"></div>
        <div class="field"><label>출고예정일</label><input type="date" name="repair_out_date"></div>
        ${sel('rental_car', '대차', ['미제공','대차중','대차반납'])}
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-note"></i>메모</div>
      <div class="form-grid">
        <div class="field" style="grid-column:1/-1"><textarea name="note" rows="3" placeholder="사고경위·특이사항"></textarea></div>
      </div>
      <input type="hidden" name="title">
    </div>`;

  } else if (currentType === 'collect') {
    sections = `
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-info"></i>기본정보</div>
      <div class="form-grid">
        <div class="field is-required"><label>일자</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"><label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-envelope"></i>미수 정보</div>
      <div class="form-grid">
        <input type="hidden" name="title">
        <div class="field"><label>고객명</label><input type="text" name="customer_name"></div>
        <div class="field"><label>연락처</label><input type="text" name="customer_phone" placeholder="010-0000-0000"></div>
        <div class="field"><label>미수금액</label><input type="text" name="amount" inputmode="numeric" placeholder="0"></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-checks"></i>조치 내역</div>
      <div class="form-grid">
        ${sel('collect_action', '조치', ['전화독촉','문자발송','내용증명발송','법적조치예고','법적조치진행','기타'])}
        ${sel('collect_result', '결과', ['납부약속','즉시납부','연락불가','거부','기타'])}
        <div class="field"><label>약속납부일</label><input type="date" name="promise_date"></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-note"></i>상세내용</div>
      <div class="form-grid">
        <div class="field" style="grid-column:1/-1"><textarea name="note" rows="3" placeholder="통화 내용, 조치 사항 기록"></textarea></div>
      </div>
    </div>`;

  } else if (currentType === 'insurance') {
    sections = `
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-info"></i>기본정보</div>
      <div class="form-grid">
        <div class="field is-required"><label>일자</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"><label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
        <input type="hidden" name="title">
        ${sel('insurance_action', '업무구분', ['배서(연령변경)','신규가입','갱신','해지','보험청구','기타'])}
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-file-text"></i>배서 내역</div>
      <div class="form-grid">
        ${sel('age_after', '연령', ['21세','26세','만30세','만35세','전연령'])}
        <div class="field"><label>추가/환급 보험료</label><input type="text" name="amount" inputmode="numeric" placeholder="0"></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-certificate"></i>보험증권 업로드</div>
      <div class="form-grid">
        <div class="field" style="grid-column:1/-1">
          <div id="insurancePhotoUploader"></div>
          <div style="margin-top:6px;font-size:var(--font-size-xs);color:var(--c-text-muted)">보험증권 PDF/이미지 · 배서확인서 등</div>
        </div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-note"></i>메모</div>
      <div class="form-grid">
        <div class="field" style="grid-column:1/-1"><textarea name="note" rows="2" placeholder="출고 고객명, 변경 사유 등"></textarea></div>
      </div>
    </div>`;

  } else if (currentType === 'wash') {
    sections = `
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-drop"></i>세차/광택 기본</div>
      <div class="form-grid">
        <div class="field is-required"><label>일자</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"><label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-list"></i>항목 <button type="button" class="btn" id="addWashRow" style="margin-left:auto">+ 항목추가</button></div>
      <table class="grid-table" id="washTable">
        <thead><tr><th>항목</th><th style="width:120px">금액</th><th style="width:40px"></th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <div class="form-section">
      <div class="form-grid">
        <div class="field"><label>합계</label><input type="text" name="amount" inputmode="numeric" placeholder="자동 계산" readonly id="washTotal"></div>
        <div class="field" style="grid-column:1/-1"><label>메모</label><textarea name="note" rows="2"></textarea></div>
      </div>
    </div>`;

  } else if (currentType === 'inspect') {
    sections = `
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-magnifying-glass"></i>차량 점검</div>
      <div class="form-grid">
        <div class="field is-required"><label>일자</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"><label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
        <input type="hidden" name="title">
        ${sel('inspect_type', '점검유형', ['출고전점검','반납후점검','정기점검','임시점검'])}
        <div class="field"><label>주행거리</label><input type="text" name="mileage" inputmode="numeric" placeholder="km"></div>
        ${sel('fuel_level', '연료잔량', ['F','3/4','1/2','1/4','E'])}
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-car"></i>외관 점검</div>
      <div class="form-grid">
        ${sel('exterior', '외관상태', ['양호','경미흠집','손상있음'])}
        ${sel('interior', '실내상태', ['양호','보통','청소필요'])}
        ${sel('tire_status', '타이어', ['양호','교체필요','편마모'])}
        ${sel('light_status', '등화장치', ['정상','이상있음'])}
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-clipboard"></i>비품 확인</div>
      <div class="form-grid">
        ${chk('equip_navi', '내비게이션')}
        ${chk('equip_blackbox', '블랙박스')}
        ${chk('equip_hipass', '하이패스')}
        ${chk('equip_charger', '충전케이블')}
        ${chk('equip_triangle', '삼각대')}
        ${chk('equip_fire', '소화기')}
      </div>
    </div>
    <div class="form-section">
      <div class="form-grid">
        <div class="field" style="grid-column:1/-1"><label>특이사항</label><textarea name="note" rows="2" placeholder="점검 결과 기록"></textarea></div>
      </div>
    </div>`;

  } else if (currentType === 'fuel') {
    sections = `
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-info"></i>기본정보</div>
      <div class="form-grid">
        <div class="field is-required"><label>일자</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"><label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-gas-pump"></i>주유/충전</div>
      <div class="form-grid">
        ${sel('fuel_type', '유종', ['휘발유','경유','LPG','전기충전'])}
        <div class="field"><label>리터/kWh</label><input type="text" name="fuel_amount" inputmode="numeric" placeholder="리터 또는 kWh"></div>
        <div class="field"><label>금액</label><input type="text" name="amount" inputmode="numeric" placeholder="0"></div>
        <div class="field"><label>주유소</label><input type="text" name="vendor" placeholder="주유소명"></div>
        <div class="field"><label>주행거리</label><input type="text" name="mileage" inputmode="numeric" placeholder="km"></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-note"></i>메모</div>
      <div class="form-grid">
        <div class="field" style="grid-column:1/-1"><textarea name="note" rows="2"></textarea></div>
      </div>
    </div>`;

  } else if (currentType === 'contact') {
    sections = `
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-info"></i>기본정보</div>
      <div class="form-grid">
        <div class="field is-required"><label>일자</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"><label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
      </div>
      <input type="hidden" name="customer_name">
      <input type="hidden" name="customer_phone">
    </div>

    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-phone"></i>응대구분</div>
      <div class="form-grid">
        <div class="field" style="grid-column:1/-1">
          <div style="display:flex;gap:20px;align-items:flex-end;flex-wrap:wrap">
            ${sel('contact_type', '유형', ['일반문의','컴플레인','계약문의','정비요청','사고접수','반납협의','연장문의','기타'])}
            ${sel('contact_result', '처리결과', ['진행중','처리완료','보류','처리불가'])}
          </div>
        </div>
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-note"></i>처리내용</div>
      <div class="form-grid">
        <div class="field" style="grid-column:1/-1"><textarea name="note" rows="4" placeholder="상담·처리 내용 기록"></textarea></div>
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-image"></i>첨부파일</div>
      <div class="form-grid">
        <div class="field" style="grid-column:1/-1">
          <div id="contactPhotoUploader"></div>
        </div>
      </div>
    </div>`;

  } else {
    sections = `
    <div class="form-section">
      <div class="form-grid">
        <div class="field is-required"></label>일자</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"></label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
        <input type="hidden" name="title">
        <div class="field"></label>금액</label><input type="text" name="amount" inputmode="numeric" placeholder="0"></div>
        <div class="field"></label>업체/장소</label><input type="text" name="vendor"></div>
        <div class="field" style="grid-column:1/-1"></label>메모</label><textarea name="note" rows="2"></textarea></div>
      </div>
    </div>`;
  }

  // 차량 조회 패널 (모든 업무 공통 — 맨 위, 좌우 4개씩 균형)
  const carInfoPanel = `
    <div id="iocCarInfo" class="ioc-car-info" hidden style="margin:0 var(--sp-5) var(--sp-3)">
      <div class="ioc-car-col">
        <div class="ioc-car-col-title"><i class="ph ph-car"></i>차량 스펙</div>
        <div class="ioc-car-row"><span class="k">회사명</span><span class="v" data-f="company">—</span></div>
        <div class="ioc-car-row"><span class="k">차량번호</span><span class="v" data-f="car">—</span></div>
        <div class="ioc-car-row"><span class="k">세부모델</span><span class="v" data-f="model">—</span></div>
        <div class="ioc-car-row"><span class="k">보험연령</span><span class="v" data-f="insAge">—</span></div>
      </div>
      <div class="ioc-car-col">
        <div class="ioc-car-col-title"><i class="ph ph-clipboard-text"></i>계약 / 상태</div>
        <div class="ioc-car-row"><span class="k">계약자</span><span class="v" data-f="contractor">—</span></div>
        <div class="ioc-car-row"><span class="k">연락처</span><span class="v" data-f="phone">—</span></div>
        <div class="ioc-car-row"><span class="k">계약상태</span><span class="v" data-f="carStatus">—</span></div>
        <div class="ioc-car-row"><span class="k">미납여부</span><span class="v" data-f="unpaidYn">—</span></div>
      </div>
    </div>`;
  host.innerHTML = carInfoPanel + sections;

  // 차량케어 유형(maint/repair/product/wash)에는 첨부파일 섹션 자동 추가
  if (['maint', 'repair', 'product', 'wash'].includes(currentType)) {
    const ATTACH_HINT = {
      maint:   { title: '정비 첨부', desc: '정비 영수증 · 점검표 · 부품 사진', required: false },
      repair:  { title: '사고수리 첨부', desc: '견적서 필수 · 판금·도색 사진', required: true },
      product: { title: '상품화 첨부', desc: '작업 전/후 사진 · 견적서 · 용품 영수증', required: false },
      wash:    { title: '세차 첨부', desc: '세차 전/후 사진', required: false },
    }[currentType] || { title: '첨부파일', desc: '관련 문서·사진', required: false };
    const attachSection = document.createElement('div');
    attachSection.className = 'form-section';
    attachSection.id = 'pcAttachSection';
    attachSection.dataset.required = ATTACH_HINT.required ? '1' : '0';
    attachSection.innerHTML = `
      <div class="form-section-title">
        <i class="ph ph-paperclip"></i>${ATTACH_HINT.title}
        ${ATTACH_HINT.required ? '<span style="color:var(--c-danger);margin-left:4px">*</span>' : ''}
      </div>
      <div class="form-grid">
        <div class="field" style="grid-column:1/-1">
          <div id="pcPhotoUploader"></div>
          <div style="margin-top:6px;font-size:var(--font-size-xs);color:${ATTACH_HINT.required ? 'var(--c-danger)' : 'var(--c-text-muted)'}">${ATTACH_HINT.desc}</div>
        </div>
      </div>
    `;
    host.appendChild(attachSection);
    // 업로더 생성
    const mount = attachSection.querySelector('#pcPhotoUploader');
    if (mount) {
      let _ocrDoneFor = new Set();
      iocUploader = createPhotoUploader(mount, {
        accept: 'image/*,.pdf,.xlsx,.xls',
        multiple: true,
        onChange: async (files) => {
          if (currentType !== 'repair') return;
          const first = files[0];
          if (!first) return;
          const sig = first.name + first.size;
          if (_ocrDoneFor.has(sig)) return;
          _ocrDoneFor.add(sig);
          // 이미지/PDF만 OCR
          if (!/\.(pdf|png|jpe?g|heic|webp)$/i.test(first.name)) return;
          try {
            showToast('견적서 OCR 분석 중...', 'info');
            const text = await ocrFile(first);
            if (!text) return;
            // 총액 추출
            const amt = extractAmount(text);
            const date = extractDate(text);
            const amountInp = host.querySelector('input[name="amount"]');
            const dateInp = host.querySelector('input[name="date"]');
            const titleInp = host.querySelector('input[name="title"]');
            const filled = [];
            if (amt && amountInp && !amountInp.value) {
              amountInp.value = amt.toLocaleString();
              filled.push(`금액 ${amt.toLocaleString()}원`);
            }
            if (date && dateInp) {
              dateInp.value = date;
              filled.push(`일자 ${date}`);
            }
            // 제목 자동: "견적서 XXX원" 또는 상단 한 줄
            if (titleInp && !titleInp.value) {
              const firstLine = text.split('\n').map(s => s.trim()).find(s => s.length >= 3 && s.length < 40) || '';
              if (firstLine) { titleInp.value = firstLine; filled.push('제목'); }
            }
            // 수리항목 파싱 — "부품명 ... 숫자원" 패턴
            const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
            const itemRows = [];
            for (const ln of lines) {
              const m = ln.match(/^(.{2,30}?)\s+([\d,]{3,})\s*원?$/);
              if (m) {
                const cost = Number(m[2].replace(/,/g, ''));
                if (cost > 0 && cost < 50000000) itemRows.push({ item: m[1].trim(), cost });
              }
              if (itemRows.length >= 10) break;
            }
            const repairTbody = host.querySelector('#repairTable tbody');
            if (repairTbody && itemRows.length) {
              repairTbody.innerHTML = '';
              for (const r of itemRows) {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td><input type="text" name="repairTable_item" value="${r.item}" style="width:100%;border:none;outline:none"></td><td><input type="text" name="repairTable_cost" value="${r.cost.toLocaleString()}" style="width:100%;border:none;outline:none;text-align:right"></td><td><button type="button" class="btn-icon btn-icon-del" onclick="this.closest('tr').remove()"><i class="ph ph-trash"></i></button></td>`;
                repairTbody.appendChild(tr);
              }
              filled.push(`수리항목 ${itemRows.length}개`);
            }
            showToast(`견적서 자동 인식: ${filled.join(', ') || '데이터 없음'}`, 'success');
          } catch (e) {
            console.error('[ocr]', e);
            showToast('OCR 분석 실패', 'error');
          }
        }
      });
    }
  }

  // 입출고센터 — 사진 업로더 + 인터랙션 초기화
  // 일자 퀵버튼 (달력 옆에 한줄로)
  host.querySelectorAll('input[type="date"][name="date"]').forEach((dateInp) => {
    if (dateInp.dataset._quickDone) return;
    dateInp.dataset._quickDone = '1';
    // 입력 + 퀵버튼 가로 flex 래핑
    const wrap = document.createElement('div');
    wrap.className = 'date-row';
    dateInp.parentNode.insertBefore(wrap, dateInp);
    wrap.appendChild(dateInp);
    const quick = document.createElement('div');
    quick.className = 'date-quick';
    quick.innerHTML = `
      <button type="button" class="dq-btn" data-act="prev" title="하루 전"><i class="ph ph-caret-left"></i></button>
      <button type="button" class="dq-btn" data-act="yday">어제</button>
      <button type="button" class="dq-btn" data-act="today">오늘</button>
      <button type="button" class="dq-btn" data-act="tmrw" title="예약용">내일</button>
      <button type="button" class="dq-btn" data-act="next" title="하루 뒤"><i class="ph ph-caret-right"></i></button>
    `;
    wrap.appendChild(quick);
    const fmt = (d) => d.toISOString().slice(0, 10);
    const shift = (days) => {
      const base = dateInp.value ? new Date(dateInp.value) : new Date();
      base.setDate(base.getDate() + days);
      dateInp.value = fmt(base);
      dateInp.dispatchEvent(new Event('change'));
    };
    quick.addEventListener('click', (e) => {
      const b = e.target.closest('.dq-btn'); if (!b) return;
      const act = b.dataset.act;
      if (act === 'today') dateInp.value = fmt(new Date());
      else if (act === 'yday') { const d = new Date(); d.setDate(d.getDate() - 1); dateInp.value = fmt(d); }
      else if (act === 'tmrw') { const d = new Date(); d.setDate(d.getDate() + 1); dateInp.value = fmt(d); }
      else if (act === 'prev') shift(-1);
      else if (act === 'next') shift(1);
      dateInp.dispatchEvent(new Event('change'));
    });
  });

  // 차량 자동조회 공통 (모든 업무)
  {
    const carInput = host.querySelector('input[name="car_number"]');
    const infoEl = host.querySelector('#iocCarInfo');
    if (carInput && infoEl) {
      const setField = (f, val) => { const el = infoEl.querySelector(`[data-f="${f}"]`); if (el) el.textContent = val || '—'; };
      const refreshCarInfo = () => {
        const cn = (carInput?.value || '').trim();
        if (!cn) { infoEl.hidden = true; return; }
        const a = assets.find(x => x.car_number === cn);
        infoEl.hidden = false;
        if (!a) {
          setField('company', '등록되지 않은 차량'); setField('car', cn); setField('model', '—');
          setField('contractor', '—'); setField('endDate', '—'); setField('carStatus', '—');
          return;
        }
        setField('company', a.partner_code || '—');
        setField('car', a.car_number);
        setField('model', a.detail_model || a.car_model || '—');
        // 보험연령 — 이 차량의 최근 '배서(연령변경)' 이벤트에서 age_after 추출
        const insEvents = allEvents.filter(e => e.car_number === a.car_number && e.type === 'insurance' && e.age_after);
        const latestIns = insEvents.sort((x, y) => String(y.date || '').localeCompare(String(x.date || '')))[0];
        setField('insAge', latestIns?.age_after || '—');
        const today = new Date().toISOString().slice(0, 10);
        const cands = contracts.filter(c => c.car_number === a.car_number);
        const active = cands.find(c => c.contract_status === '계약진행' && (!c.end_date || c.end_date >= today))
                     || cands.sort((x, y) => String(y.start_date || '').localeCompare(String(x.start_date || '')))[0];
        let carStatus = '대기';
        if (active && active.contract_status === '계약진행') {
          carStatus = `계약중 (${active.contractor_name || '—'})`;
          setField('contractor', active.contractor_name || '—');
          setField('endDate', active.end_date || '—');
          // 공통: 모든 업무에 계약자/미납/기간 노출
          setField('phone', active.contractor_phone || '—');
          setField('regNo', active.contractor_reg_no || '—');
          const cBillings = _billings.filter(b => b.contract_code === active.contract_code);
          const unpaid = cBillings.filter(b => (Number(b.paid_total) || 0) < (Number(b.amount) || 0));
          const unpaidTotal = unpaid.reduce((s, b) => s + ((Number(b.amount) || 0) - (Number(b.paid_total) || 0)), 0);
          setField('unpaidYn', unpaid.length ? `미납 ${unpaidTotal.toLocaleString()}원 (${unpaid.length}건)` : '정상');
          const unpaidEl = infoEl.querySelector('[data-f="unpaidYn"]');
          if (unpaidEl) unpaidEl.style.color = unpaid.length ? 'var(--c-danger)' : 'var(--c-success)';
          const fmtShort = (d) => d ? d.replace(/^20/, '').replace(/-/g, '.') : '';
          const endDate = active.end_date || computeEndDate(active) || '';
          setField('period', `${fmtShort(active.start_date)}~${fmtShort(endDate)}`);
          // 고객센터: 고객명/연락처 hidden 필드도 자동 채움
          if (currentType === 'contact') {
            const nameInp = host.querySelector('input[name="customer_name"]');
            const phoneInp = host.querySelector('input[name="customer_phone"]');
            if (nameInp) nameInp.value = active.contractor_name || '';
            if (phoneInp) phoneInp.value = active.contractor_phone || '';
          }
        } else if (a.status === 'idle' || a.status === '휴차') { carStatus = '휴차'; setField('contractor', '—'); setField('endDate', '—');
        } else if (a.status === 'product' || a.status === '상품화') { carStatus = '상품화 중'; setField('contractor', '—'); setField('endDate', '—');
        } else if (a.status === 'disposal' || a.status === '매각') { carStatus = '매각'; setField('contractor', '—'); setField('endDate', '—');
        } else {
          const last = cands.sort((x, y) => String(y.end_date || '').localeCompare(String(x.end_date || '')))[0];
          if (last) { setField('contractor', last.contractor_name || '—'); setField('endDate', last.end_date || '—'); carStatus = last.contract_status === '계약완료' ? '반납완료' : '대기'; }
          else { setField('contractor', '—'); setField('endDate', '—'); }
        }
        setField('carStatus', carStatus);
      };
      carInput.addEventListener('input', refreshCarInfo);
      carInput.addEventListener('change', refreshCarInfo);
      refreshCarInfo();
    }
  }

  if (currentType === 'contact') {
    const mount = host.querySelector('#contactPhotoUploader');
    if (mount) iocUploader = createPhotoUploader(mount, { accept: 'image/*,.pdf', multiple: true });
  }

  if (currentType === 'insurance') {
    const mount = host.querySelector('#insurancePhotoUploader');
    if (mount) iocUploader = createPhotoUploader(mount, { accept: 'image/*,.pdf', multiple: true });
  }

  // pcKindHeader/pc전환은 renderPcMode에서 처리 (위에서 early return)

  if (currentType === 'ioc') {
    if (iocUploader) iocUploader.clear();
    const mount = host.querySelector('#iocPhotoUploader');
    if (mount) iocUploader = createPhotoUploader(mount, { accept: 'image/*,.pdf', multiple: true });

    // 업무구분 → 차키 회수 / 운전자 연령 / 보험증권 섹션 토글
    const kindGroup = host.querySelector('.btn-group[data-name="ioc_kind"]');
    const keyField = host.querySelector('[data-role="key-return"]');
    const driverField = host.querySelector('[data-role="driver-age"]');
    const insCertSection = host.querySelector('#iocInsCertSection');
    const syncKindDeps = () => {
      const v = host.querySelector('input[name="ioc_kind"]')?.value || '';
      if (keyField) keyField.style.display = v === '강제회수' ? '' : 'none';
      if (driverField) {
        driverField.style.display = v === '정상출고' ? '' : 'none';
        if (v === '정상출고') {
          const cn = host.querySelector('input[name="car_number"]')?.value.trim();
          const insEvs = allEvents.filter(e => e.car_number === cn && e.type === 'insurance' && e.age_after)
            .sort((x, y) => String(y.date || '').localeCompare(String(x.date || '')));
          const ref = driverField.querySelector('[data-role="ins-age-ref"]');
          if (ref) ref.textContent = insEvs[0]?.age_after || '—';
        }
      }
      if (insCertSection) insCertSection.style.display = v === '정상출고' ? '' : 'none';
    };
    kindGroup?.addEventListener('click', () => setTimeout(syncKindDeps, 10));
    const carInp = host.querySelector('input[name="car_number"]');
    carInp?.addEventListener('change', syncKindDeps);
    syncKindDeps();

    // 보험증권 업로더 + OCR 검증
    _iocInsCertVerified = false;
    const insCertMount = host.querySelector('#iocInsCertUploader');
    const statusEl = host.querySelector('#iocInsCertStatus');
    if (insCertMount) {
      iocInsCertUploader = createPhotoUploader(insCertMount, {
        accept: 'image/*,.pdf',
        multiple: false,
        onChange: async (files) => {
          const f = files[0];
          if (!f) { _iocInsCertVerified = false; return; }
          if (!statusEl) return;
          const carNumber = (host.querySelector('input[name="car_number"]')?.value || '').trim();
          const formDate = host.querySelector('input[name="date"]')?.value || '';
          statusEl.innerHTML = '<i class="ph ph-spinner"></i> 증권 OCR 분석 중...';
          statusEl.style.color = 'var(--c-text-muted)';
          try {
            const text = await ocrFile(f);
            const extCar = extractCarNumber(text);
            const extDate = extractDate(text);
            const carOk = !carNumber || !extCar || extCar === carNumber;
            const dateOk = !formDate || !extDate || extDate === formDate;
            if (carOk && dateOk) {
              _iocInsCertVerified = true;
              statusEl.innerHTML = `✓ 검증 완료 — 차량 ${extCar || '(미인식)'}, 날짜 ${extDate || '(미인식)'}`;
              statusEl.style.color = 'var(--c-success)';
            } else {
              _iocInsCertVerified = false;
              const reasons = [];
              if (!carOk) reasons.push(`차량번호 불일치 (증권: ${extCar}, 입력: ${carNumber})`);
              if (!dateOk) reasons.push(`날짜 불일치 (증권: ${extDate}, 입력: ${formDate})`);
              statusEl.innerHTML = `⚠ ${reasons.join(' · ')}`;
              statusEl.style.color = 'var(--c-danger)';
            }
          } catch (e) {
            _iocInsCertVerified = false;
            statusEl.textContent = '⚠ OCR 실패 — 수동 확인 필요';
            statusEl.style.color = 'var(--c-warn)';
          }
        }
      });
    }
  } else {
    iocUploader = null;
  }

  // 정비: 행 추가/삭제/합계
  if (currentType === 'maint') {
    const partsOpts = ['엔진오일','미션오일','브레이크오일','에어필터','에어컨필터','와이퍼','배터리','타이어','브레이크패드','냉각수','부동액','점화플러그','벨트류','기타'];
    const addRow = (tableId, opts) => {
      const tbody = host.querySelector(`#${tableId} tbody`);
      const tr = document.createElement('tr');
      const optHtml = opts ? `<datalist id="${tableId}Opts">${opts.map(o => `<option value="${o}">`).join('')}</datalist>` : '';
      tr.innerHTML = `
        <td><input type="text" name="${tableId}_item" placeholder="항목" style="width:100%;border:none;outline:none" ${opts ? `list="${tableId}Opts"` : ''}>${optHtml}</td>
        <td><input type="text" name="${tableId}_cost" inputmode="numeric" placeholder="0" style="width:100%;border:none;outline:none;text-align:right"></td>
        <td><button type="button" class="btn-icon btn-icon-del" onclick="this.closest('tr').remove();document.dispatchEvent(new Event('maint-calc'))"><i class="ph ph-trash"></i></button></td>
      `;
      tbody.appendChild(tr);
      tr.querySelector('input').focus();
      // 금액 콤마 + 합계 계산
      tr.querySelectorAll('[name$="_cost"]').forEach(inp => {
        inp.addEventListener('input', () => {
          const d = inp.value.replace(/[^\d]/g, '');
          inp.value = d ? Number(d).toLocaleString() : '';
          document.dispatchEvent(new Event('maint-calc'));
        });
      });
    };
    host.querySelector('#addPartsRow')?.addEventListener('click', () => addRow('partsTable', partsOpts));
    host.querySelector('#addFixRow')?.addEventListener('click', () => addRow('fixTable'));
    // 기본 1행 추가
    addRow('partsTable', partsOpts);

    // 합계 자동 계산
    document.addEventListener('maint-calc', () => {
      let total = 0;
      host.querySelectorAll('[name$="_cost"]').forEach(inp => {
        total += Number(String(inp.value).replace(/,/g, '')) || 0;
      });
      const totalEl = host.querySelector('#maintTotal');
      if (totalEl) totalEl.value = total ? total.toLocaleString() : '';
    });
  }

  // 세차: 행 추가
  if (currentType === 'wash') {
    const washOpts = ['외부세차','실내크리닝','광택','냄새제거','시트세정','코팅','기타'];
    const addWashRow = () => {
      const tbody = host.querySelector('#washTable tbody');
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input type="text" name="washTable_item" placeholder="항목" style="width:100%;border:none;outline:none" list="washOpts"><datalist id="washOpts">${washOpts.map(o => `<option value="${o}">`).join('')}</datalist></td>
        <td><input type="text" name="washTable_cost" inputmode="numeric" placeholder="0" style="width:100%;border:none;outline:none;text-align:right"></td>
        <td><button type="button" class="btn-icon btn-icon-del" onclick="this.closest('tr').remove();document.dispatchEvent(new Event('wash-calc'))"><i class="ph ph-trash"></i></button></td>`;
      tbody.appendChild(tr);
      tr.querySelector('input').focus();
      tr.querySelectorAll('[name$="_cost"]').forEach(inp => {
        inp.addEventListener('input', () => {
          const d = inp.value.replace(/[^\d]/g, '');
          inp.value = d ? Number(d).toLocaleString() : '';
          document.dispatchEvent(new Event('wash-calc'));
        });
      });
    };
    host.querySelector('#addWashRow')?.addEventListener('click', addWashRow);
    addWashRow();
    document.addEventListener('wash-calc', () => {
      let total = 0;
      host.querySelectorAll('#washTable [name$="_cost"]').forEach(inp => {
        total += Number(String(inp.value).replace(/,/g, '')) || 0;
      });
      const el = host.querySelector('#washTotal');
      if (el) el.value = total ? total.toLocaleString() : '';
    });
  }

  // 사고수리: 행 추가
  if (currentType === 'repair') {
    const repairOpts = ['판금','도색','판금+도색','부품교체','범퍼','유리교체','도어','펜더','후드','트렁크','기타'];
    const addRepairRow = () => {
      const tbody = host.querySelector('#repairTable tbody');
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input type="text" name="repairTable_item" placeholder="수리항목" style="width:100%;border:none;outline:none" list="repairOpts"><datalist id="repairOpts">${repairOpts.map(o => `<option value="${o}">`).join('')}</datalist></td>
        <td><input type="text" name="repairTable_cost" inputmode="numeric" placeholder="0" style="width:100%;border:none;outline:none;text-align:right"></td>
        <td><button type="button" class="btn-icon btn-icon-del" onclick="this.closest('tr').remove();document.dispatchEvent(new Event('repair-calc'))"><i class="ph ph-trash"></i></button></td>`;
      tbody.appendChild(tr);
      tr.querySelector('input').focus();
      tr.querySelectorAll('[name$="_cost"]').forEach(inp => {
        inp.addEventListener('input', () => {
          const d = inp.value.replace(/[^\d]/g, '');
          inp.value = d ? Number(d).toLocaleString() : '';
          document.dispatchEvent(new Event('repair-calc'));
        });
      });
    };
    host.querySelector('#addRepairRow')?.addEventListener('click', addRepairRow);
    addRepairRow();
    document.addEventListener('repair-calc', () => {
      let total = 0;
      host.querySelectorAll('#repairTable [name$="_cost"]').forEach(inp => {
        total += Number(String(inp.value).replace(/,/g, '')) || 0;
      });
      const el = host.querySelector('#repairTotal');
      if (el) el.value = total ? total.toLocaleString() : '';
    });
  }

  // 상품화: 5개 섹션별 행 추가
  if (currentType === 'product') {
    const PROD_OPTS = {
      prodAccessory: ['블랙박스','전면썬팅','후면썬팅','측면썬팅','하이패스','내비게이션','매트','방향제','충전케이블','기타'],
      prodWash: ['외부세차','실내크리닝','광택','냄새제거','시트세정','코팅','기타'],
      prodBody: ['판금','도색','범퍼','펜더','도어','유리','후드','트렁크','기타'],
      prodParts: ['엔진오일','미션오일','에어필터','에어컨필터','와이퍼','배터리','타이어','브레이크패드','냉각수','기타'],
      prodFix: ['에어컨','히터','전기장치','시동','잠금장치','오디오','계기판','누유/누수','기타'],
    };
    const addProdRow = (tableId) => {
      const tbody = host.querySelector(`#${tableId} tbody`);
      const opts = PROD_OPTS[tableId] || [];
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input type="text" name="${tableId}_item" placeholder="항목" style="width:100%;border:none;outline:none" list="${tableId}Opts"><datalist id="${tableId}Opts">${opts.map(o => `<option value="${o}">`).join('')}</datalist></td>
        <td><input type="text" name="${tableId}_vendor" placeholder="업체" style="width:100%;border:none;outline:none" list="opVendorList"></td>
        <td><input type="text" name="${tableId}_cost" inputmode="numeric" placeholder="0" style="width:100%;border:none;outline:none;text-align:right"></td>
        <td><button type="button" class="btn-icon btn-icon-del" onclick="this.closest('tr').remove();document.dispatchEvent(new Event('product-calc'))"><i class="ph ph-trash"></i></button></td>`;
      tbody.appendChild(tr);
      tr.querySelector('input').focus();
      tr.querySelectorAll('[name$="_cost"]').forEach(inp => {
        inp.addEventListener('input', () => {
          const d = inp.value.replace(/[^\d]/g, '');
          inp.value = d ? Number(d).toLocaleString() : '';
          document.dispatchEvent(new Event('product-calc'));
        });
      });
    };
    host.querySelectorAll('.prod-add').forEach(btn => {
      btn.addEventListener('click', () => addProdRow(btn.dataset.table));
    });
    document.addEventListener('product-calc', () => {
      let total = 0;
      host.querySelectorAll('.prod-table [name$="_cost"]').forEach(inp => {
        total += Number(String(inp.value).replace(/,/g, '')) || 0;
      });
      const el = host.querySelector('#productTotal');
      if (el) el.value = total ? total.toLocaleString() : '';
    });
  }

  // 키관리: 메인키 기본 체크
  if (currentType === 'key') {
    const mainKey = host.querySelector('[name="key_main"]');
    if (mainKey) mainKey.checked = true;
  }

  // 최근 차량 바로 선택
  const recentCars = loadRecent();
  if (recentCars.length) {
    const recentHtml = `<div style="margin-bottom:8px;display:flex;gap:4px;flex-wrap:wrap;align-items:center">
      <span style="font-size:var(--font-size-xs);color:var(--c-text-muted)">최근:</span>
      ${recentCars.map(c => {
        const a = assets.find(x => x.car_number === c);
        return `<span class="btn-opt recent-car" data-car="${c}" style="font-size:var(--font-size-xs)">${c}${a ? ' ' + (a.car_model || '') : ''}</span>`;
      }).join('')}
    </div>`;
    host.querySelector('.form-section')?.insertAdjacentHTML('afterbegin', recentHtml);
    host.querySelectorAll('.recent-car').forEach(btn => {
      btn.addEventListener('click', () => {
        const inp = host.querySelector('[name="car_number"]');
        if (inp) { inp.value = btn.dataset.car; inp.dispatchEvent(new Event('input')); }
      });
    });
  }

  // 차량번호 — 숫자/부분 검색 자동완성
  const carInput = host.querySelector('[name="car_number"]');
  if (carInput) {
    carInput.removeAttribute('list'); // 기본 datalist 제거
    let sugBox = document.createElement('div');
    sugBox.className = 'car-suggest';
    sugBox.hidden = true;
    let _justSelected = false;
    carInput.parentNode.style.position = 'relative';
    carInput.parentNode.appendChild(sugBox);

    const showSuggestions = () => {
      if (_justSelected) { _justSelected = false; return; }
      const q = carInput.value.trim();
      if (!q) { sugBox.hidden = true; return; }
      // 정확히 일치하면 드롭다운 안띄움
      if (assets.some(a => a.car_number === q)) { sugBox.hidden = true; return; }
      const ql = q.toLowerCase();
      const matches = assets.filter(a => {
        const cn = (a.car_number || '').toLowerCase();
        return cn.includes(ql);
      }).slice(0, 8);
      if (!matches.length) { sugBox.hidden = true; return; }
      sugBox.hidden = false;
      sugBox.innerHTML = matches.map(a => {
        const c = contracts.find(x => x.car_number === a.car_number);
        const sub = [a.car_model, a.detail_model, c?.contractor_name].filter(Boolean).join(' · ');
        const hl = (a.car_number || '').replace(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi'), '<mark>$1</mark>');
        return `<div class="car-suggest-item" data-val="${a.car_number}"><span class="car-suggest-num">${hl}</span><span class="car-suggest-sub">${sub}</span></div>`;
      }).join('');
      sugBox.querySelectorAll('.car-suggest-item').forEach(el => {
        el.addEventListener('mousedown', e => e.preventDefault());
        el.addEventListener('click', () => {
          _justSelected = true;
          carInput.value = el.dataset.val;
          sugBox.hidden = true;
          carInput.dispatchEvent(new Event('input'));
          carInput.dispatchEvent(new Event('change'));
        });
      });
    };
    carInput.addEventListener('input', showSuggestions);
    carInput.addEventListener('focus', showSuggestions);
    carInput.addEventListener('blur', () => setTimeout(() => { sugBox.hidden = true; }, 150));
  }
  if (lastCarNumber && carInput) { carInput.value = lastCarNumber; carInput.dispatchEvent(new Event('input')); }

  // 제목 자동완성 (이전 입력 기반)
  const titleInput = host.querySelector('[name="title"]');
  if (titleInput && currentType) {
    const titles = loadTitles(currentType);
    if (titles.length) {
      const dl = document.createElement('datalist');
      dl.id = 'opTitleList';
      dl.innerHTML = titles.map(t => `<option value="${t}">`).join('');
      titleInput.setAttribute('list', 'opTitleList');
      titleInput.parentNode.appendChild(dl);
    }
  }

  // 담당자는 로그인 정보로 자동 저장 (별도 UI 없음)

  // 사진 드래그앤드롭 + 클릭 → 여러 장 미리보기
  const photoDrop = host.querySelector('#photoDrop');
  const photoFile = host.querySelector('#photoFile');
  const photoGrid = host.querySelector('#photoGrid');
  if (photoDrop && photoFile && photoGrid) {
    const addPhotos = (files) => {
      Array.from(files).forEach(file => {
        if (!file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (e) => {
          const slot = document.createElement('div');
          slot.className = 'photo-slot has-photo';
          slot.innerHTML = `<img src="${e.target.result}"><button type="button" class="photo-slot__del"><i class="ph ph-trash"></i></button>`;
          slot.querySelector('.photo-slot__del').addEventListener('click', () => slot.remove());
          photoGrid.appendChild(slot);
        };
        reader.readAsDataURL(file);
      });
    };
    photoDrop.addEventListener('click', () => photoFile.click());
    photoFile.addEventListener('change', () => addPhotos(photoFile.files));
    photoDrop.addEventListener('dragover', (e) => { e.preventDefault(); photoDrop.style.background = 'var(--c-bg-hover)'; });
    photoDrop.addEventListener('dragleave', () => { photoDrop.style.background = ''; });
    photoDrop.addEventListener('drop', (e) => {
      e.preventDefault();
      photoDrop.style.background = '';
      addPhotos(e.dataTransfer.files);
    });
  }

  // btn-toggle (복수 선택) 바인딩
  host.querySelectorAll('.btn-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('is-on');
      btn.dataset.val = btn.classList.contains('is-on') ? 'Y' : '';
    });
  });

  // 보험사 즐겨찾기 pill — insurance_company / other_insurance 아래
  const renderInsFavs = () => {
    const insFavs = loadInsCo();
    host.querySelectorAll('.ins-favs').forEach(el => el.remove());
    host.querySelectorAll('input[name="insurance_company"],input[name="other_insurance"]').forEach(inp => {
      const wrap = document.createElement('div');
      wrap.className = 'loc-favs ins-favs';
      wrap.style.marginTop = '4px';
      wrap.innerHTML = insFavs.map(x =>
        `<span class="loc-fav-btn" data-v="${x}">${x}<button type="button" class="loc-fav-del" data-v="${x}">✕</button></span>`
      ).join('');
      inp.parentNode.appendChild(wrap);
      wrap.querySelectorAll('.loc-fav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          if (e.target.classList.contains('loc-fav-del')) return;
          inp.value = btn.dataset.v;
        });
      });
      wrap.querySelectorAll('.loc-fav-del').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const name = btn.dataset.v;
          const list = loadInsCo().filter(x => x !== name);
          localStorage.setItem(INS_KEY, JSON.stringify(list));
          renderInsFavs();
        });
      });
    });
  };
  renderInsFavs();

  // 새 보험사 등록 버튼
  host.querySelector('#iocAddInsCo')?.addEventListener('click', () => {
    const inp = host.querySelector('#iocNewInsCo');
    const v = (inp?.value || '').trim();
    if (!v) return;
    saveInsCo(v);
    inp.value = '';
    renderInsFavs();
  });
  host.querySelector('#iocNewInsCo')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); host.querySelector('#iocAddInsCo').click(); }
  });

  // 거래처 datalist — 모든 vendor/업체 input에
  const vendorDl = document.createElement('datalist');
  vendorDl.id = 'opVendorList';
  vendorDl.innerHTML = vendors.map(v => `<option value="${v.vendor_name}">${v.vendor_type || ''}</option>`).join('');
  host.appendChild(vendorDl);
  host.querySelectorAll('[name="vendor"],[name="wash_vendor"],[name="maint_vendor"],[name="repair_shop"]').forEach(inp => {
    if (!inp.getAttribute('list')) inp.setAttribute('list', 'opVendorList');
  });

  // 즐겨찾기 장소
  const vendorInput = host.querySelector('[name="vendor"]') || host.querySelector('[name="delivery_location"]') || host.querySelector('[name="return_location"]');
  if (vendorInput) {
    const favs = loadFavorites();
    if (favs.length) {
      const favHtml = `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:2px">
        ${favs.slice(0, 5).map(f => `<span class="btn-opt fav-place" data-place="${f}" style="font-size:var(--font-size-xs)">${f}</span>`).join('')}
      </div>`;
      vendorInput.parentNode.insertAdjacentHTML('beforeend', favHtml);
      vendorInput.parentNode.querySelectorAll('.fav-place').forEach(btn => {
        btn.addEventListener('click', () => { vendorInput.value = btn.dataset.place; });
      });
    }
  }

  // Enter = 저장
  host.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.target.matches('textarea')) {
      e.preventDefault();
      submitForm();
    }
  });

  // btn-group 클릭 바인딩 (단일선택 — 활성 재클릭시 해제)
  // btn-toggle(복수선택) 들어있는 그룹은 skip
  host.querySelectorAll('.btn-group').forEach(group => {
    if (group.querySelector('.btn-toggle')) return;
    const hidden = group.previousElementSibling;
    if (hidden && hidden.tagName === 'INPUT') {
      hidden.value = group.querySelector('.btn-opt.is-active')?.dataset.val || '';
    }
    group.querySelectorAll('.btn-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        const wasActive = opt.classList.contains('is-active');
        group.querySelectorAll('.btn-opt').forEach(o => o.classList.remove('is-active'));
        if (!wasActive) opt.classList.add('is-active');
        if (hidden && hidden.tagName === 'INPUT') {
          hidden.value = wasActive ? '' : opt.dataset.val;
        }
      });
    });
  });

  // 시동제어 — 조치구분 선택 시 사유 동적 변경
  if (currentType === 'ignition') {
    const IGNITION_REASONS = {
      '시동제어': ['미납', '연락두절', '계약위반', '기타'],
      '제어해제': ['납부완료', '분할합의', '기타'],
    };
    const REASON_TONE = {
      '미납': 'danger', '연락두절': 'warn', '계약위반': 'danger', '기타': '',
      '납부완료': 'success', '분할합의': 'success',
    };

    const actionGroup = host.querySelector('.btn-group[data-name="ignition_action"]');
    const reasonGroup = host.querySelector('#ignitionReasonGroup');
    const reasonHidden = host.querySelector('input[name="ignition_reason"]');

    function updateReasons(action) {
      const opts = IGNITION_REASONS[action] || [];
      reasonGroup.innerHTML = opts.map((o, i) =>
        `<span class="btn-opt${i === 0 ? ' is-active' : ''}" data-val="${o}"${REASON_TONE[o] ? ` data-tone="${REASON_TONE[o]}"` : ''}>${o}</span>`
      ).join('');
      if (reasonHidden) reasonHidden.value = opts[0] || '';
      // btn-group 클릭 바인딩
      reasonGroup.querySelectorAll('.btn-opt').forEach(opt => {
        opt.addEventListener('click', () => {
          reasonGroup.querySelectorAll('.btn-opt').forEach(o => o.classList.remove('is-active'));
          opt.classList.add('is-active');
          if (reasonHidden) reasonHidden.value = opt.dataset.val;
        });
      });
    }

    const initAction = actionGroup?.querySelector('.btn-opt.is-active')?.dataset.val || '시동제어';
    updateReasons(initAction);

    // 조치구분 변경 시 사유 갱신
    actionGroup?.querySelectorAll('.btn-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.classList.contains('is-active') ? btn.dataset.val : '';
        if (val) updateReasons(val);
      });
    });
  }

  // 금액 콤마 — 모든 금액 계열 필드에 천단위 자동 포맷
  const MONEY_NAMES = new Set([
    'amount', 'extra_mileage', 'extra_fuel', 'extra_damage',
    'repair_estimate', 'insurance_amount', 'self_pay',
    'deposit_amount', 'rent_amount', 'unpaid_amount', 'damage_claim',
    'maint_cost', 'fix_cost', 'wash_cost', 'fuel_amount',
  ]);
  host.querySelectorAll('input[inputmode="numeric"],input[name]').forEach(inp => {
    const n = inp.getAttribute('name') || '';
    if (!MONEY_NAMES.has(n) && !n.endsWith('_cost') && !n.endsWith('_amount') && !n.endsWith('Table_cost')) return;
    // 이미 바인딩 됐으면 skip
    if (inp.dataset._money) return;
    inp.dataset._money = '1';
    inp.addEventListener('input', () => {
      const d = inp.value.replace(/[^\d]/g, '');
      inp.value = d ? Number(d).toLocaleString() : '';
    });
    // 초기값도 포맷
    if (inp.value && /\d/.test(inp.value)) {
      const d = inp.value.replace(/[^\d]/g, '');
      inp.value = d ? Number(d).toLocaleString() : '';
    }
  });

  // 숫자만 (inputmode=numeric 인 input 전체에 한글/문자 방지)
  host.querySelectorAll('input[inputmode="numeric"]').forEach(inp => {
    inp.addEventListener('input', () => {
      const v = inp.value.replace(/[^\d.]/g, '');
      if (v !== inp.value) inp.value = v;
    });
  });

  // 차량번호 입력 → 우측 컨텍스트 패널 갱신
  const carCtx = host.querySelector('[name="car_number"]');
  if (carCtx) {
    carCtx.addEventListener('input', () => updateContextPanel(carCtx.value.trim()));
    carCtx.addEventListener('change', () => updateContextPanel(carCtx.value.trim()));
    if (carCtx.value.trim()) updateContextPanel(carCtx.value.trim());
  }

  host.querySelector('[name="car_number"]')?.focus();
}

// ── 우측 컨텍스트 패널 (계약이력 + 수납 + 운영이력) ─────
let _billings = [];
let _selectedContractCode = null;

function updateContextPanel(carNumber) {
  const panel = $('#opPanelContext');
  const host = $('#opContextHost');
  const sub = $('#opContextSubtitle');
  if (!panel || !host) return;

  if (!carNumber) {
    panel.hidden = false;
    host.innerHTML = `<div style="padding:24px;text-align:center;color:var(--c-text-muted)">차량번호 입력 시<br>계약/수납/운영이력이 여기 표시됩니다.</div>`;
    sub.textContent = '차량번호를 입력하세요';
    return;
  }
  panel.hidden = false;

  // 해당 차량의 자산 / 계약 / 이벤트
  const asset = assets.find(a => a.car_number === carNumber);
  const carContracts = contracts
    .filter(c => c.car_number === carNumber && c.status !== 'deleted')
    .sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''));
  const carEvents = allEvents
    .filter(e => e.car_number === carNumber && e.status !== 'deleted')
    .sort((a, b) => (b.date || b.created_at || '').toString().localeCompare((a.date || a.created_at || '').toString()));

  sub.textContent = `${carNumber}${asset ? ` · ${asset.manufacturer || ''} ${asset.car_model || ''}`.trim() : ' · 미등록 차량'}`;

  // 기본 선택: 최신 계약
  if (carContracts.length && !carContracts.some(c => c.contract_code === _selectedContractCode)) {
    _selectedContractCode = carContracts[0].contract_code;
  }
  if (!carContracts.length) _selectedContractCode = null;

  renderContextContent(asset, carContracts, carEvents);
}

function renderContextContent(asset, carContracts, carEvents) {
  const host = $('#opContextHost');

  // ── 계약 이력 리스트 ──
  const contractsHtml = carContracts.length
    ? carContracts.map(c => {
        const active = c.contract_code === _selectedContractCode;
        const isCurrent = !c.contract_status || c.contract_status === '계약진행' || c.contract_status === '계약완료';
        return `<div class="op-ctx-contract${active ? ' is-active' : ''}" data-code="${c.contract_code}" style="
          display:flex;align-items:center;gap:8px;
          padding:8px 10px;border:1px solid ${active ? 'var(--c-primary)' : 'var(--c-border)'};
          border-radius:var(--r-sm);cursor:pointer;margin-bottom:4px;
          background:${active ? 'var(--c-primary-bg)' : 'transparent'};
        ">
          <span style="color:${active ? 'var(--c-primary)' : 'var(--c-text-muted)'}">${active ? '●' : '○'}</span>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:var(--font-size-sm)">${c.contractor_name || '-'} <span style="color:var(--c-text-muted);font-weight:400">${c.contractor_phone || ''}</span></div>
            <div style="font-size:var(--font-size-xs);color:var(--c-text-muted)">${c.start_date || ''} ~ ${c.end_date || computeEndDate(c)} ${isCurrent ? '<span style="color:var(--c-success);font-weight:600">현재</span>' : ''}</div>
          </div>
        </div>`;
      }).join('')
    : `<div style="color:var(--c-text-muted);font-size:var(--font-size-sm);padding:4px">계약 이력 없음</div>`;

  // ── 선택된 계약 상세 ──
  const selected = carContracts.find(c => c.contract_code === _selectedContractCode);
  const contractDetail = selected ? renderContractDetail(selected) : '';

  // ── 운영이력 (최근 5건) ──
  const eventsHtml = carEvents.slice(0, 5).length
    ? carEvents.slice(0, 5).map((e, idx) => {
        const date = (e.date || '').slice(0, 10) || (e.created_at ? new Date(e.created_at).toISOString().slice(0, 10) : '');
        return `<div class="op-ctx-event" data-idx="${idx}" style="display:flex;align-items:center;gap:8px;padding:6px 8px;font-size:var(--font-size-sm);border-bottom:1px solid var(--c-border);cursor:pointer;transition:background var(--t-fast)">
          <span style="width:20px;text-align:center">${opIcon(e.type || e.event_type)}</span>
          <span style="color:var(--c-text-muted);font-size:var(--font-size-xs);width:70px;flex-shrink:0">${date}</span>
          <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.title || e.type || e.event_type || '-'}</span>
        </div>`;
      }).join('')
    : `<div style="color:var(--c-text-muted);font-size:var(--font-size-sm);padding:12px;text-align:center">이력 없음</div>`;

  host.innerHTML = `
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-clipboard-text"></i>계약 이력 <span style="color:var(--c-text-muted);font-weight:var(--fw)">(${carContracts.length})</span></div>
      ${contractsHtml}
    </div>
    ${contractDetail}
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-clock-counter-clockwise"></i>최근 운영이력 <span style="color:var(--c-text-muted);font-weight:var(--fw)">${carEvents.length > 5 ? `(최근 5건 / 총 ${carEvents.length})` : `(${carEvents.length})`}</span></div>
      ${eventsHtml}
    </div>
  `;

  // 계약 클릭 → 선택 변경
  host.querySelectorAll('.op-ctx-contract').forEach(el => {
    el.addEventListener('click', () => {
      _selectedContractCode = el.dataset.code;
      renderContextContent(asset, carContracts, carEvents);
    });
  });

  // 운영이력 클릭 → 상세 팝업
  host.querySelectorAll('.op-ctx-event').forEach(el => {
    el.addEventListener('hover', () => { el.style.background = 'var(--c-bg-hover)'; });
    el.addEventListener('click', () => {
      const e = carEvents[Number(el.dataset.idx)];
      if (!e) return;
      const entries = Object.entries(e).filter(([k, v]) => !k.startsWith('_') && v !== '' && v !== null && v !== undefined && k !== 'status' && k !== 'created_at' && k !== 'updated_at');
      openDetail({
        title: `${e.title || e.event_type || '이력'}`,
        subtitle: `${e.car_number || ''} · ${(e.date || '').slice(0, 10)}`,
        sections: [{
          title: '상세',
          fields: entries.map(([k, v]) => ({ label: k, value: String(v) })),
        }],
      });
    });
  });
}

function renderContractDetail(c) {
  const start = c.start_date || '-';
  const end = c.end_date || computeEndDate(c) || '-';
  const rent = Number(c.rent_amount || 0).toLocaleString();
  const deposit = Number(c.deposit_amount || 0).toLocaleString();

  // 미납 계산
  const contractBillings = _billings.filter(b => b.contract_code === c.contract_code);
  const unpaid = contractBillings.filter(b => (Number(b.paid_total) || 0) < (Number(b.amount) || 0));
  const unpaidTotal = unpaid.reduce((s, b) => s + ((Number(b.amount) || 0) - (Number(b.paid_total) || 0)), 0);
  const paidTotal = contractBillings.reduce((s, b) => s + (Number(b.paid_total) || 0), 0);

  // D-day
  const today = new Date().toISOString().slice(0, 10);
  const dDay = end !== '-' ? Math.ceil((new Date(end) - new Date(today)) / 86400000) : null;

  return `
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-file-text"></i>${c.contractor_name || '계약'} 계약 상세</div>
      <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:var(--font-size-sm);padding:4px 8px">
        <div style="color:var(--c-text-muted)">계약코드</div><div style="font-family:monospace">${c.contract_code || '-'}</div>
        <div style="color:var(--c-text-muted)">연락처</div><div>${c.contractor_phone || '-'}</div>
        <div style="color:var(--c-text-muted)">계약기간</div><div>${start} ~ ${end} ${dDay !== null ? (dDay < 0 ? `<span style="color:var(--c-danger)">(${Math.abs(dDay)}일 초과)</span>` : `<span style="color:var(--c-text-muted)">(D-${dDay})</span>`) : ''}</div>
        <div style="color:var(--c-text-muted)">월대여료</div><div>${rent}원</div>
        <div style="color:var(--c-text-muted)">보증금</div><div>${deposit}원</div>
        <div style="color:var(--c-text-muted)">결제일</div><div>매월 ${c.auto_debit_day || '-'}일</div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-wallet"></i>수납 내역</div>
      <div style="padding:4px 8px;font-size:var(--font-size-sm);line-height:1.8">
        <div>완납 <b style="color:var(--c-success)">${paidTotal.toLocaleString()}원</b> / 회차 ${contractBillings.length}건</div>
        ${unpaid.length ? `<div style="color:var(--c-danger);font-weight:600"><i class="ph ph-warning-circle" style="font-size:var(--icon-sm)"></i> 미납 ${unpaidTotal.toLocaleString()}원 (${unpaid.length}회차)</div>` : `<div style="color:var(--c-success)"><i class="ph ph-check-circle" style="font-size:var(--icon-sm)"></i> 미납 없음</div>`}
        ${unpaid.slice(0, 3).map(b => `<div style="font-size:var(--font-size-xs);color:var(--c-text-muted);padding-left:14px">· ${b.seq || '-'}회차 ${b.due_date || ''} — ${Number(b.amount || 0).toLocaleString()}원</div>`).join('')}
      </div>
    </div>
  `;
}

function computeEndDate(c) {
  if (!c.start_date || !c.rent_months) return '';
  const d = new Date(c.start_date);
  if (isNaN(d)) return '';
  d.setMonth(d.getMonth() + Number(c.rent_months));
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function resetForm() {
  if (!currentType) return;
  renderForm();
}

async function submitForm() {
  if (!currentType) { showToast('유형을 선택하세요', 'error'); return; }
  const t = TYPES.find(x => x.key === currentType);
  const host = $('#opFormHost');
  const data = {};
  host.querySelectorAll('[name]').forEach(el => { data[el.name] = el.value.trim(); });

  // 정비: 행 데이터 수집 → title 자동 생성
  if (currentType === 'maint') {
    const partsRows = [];
    host.querySelectorAll('#partsTable tbody tr').forEach(tr => {
      const item = tr.querySelector('[name="partsTable_item"]')?.value.trim();
      const cost = Number(String(tr.querySelector('[name="partsTable_cost"]')?.value || '').replace(/,/g, '')) || 0;
      if (item) partsRows.push({ item, cost });
    });
    const fixRows = [];
    host.querySelectorAll('#fixTable tbody tr').forEach(tr => {
      const item = tr.querySelector('[name="fixTable_item"]')?.value.trim();
      const cost = Number(String(tr.querySelector('[name="fixTable_cost"]')?.value || '').replace(/,/g, '')) || 0;
      if (item) fixRows.push({ item, cost });
    });
    if (partsRows.length) data.parts_list = partsRows;
    if (fixRows.length) data.fix_list = fixRows;
    if (!data.title) {
      const names = [...partsRows.map(r => r.item), ...fixRows.map(r => r.item)];
      data.title = names.length ? names.join(', ') : '';
    }
    data.parts_items = partsRows.map(r => r.item).join(', ');
  }
  // 사고수리: 행 수집
  if (currentType === 'repair') {
    const rows = [];
    host.querySelectorAll('#repairTable tbody tr').forEach(tr => {
      const item = tr.querySelector('[name="repairTable_item"]')?.value.trim();
      const cost = Number(String(tr.querySelector('[name="repairTable_cost"]')?.value || '').replace(/,/g, '')) || 0;
      if (item) rows.push({ item, cost });
    });
    if (rows.length) data.repair_list = rows;
  }
  // 상품화: 섹션별 행 수집
  if (currentType === 'product') {
    const sections = {};
    ['prodAccessory','prodWash','prodBody','prodParts','prodFix'].forEach(tableId => {
      const rows = [];
      host.querySelectorAll(`#${tableId} tbody tr`).forEach(tr => {
        const item = tr.querySelector(`[name="${tableId}_item"]`)?.value.trim();
        const vendor = tr.querySelector(`[name="${tableId}_vendor"]`)?.value.trim();
        const cost = Number(String(tr.querySelector(`[name="${tableId}_cost"]`)?.value || '').replace(/,/g, '')) || 0;
        if (item) rows.push({ item, vendor, cost });
      });
      if (rows.length) sections[tableId] = rows;
    });
    data.product_sections = sections;
    const allItems = Object.values(sections).flat();
    if (!data.title && allItems.length) data.title = allItems.map(r => r.item).join(', ');
  }
  // 세차: 행 수집
  if (currentType === 'wash') {
    const rows = [];
    host.querySelectorAll('#washTable tbody tr').forEach(tr => {
      const item = tr.querySelector('[name="washTable_item"]')?.value.trim();
      const cost = Number(String(tr.querySelector('[name="washTable_cost"]')?.value || '').replace(/,/g, '')) || 0;
      if (item) rows.push({ item, cost });
    });
    if (rows.length) data.wash_list = rows;
    if (!data.title) data.title = rows.map(r => r.item).join(', ');
  }

  // btn-toggle 값 수집
  host.querySelectorAll('.btn-toggle.is-on').forEach(btn => {
    data[btn.dataset.name] = 'Y';
  });

  if (!data.date || !data.car_number) {
    showToast('일자, 차량번호는 필수입니다', 'error');
    return;
  }
  // 입출고센터: 제목 자동생성 + 사진 업로드 → event photos
  if (currentType === 'ioc') {
    const kind = data.ioc_kind || '입출고';
    const files = iocUploader ? iocUploader.getFiles() : [];
    if (!data.title) data.title = `${kind}${files.length ? ` (${files.length}장)` : ''}`;
    const KIND_MAP = {
      '정상출고': { type: 'delivery', direction: 'out' },
      '정상반납': { type: 'return',   direction: 'in'  },
      '강제회수': { type: 'force',    direction: 'in'  },
      '차량이동': { type: 'transfer', direction: 'out' },
    };
    const m = KIND_MAP[kind] || KIND_MAP['정상출고'];

    // 정상출고 — 보험증권 필수 + 검증 통과 필요
    if (kind === '정상출고') {
      const certFiles = iocInsCertUploader ? iocInsCertUploader.getFiles() : [];
      if (!certFiles.length) {
        showToast('정상출고는 보험증권 업로드가 필수입니다', 'error');
        return;
      }
      if (!_iocInsCertVerified) {
        showToast('보험증권 검증 실패 — 차량번호·날짜 확인 필요', 'error');
        return;
      }
      // 증권 업로드
      try {
        const certUploaded = await uploadFilesToStorage(certFiles, { type: 'ins_cert', car: data.car_number });
        data.insurance_cert = certUploaded;
      } catch (e) {
        showToast('보험증권 업로드 실패: ' + (e.message || e), 'error');
        return;
      }
    }

    currentType = m.type;
    t.direction = m.direction;
    if (files.length) {
      try {
        data.photos = await uploadFilesToStorage(files, { type: m.type, car: data.car_number });
      } catch (e) {
        console.error('[ioc upload]', e);
        showToast('사진 업로드 실패: ' + (e.message || e), 'error');
        return;
      }
    }
  }

  // 차량케어 (정비/수리/상품화/세차): 제목 자동생성 + 첨부파일 업로드
  if (['maint', 'repair', 'product', 'wash'].includes(currentType)) {
    if (!data.title) {
      const LABEL = { maint: '정비', repair: '사고수리', product: '상품화', wash: '세차' };
      data.title = LABEL[currentType] || '차량케어';
    }
    const files = iocUploader ? iocUploader.getFiles() : [];
    // 사고수리: 견적서 필수
    if (currentType === 'repair' && !files.length) {
      showToast('사고수리는 견적서 첨부가 필수입니다', 'error');
      return;
    }
    if (files.length) {
      try {
        data.photos = await uploadFilesToStorage(files, { type: currentType, car: data.car_number });
      } catch (e) {
        console.error('[pc upload]', e);
        showToast('첨부파일 업로드 실패: ' + (e.message || e), 'error');
        return;
      }
    }
  }

  // 고객센터: 유형에서 제목 자동생성 + 첨부파일 업로드
  if (currentType === 'contact') {
    if (!data.title) data.title = data.contact_type || '고객응대';
    const files = iocUploader ? iocUploader.getFiles() : [];
    if (files.length) {
      try {
        data.photos = await uploadFilesToStorage(files, { type: 'contact', car: data.car_number });
      } catch (e) {
        console.error('[contact upload]', e);
        showToast('첨부파일 업로드 실패: ' + (e.message || e), 'error');
        return;
      }
    }
  }

  // 제목이 없으면 자동 생성 — 유형별 기본 라벨
  if (!data.title) {
    const labelMap = {
      contact: data.contact_type || '고객응대',
      delivery: '출고', return: '반납', force: '강제회수', transfer: '차량이동',
      maint: data.maint_type || '정비',
      repair: data.damage_area ? `사고수리 — ${data.damage_area}` : '사고수리',
      product: '상품화',
      wash: data.wash_type || '세차',
      key: (data.key_action || '차키') + ' 업무',
      penalty: data.penalty_type || '과태료',
      collect: '미수 조치', insurance: data.insurance_action || '보험업무',
      ignition: `시동${data.ignition_action === '제어해제' ? ' 해제' : '제어'} — ${data.ignition_reason || ''}`,
      fuel: data.fuel_type || '연료보충',
    };
    data.title = labelMap[currentType] || currentType;
  }

  const a = assets.find(x => x.car_number === data.car_number);
  try {
    const event = {
      type: currentType,
      direction: t.direction,
      date: data.date,
      car_number: data.car_number,
      vin: a?.vin || '',
      title: data.title,
      vendor: data.vendor || '',
      amount: Number(String(data.amount || '').replace(/,/g, '')) || 0,
      note: data.note || '',
    };
    // 유형별 추가 필드 전부 저장
    const extras = [
      'maint_type', 'next_maint_date',
      'accident_type', 'accident_other', 'accident_other_phone', 'other_insurance_no', 'other_insurance_contact', 'insurance_contact', 'fault_ratio',
      'insurance_company', 'insurance_no', 'repair_estimate', 'repair_shop', 'repair_days', 'rental_car',
      'penalty_type', 'due_date', 'payer', 'paid_status',
      'delivery_location', 'receiver_name', 'receiver_phone',
      'return_location', 'car_condition', 'wash_status', 'next_plan',
      'exterior', 'interior',
      'mileage', 'fuel_level',
      'key_main_count', 'key_sub_count', 'key_card_count',
      'check_contract', 'check_license', 'check_insurance',
      'equip_navi', 'equip_blackbox', 'equip_hipass', 'equip_charger', 'equip_triangle', 'equip_fire',
      'extra_mileage', 'extra_fuel', 'extra_damage',
      'from_location', 'to_location', 'transfer_reason',
      'handover_by', 'carrier_name', 'carrier_phone', 'key_returned', 'driver_age',
      'insurance_cert',
      'wash_type', 'wash_cost', 'wash_vendor', 'inspect_type', 'tire_status', 'light_status',
      'fuel_type', 'fuel_amount',
      'acc_type', 'acc_role',
      'acc_single', 'acc_both', 'acc_offender', 'acc_victim',
      'fault_pct_etc',
      'ins_car', 'ins_property', 'ins_person', 'ins_self', 'ins_uninsured',
      'fault_pct', 'other_insurance', 'accident_status',
      'insurance_action', 'age_before', 'age_after',
      'insurance_type', 'insurance_start', 'insurance_end',
      'check_gps', 'check_insurance_age', 'check_payment',
      'parts_items', 'next_maint_km', 'fix_detail', 'fix_cost', 'symptom',
      'product_status', 'product_maint', 'maint_detail', 'maint_cost', 'maint_vendor', 'expected_delivery',
      'repair_type', 'repair_in_date', 'repair_out_date', 'repair_estimate', 'insurance_amount', 'self_pay', 'repair_status',
      'damage_area', 'damage_frame',
      'maint_status', 'wash_work_status', 'work_status',
      'collect_action', 'collect_result', 'promise_date',
      'force_reason', 'unpaid_amount', 'damage_claim', 'legal_action',
      'assignee', 'participants',
      'key_action', 'key_type', 'key_info',
      'ignition_action', 'ignition_reason',
      'customer_name', 'customer_phone', 'contact_type', 'contact_result', 'handler',
    ];
    extras.forEach(k => { if (data[k]) event[k] = data[k]; });
    // 입출고센터 사진
    if (Array.isArray(data.photos) && data.photos.length) event.photos = data.photos;
    await saveEvent(event);

    // 강제회수 + 차키 미회수 → 자산 차키 수량 -1
    if (event.type === 'force' && !data.key_returned && data.car_number) {
      try {
        const a = assets.find(x => x.car_number === data.car_number);
        if (a?.vin) {
          const { updateAsset } = await import('../firebase/assets.js');
          const cur = Number(a.key_count || 0);
          const newCount = Math.max(0, cur - 1);
          const prevNote = a.key_note || '';
          const stamp = data.date || new Date().toISOString().slice(0, 10);
          const noteAdd = `${stamp} 강제회수 미회수 (-1 → ${newCount})`;
          await updateAsset(a.vin, {
            key_count: newCount,
            key_note: prevNote ? `${prevNote}\n${noteAdd}` : noteAdd,
          });
          showToast(`차키 -1 자동 차감 (현재 ${newCount}개)`, 'info');
        }
      } catch (e) { console.warn('[key decrement]', e); }
    }

    // 시동제어 → 계약 action_status 자동 반영
    if (event.type === 'ignition' && data.ignition_action && data.car_number) {
      try {
        const { updateContract } = await import('../firebase/contracts.js');
        const active = contracts.find(c =>
          c.car_number === data.car_number && c.status !== 'deleted' &&
          (!c.contract_status || c.contract_status === '계약진행')
        );
        if (active?.contract_code) {
          await updateContract(active.contract_code, { action_status: data.ignition_action });
          showToast(`계약 조치상태 → ${data.ignition_action}`, 'info');
        }
      } catch (e) { console.warn('[ignition status]', e); }
    }

    showToast('등록 완료', 'success');
    // 학습: 최근 차량 / 제목 / 즐겨찾기
    if (data.car_number) saveRecent(data.car_number);
    if (data.title) saveTitle(currentType, data.title);
    if (data.vendor) saveFavorite(data.vendor);
    if (data.delivery_location) saveFavorite(data.delivery_location);
    if (data.return_location) saveFavorite(data.return_location);
    if (data.from_location) { saveLocation(data.from_location); localStorage.setItem(LAST_FROM_KEY, data.from_location); }
    if (data.to_location) saveLocation(data.to_location);
    if (data.insurance_company) saveInsCo(data.insurance_company);
    if (data.other_insurance) saveInsCo(data.other_insurance);
    // 연속 입력: 차량번호 유지
    lastCarNumber = data.car_number || '';
    renderForm();
  } catch (err) { showToast(err.message, 'error'); }
}

export async function mount() {
  watchAssets((items) => { assets = items; });
  watchContracts((items) => { contracts = items; });
  watchEvents((items) => { allEvents = items; });
  watchBillings((items) => { _billings = items; });
  watchVendors((items) => { vendors = items; });
  renderList();
  // 초기 상태: 업무 미선택 → 버튼 숨김 (HTML에서 hidden 기본)
  _reset?.addEventListener('click', resetForm);
  _submit?.addEventListener('click', submitForm);
}

// ─────────────────────────────────────────────────────────
// 과태료처리 모드 (OCR 업로드 + 매칭 + 일괄 다운로드)
// ─────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────
// 차량케어센터 — 기본정보 고정 + 세부 폼만 교체
// ─────────────────────────────────────────────────────────

function renderPcMode(host, today, carList, sel) {
  const KIND_MAP = { '정비': 'maint', '사고수리': 'repair', '상품화': 'product', '세차': 'wash' };
  const KIND_MAP_REV = { maint: '정비', repair: '사고수리', product: '상품화', wash: '세차' };
  const subType = KIND_MAP_REV[currentType] || '정비';
  const lastFrom = localStorage.getItem(LAST_FROM_KEY) || '';
  const locOpts = [...new Set([...loadLocations(), ...loadFavorites()])].map(l => `<option value="${l}">`).join('');
  const vList = vendors.map(v => `<option value="${v.vendor_name}">`).join('');

  // 타이틀 = 차량케어센터 고정
  const pcType = TYPES.find(x => x.key === 'pc');
  const ft = $('#opFormTitle');
  if (ft && pcType) ft.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px">${opIcon('pc')}<span>${pcType.label}</span></span>`;
  const sub = $('#opFormSubtitle');
  if (sub && pcType) sub.textContent = pcType.sub || '';

  // 차량 조회 패널
  const carInfoPanel = `
    <div id="iocCarInfo" class="ioc-car-info" hidden style="margin:0 var(--sp-5) var(--sp-3)">
      <div class="ioc-car-col">
        <div class="ioc-car-col-title"><i class="ph ph-car"></i>차량 스펙</div>
        <div class="ioc-car-row"><span class="k">회사명</span><span class="v" data-f="company">—</span></div>
        <div class="ioc-car-row"><span class="k">차량번호</span><span class="v" data-f="car">—</span></div>
        <div class="ioc-car-row"><span class="k">세부모델</span><span class="v" data-f="model">—</span></div>
        <div class="ioc-car-row"><span class="k">보험연령</span><span class="v" data-f="insAge">—</span></div>
      </div>
      <div class="ioc-car-col">
        <div class="ioc-car-col-title"><i class="ph ph-clipboard-text"></i>계약 / 상태</div>
        <div class="ioc-car-row"><span class="k">계약자</span><span class="v" data-f="contractor">—</span></div>
        <div class="ioc-car-row"><span class="k">연락처</span><span class="v" data-f="phone">—</span></div>
        <div class="ioc-car-row"><span class="k">계약상태</span><span class="v" data-f="carStatus">—</span></div>
        <div class="ioc-car-row"><span class="k">미납여부</span><span class="v" data-f="unpaidYn">—</span></div>
      </div>
    </div>`;

  // 기본정보 (고정 — 작업구분 변경해도 유지)
  const baseHtml = `
  <div class="form-section" id="pcBaseInfo">
    <div class="form-section-title">기본정보</div>
    <div class="form-grid">
      <div class="field is-required"><label>일자</label><input type="date" name="date" value="${today}"></div>
      <div class="field is-required"><label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
    </div>
    <div style="margin-top:12px;display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end">
      ${sel('pc_kind', '작업구분', ['정비','사고수리','상품화','세차'])}
      ${sel('work_status', '작업상태', ['접수','진행중','완료'])}
    </div>
    <div class="form-grid" style="margin-top:12px">
      <div class="field"><label>출발지</label><input type="text" name="from_location" list="pcLocList" value="${lastFrom}" placeholder="출발 위치"><datalist id="pcLocList">${locOpts}</datalist></div>
      <div class="field"><label>도착지(입고처)</label><input type="text" name="vendor" list="pcVendorList" placeholder="정비소 · 도색업체"><datalist id="pcVendorList">${vList}</datalist></div>
    </div>
  </div>`;

  host.innerHTML = carInfoPanel + baseHtml + `<div id="pcDetailHost"></div>`;

  // 작업구분 기본 선택 맞추기
  const pcKindGroup = host.querySelector('.btn-group[data-name="pc_kind"]');
  pcKindGroup?.querySelectorAll('.btn-opt').forEach(o => {
    o.classList.toggle('is-active', o.dataset.val === subType);
  });
  const pcKindHidden = host.querySelector('input[name="pc_kind"]');
  if (pcKindHidden) pcKindHidden.value = subType;

  // 세부 폼 초기 렌더
  _pcActive = true;
  if (currentType === 'pc') currentType = KIND_MAP[subType] || 'maint';
  renderPcDetail();

  // 작업구분 전환 — 버튼 활성화 + 세부 폼 교체 (기본정보 유지)
  pcKindGroup?.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-opt'); if (!btn) return;
    const t = KIND_MAP[btn.dataset.val]; if (!t) return;
    pcKindGroup.querySelectorAll('.btn-opt').forEach(o => o.classList.remove('is-active'));
    btn.classList.add('is-active');
    if (pcKindHidden) pcKindHidden.value = btn.dataset.val;
    currentType = t;
    renderPcDetail();
  });

  // 작업상태 btn-group 바인딩
  const wsGroup = host.querySelector('.btn-group[data-name="work_status"]');
  const wsHidden = host.querySelector('input[name="work_status"]');
  wsGroup?.querySelectorAll('.btn-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      wsGroup.querySelectorAll('.btn-opt').forEach(o => o.classList.remove('is-active'));
      opt.classList.add('is-active');
      if (wsHidden) wsHidden.value = opt.dataset.val;
    });
  });
}

function renderPcDetail() {
  const detailHost = document.getElementById('pcDetailHost');
  if (!detailHost) return;

  const OPT_TONE = {
    '양호': 'success', '경미흠집': 'warn', '손상있음': 'warn', '심각손상': 'danger',
    '깨끗': 'success', '보통': 'warn', '청소필요': 'warn',
    // 정비유형
    '정기점검': 'info', '소모품교체': 'info', '수리': 'warn', '판금/도색': 'danger', '타이어': 'warn', '기타': '',
    // 세차유형
    '외부세차': 'info', '실내크리닝': 'info', '풀세차': 'success', '광택': 'success',
    '교체필요': 'warn', '편마모': 'warn',
    '없음': 'success', '경미': 'warn', '있음': 'danger',
    '미정': 'warn', '대차제공': 'info', '대차없음': 'success',
    '대차중': 'info', '미제공': 'warn', '대차반납': 'success',
  };
  const _sel = (name, label, opts) => `<div class="field"><label>${label}</label><input type="hidden" name="${name}"><div class="btn-group" data-name="${name}">${opts.map((o, i) => `<span class="btn-opt${i === 0 ? ' is-active' : ''}" data-val="${o}"${OPT_TONE[o] ? ` data-tone="${OPT_TONE[o]}"` : ''}>${o}</span>`).join('')}</div></div>`;

  let fields = '';

  if (currentType === 'maint') {
    fields = `
      <div class="form-section">
        <div class="form-section-title"><i class="ph ph-wrench"></i>정비 정보</div>
        <div class="form-grid">
          ${_sel('maint_type', '정비유형', ['정기점검','소모품교체','수리','판금/도색','타이어','기타'])}
          <div class="field"><label>작업내용</label><input type="text" name="title" placeholder="예: 엔진오일 교환"></div>
          <div class="field"><label>금액</label><input type="text" name="amount" inputmode="numeric" placeholder="0"></div>
          <div class="field"><label>현 주행거리 (km)</label><input type="text" name="mileage" inputmode="numeric" placeholder="0"></div>
          <div class="field"><label>다음정비예정</label><input type="date" name="next_maint_date"></div>
          <div class="field"><label>예상 완료일</label><input type="date" name="expected_delivery"></div>
          <div class="field" style="grid-column:1/-1"><label>메모</label><textarea name="note" rows="2"></textarea></div>
        </div>
      </div>`;
  } else if (currentType === 'repair') {
    fields = `
      <div class="form-section">
        <div class="form-section-title"><i class="ph ph-hammer"></i>사고수리 정보</div>
        <div class="form-grid">
          ${_sel('damage_area', '사고부위', ['앞범퍼','뒷범퍼','앞휀더','뒷휀더','도어','본넷','트렁크','사이드미러','유리','휠','기타'])}
          <div class="field"><label>수리내용</label><input type="text" name="title" placeholder="예: 후방 판금도색"></div>
          ${_sel('damage_frame', '골격 손상', ['없음','경미','있음'])}
          <div class="field"><label>수리예상금액</label><input type="text" name="repair_estimate" inputmode="numeric" placeholder="0"></div>
          <div class="field"><label>보험금</label><input type="text" name="insurance_amount" inputmode="numeric" placeholder="0"></div>
          <div class="field"><label>자기부담금</label><input type="text" name="self_pay" inputmode="numeric" placeholder="0"></div>
          ${_sel('rental_car', '대차', ['미정','대차제공','대차없음'])}
          <div class="field"><label>예상 완료일</label><input type="date" name="expected_delivery"></div>
          <div class="field" style="grid-column:1/-1"><label>메모</label><textarea name="note" rows="2"></textarea></div>
        </div>
      </div>`;
  } else if (currentType === 'product') {
    fields = `
      <div class="form-section">
        <div class="form-section-title"><i class="ph ph-sparkle"></i>상품화 정보</div>
        <div class="form-grid">
          ${_sel('exterior', '외관', ['양호','경미흠집','손상있음'])}
          <div class="field"><label>작업내용</label><input type="text" name="title" placeholder="예: 실내크리닝 + 광택"></div>
          ${_sel('interior', '실내', ['양호','보통','청소필요'])}
          ${_sel('tire_status', '타이어', ['양호','교체필요','편마모'])}
          <div class="field"><label>금액</label><input type="text" name="amount" inputmode="numeric" placeholder="0"></div>
          <div class="field"><label>현 주행거리 (km)</label><input type="text" name="mileage" inputmode="numeric" placeholder="0"></div>
          <div class="field"><label>예상 완료일</label><input type="date" name="expected_delivery"></div>
          <div class="field" style="grid-column:1/-1"><label>메모</label><textarea name="note" rows="2"></textarea></div>
        </div>
      </div>`;
  } else if (currentType === 'wash') {
    fields = `
      <div class="form-section">
        <div class="form-section-title"><i class="ph ph-drop"></i>세차 정보</div>
        <div class="form-grid">
          ${_sel('wash_type', '세차유형', ['외부세차','실내크리닝','풀세차','광택'])}
          <div class="field"><label>작업내용</label><input type="text" name="title" placeholder="예: 외부세차 + 실내크리닝"></div>
          <div class="field"><label>금액</label><input type="text" name="amount" inputmode="numeric" placeholder="0"></div>
          <div class="field"><label>예상 완료일</label><input type="date" name="expected_delivery"></div>
          <div class="field" style="grid-column:1/-1"><label>메모</label><textarea name="note" rows="2"></textarea></div>
        </div>
      </div>`;
  }

  detailHost.innerHTML = fields + `
  <div class="form-section">
    <div class="form-section-title"><i class="ph ph-paperclip"></i>첨부파일</div>
    <div class="form-grid"><div class="field" style="grid-column:1/-1"><div id="pcPhotoUploader"></div></div></div>
  </div>`;

  // btn-group 바인딩 (세부 폼 내)
  detailHost.querySelectorAll('.btn-group').forEach(group => {
    if (group.querySelector('.btn-toggle')) return;
    const hidden = group.previousElementSibling;
    if (hidden && hidden.tagName === 'INPUT') {
      hidden.value = group.querySelector('.btn-opt.is-active')?.dataset.val || '';
    }
    group.querySelectorAll('.btn-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        const wasActive = opt.classList.contains('is-active');
        group.querySelectorAll('.btn-opt').forEach(o => o.classList.remove('is-active'));
        if (!wasActive) opt.classList.add('is-active');
        if (hidden && hidden.tagName === 'INPUT') {
          hidden.value = wasActive ? '' : opt.dataset.val;
        }
      });
    });
  });

  // 첨부파일 바인딩
  const mount = detailHost.querySelector('#pcPhotoUploader');
  if (mount) iocUploader = createPhotoUploader(mount, { accept: 'image/*,.pdf', multiple: true });
}

function togglePenaltyButtons(hide) {
  const reset = $('#opReset');
  const submit = $('#opSubmit');
  if (reset) reset.style.display = hide ? 'none' : '';
  if (submit) submit.style.display = hide ? 'none' : '';

  // 중앙 패널 헤드에 과태료 전용 버튼
  const formActions = reset?.parentElement;
  const ctxActions = document.getElementById('opContextActions');
  const penFormId = 'penFormActions';
  const penCtxId = 'penCtxActions';

  if (hide) {
    // 중앙: 드라이브 저장 + 열기 + 처리완료
    if (formActions && !document.getElementById(penFormId)) {
      const wrap = document.createElement('span');
      wrap.id = penFormId;
      wrap.style.cssText = 'display:flex;gap:4px;align-items:center';
      wrap.innerHTML = `
        <button class="btn btn-sm" id="penClearAll"><i class="ph ph-arrow-counter-clockwise"></i> 초기화</button>
        <button class="btn btn-sm" id="penDriveUpload"><i class="ph ph-google-drive-logo"></i> 드라이브</button>
        <a class="btn btn-sm" href="https://drive.google.com/drive/folders/1DZFCXfD6vvrW2ufaYavw5Eojy8kJ1XB9" target="_blank" style="text-decoration:none"><i class="ph ph-arrow-square-out"></i> 열기</a>
        <button class="btn btn-sm btn-primary" id="penCompleteAll"><i class="ph ph-check-circle"></i> 처리완료</button>`;
      formActions.appendChild(wrap);
      wrap.querySelector('#penClearAll').addEventListener('click', () => {
        _penaltyWorkItems = [];
        renderPenaltyMatchList();
        const status = $('#penNoticeStatus');
        if (status) status.innerHTML = '';
        showToast('작업 목록 초기화', 'info');
      });
      wrap.querySelector('#penDriveUpload').addEventListener('click', uploadPenaltyToDrive);
      wrap.querySelector('#penCompleteAll').addEventListener('click', completePenaltyAll);
    }
    // 우측: ZIP 다운로드 + 초기화
    if (ctxActions && !document.getElementById(penCtxId)) {
      ctxActions.id = 'opContextActions';
      ctxActions.innerHTML = `
        <span id="${penCtxId}" style="display:flex;gap:4px;align-items:center">
          <button class="btn btn-sm" id="penDownloadAll"><i class="ph ph-download-simple"></i> 다운로드</button>
        </span>`;
      ctxActions.querySelector('#penDownloadAll').addEventListener('click', downloadPenaltyAll);
    }
  } else {
    // 복원
    document.getElementById(penFormId)?.remove();
    if (ctxActions) ctxActions.innerHTML = '';
  }
}

function renderPenaltyNoticeMode() {
  const host = $('#opFormHost');
  if (!host) return;
  host.innerHTML = `
    <div class="form-section">
      <label id="penNoticeDrop" class="photo-dropzone" style="cursor:pointer">
        <input type="file" id="penNoticeFile" multiple accept=".pdf,.png,.jpg,.jpeg,.heic" hidden>
        <i class="ph ph-upload-simple"></i>
        <div class="photo-dropzone-title">과태료/통행료 고지서 업로드</div>
        <div class="photo-dropzone-sub">PDF · 이미지 · 여러 장 가능 · 클릭 또는 드래그</div>
      </label>
      <div id="penNoticeStatus" style="display:flex;flex-direction:column;gap:6px;margin-top:12px"></div>
    </div>
    <div class="form-section" id="penSummary" style="font-size:var(--font-size-sm);color:var(--c-text-muted);text-align:center">
      작업 대기: <b id="penWorkCount">0</b>건
    </div>`;

  // 업로드 바인딩
  const file = $('#penNoticeFile');
  const drop = $('#penNoticeDrop');
  file?.addEventListener('change', e => handlePenaltyFiles(Array.from(e.target.files)));
  drop?.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('is-drag'); });
  drop?.addEventListener('dragleave', () => drop.classList.remove('is-drag'));
  drop?.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('is-drag');
    handlePenaltyFiles(Array.from(e.dataTransfer.files));
  });

  // 버튼은 패널 헤드에서 togglePenaltyButtons가 관리
}

// getPenaltyRows 제거 — 세션 기반(_penaltyWorkItems) 사용

let _penaltyWorkItems = []; // 세션 작업 아이템 (DB 미저장)
let _penaltyGridApi = null;

function renderPenaltyMatchList() {
  const ctx = $('#opContextHost');
  if (!ctx) return;

  const rows = _penaltyWorkItems;
  const sub = $('#opContextSubtitle');
  if (sub) sub.textContent = `${rows.length}건`;
  const countEl = document.getElementById('penWorkCount');
  if (countEl) countEl.textContent = rows.length;

  let gridDiv = document.getElementById('penMatchGrid');
  if (!gridDiv || !_penaltyGridApi) {
    ctx.classList.remove('is-pad');
    ctx.style.padding = '0';
    ctx.innerHTML = '<div id="penMatchGrid" class="ag-theme-alpine" style="width:100%;height:100%;min-height:300px"></div>';
    gridDiv = document.getElementById('penMatchGrid');
    const fmt = v => Number(v || 0).toLocaleString();
    _penaltyGridApi = agGrid.createGrid(gridDiv, {
      columnDefs: [
        { headerName: '매칭', width: 65, pinned: 'left',
          valueGetter: p => p.data._contract ? '✓' : '✗',
          cellStyle: p => ({
            textAlign: 'center', fontWeight: 600,
            color: p.data._contract ? 'var(--c-success)' : 'var(--c-danger)',
          }) },
        { headerName: '차량번호', field: 'car_number', width: 100,
          cellStyle: { fontWeight: 600 } },
        { headerName: '부과기관', field: 'issuer', width: 110 },
        { headerName: '위반일시', field: 'date', width: 140 },
        { headerName: '위반장소', field: 'location', flex: 1, minWidth: 120 },
        { headerName: '금액', field: 'amount', width: 90, type: 'numericColumn',
          valueFormatter: p => fmt(p.value) },
        { headerName: '계약자', width: 80,
          valueGetter: p => p.data._contractor || '',
          cellStyle: p => p.data._contract ? null : { color: 'var(--c-danger)' } },
        { headerName: '계약시작', width: 100, valueGetter: p => p.data._contract?.start_date || '' },
        { headerName: '계약종료', width: 100, valueGetter: p => p.data._contract?.end_date || '' },
        { headerName: '', width: 90, sortable: false, filter: false,
          cellRenderer: (p) => {
            const btn = document.createElement('button');
            btn.textContent = '처리완료';
            btn.className = 'btn';
            btn.style.cssText = 'padding:2px 8px;font-size:11px;line-height:1.6';
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              completePenaltyItem(p.data._workId);
            });
            return btn;
          },
        },
      ],
      rowData: rows,
      defaultColDef: { resizable: true, sortable: true, filter: true, minWidth: 50 },
      rowHeight: 32,
      headerHeight: 28,
      animateRows: false,
      rowSelection: { mode: 'singleRow', checkboxes: false, headerCheckbox: false },
      suppressContextMenu: true,
      onRowClicked: (e) => { if (e.data) openPenaltyPreview(e.data); },
    });
  } else {
    _penaltyGridApi.setGridOption('rowData', rows);
  }
}

function openPenaltyPreview(row) {
  const asset = row._asset;
  const contract = row._contract;
  const carModel = asset ? `${asset.manufacturer || ''} ${asset.car_model || ''}`.trim() : '';
  const contractor = contract?.contractor_name || row._contractor || '';
  const dt = (row.date || '').replace(/[^0-9]/g, '');
  const dtShort = dt.length >= 12 ? dt.slice(2, 8) + '_' + dt.slice(8, 12) : dt.length >= 8 ? dt.slice(2, 8) : dt;
  const fileName = [row.issuer || '', row.car_number, dtShort, contractor || '미매칭', carModel].filter(Boolean).join(' ');

  // 세션 데이터 (페이지별 이미지) 우선
  const fileUrl = row._fileDataUrl || row.file_url || '';

  const { style, body } = buildConfirmationContent({
    company_name: row.payer_name || '',
    car_number: row.car_number || '',
    car_model: carModel,
    vin: asset?.vin || row.vin || '',
    contractor_name: contractor,
    contractor_phone: contract?.contractor_phone || '',
    contractor_reg_no: contract?.contractor_reg_no || '',
    start_date: contract?.start_date || '',
    end_date: contract?.end_date || '',
    violation_date: row.date || '',
  });

  const noticeSection = !fileUrl
    ? `<div style="padding:60px;text-align:center;color:#999">고지서 파일이 없습니다</div>`
    : `<img src="${fileUrl}" alt="고지서" style="max-width:100%;max-height:100%;object-fit:contain">`;

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${fileName}</title>
<style>
${style}
/* 뷰어 추가 스타일 */
html, body { height: auto; }
body { padding: 0; background: #ececec; }
.toolbar { position: sticky; top: 0; z-index: 100; display: flex; gap: 10px; align-items: center; padding: 10px 16px; background: #fff; border-bottom: 1px solid #ddd; }
.toolbar button { padding: 8px 16px; font-size: 14px; cursor: pointer; border: 1px solid #888; border-radius: 4px; background: #fff; }
.toolbar button.primary { background: #2563eb; color: #fff; border-color: #2563eb; }
.toolbar .fname { flex: 1; color: #555; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.page { width: 210mm; min-height: 297mm; background: #fff; margin: 16px auto; box-shadow: 0 2px 8px rgba(0,0,0,.1); padding: 20mm 15mm; page-break-after: always; }
.page:last-of-type { page-break-after: auto; }
.page-image { display: flex; align-items: center; justify-content: center; padding: 0; overflow: hidden; }
.page-image img { max-width: 100%; max-height: 297mm; object-fit: contain; }
.page-image iframe { width: 100%; height: 297mm; border: 0; }
@media print {
  body { background: #fff; }
  .toolbar { display: none; }
  .page { margin: 0; padding: 20mm 15mm; box-shadow: none; }
  .page-image { padding: 0; }
}
</style>
</head>
<body>
<div class="toolbar">
  <button class="primary" onclick="window.print()">📄 PDF 저장 (인쇄)</button>
  <button onclick="window.close()">닫기</button>
  <div class="fname">파일명: ${fileName}</div>
</div>
<div class="page page-image">
  ${noticeSection}
</div>
<div class="page">
  ${body}
</div>
</body>
</html>`;

  const w = window.open('', '_blank');
  if (!w) { showToast('팝업이 차단되었습니다', 'error'); return; }
  w.document.write(html);
  w.document.close();
  w.document.title = fileName;
}

async function handlePenaltyFiles(files) {
  if (!files.length) return;
  const status = $('#penNoticeStatus');
  let penaltyModule;
  try { penaltyModule = await import('../data/ocr-parsers/penalty.js'); } catch {}

  for (const file of files) {
    const id = `pen_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`;
    if (status) status.insertAdjacentHTML('beforeend', `<div id="${id}" class="dash-card"></div>`);
    const row = document.getElementById(id);

    // upload.js와 동일한 진행율 UI
    const renderProgress = ({ stage, done, total, message }) => {
      if (!row) return;
      const pct = total ? Math.round((done / total) * 100) : 0;
      const icon = stage === 'render' ? '📄' : '🔍';
      const label = stage === 'render' ? 'PDF 렌더링' : 'OCR 분석';
      row.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:6px;padding:8px">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:var(--font-size-lg)">${icon}</span>
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${file.name}</div>
              <div style="font-size:var(--font-size-xs);color:var(--c-text-muted)">${label} · ${message || ''}</div>
            </div>
            <div style="font-size:11px;color:var(--c-text-muted);font-variant-numeric:tabular-nums">${done}/${total} (${pct}%)</div>
          </div>
          <div style="height:4px;background:var(--c-border);border-radius:2px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:var(--c-primary);transition:width .15s"></div>
          </div>
        </div>`;
    };
    renderProgress({ stage: 'render', done: 0, total: 1, message: '시작' });

    try {
      const result = await ocrFile(file, { concurrency: 6, scale: 1.5, onProgress: renderProgress });
      const texts = result.text.split('--- 페이지 구분 ---').map(t => t.trim()).filter(Boolean);
      const allText = texts.length ? texts : [result.text];

      // 페이지별 이미지 생성 (PDF → 페이지별, 이미지 → 1장)
      let pageImages = [];
      const fileExt = file.name.split('.').pop().toLowerCase();
      if (fileExt === 'pdf') {
        try {
          const pdfjsLib = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs');
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';
          const buf = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
          for (let pg = 1; pg <= pdf.numPages; pg++) {
            const page = await pdf.getPage(pg);
            const vp = page.getViewport({ scale: 2.0 });
            const c = document.createElement('canvas');
            c.width = vp.width; c.height = vp.height;
            await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
            pageImages.push(c.toDataURL('image/jpeg', 0.92));
          }
        } catch (e) { console.warn('[pdf→img]', e); }
      } else {
        try {
          const dataUrl = await new Promise((res, rej) => {
            const reader = new FileReader();
            reader.onload = () => res(reader.result);
            reader.onerror = rej;
            reader.readAsDataURL(file);
          });
          pageImages = [dataUrl];
        } catch {}
      }

      let saved = 0, dup = 0;
      for (let _pi = 0; _pi < allText.length; _pi++) {
        const txt = allText[_pi];
        const lines = txt.split('\n').map(l => l.trim()).filter(Boolean);
        if (!penaltyModule?.detect(txt)) continue;
        const p = penaltyModule.parse(txt, lines);
        if (!p.car_number) continue;

        const asset = assets.find(a => a.car_number === p.car_number);
        const contract = contracts.find(c => c.car_number === p.car_number && c.contract_status !== '계약해지');

        // 세션 내 동일 건 중복만 체크 (고지서번호 기준)
        if (p.notice_no && _penaltyWorkItems.some(w => w.notice_no === p.notice_no)) { dup++; continue; }

        // 세션 작업 아이템에 추가 (DB 저장 안 함)
        const workId = `pen_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        _penaltyWorkItems.push({
          _workId: workId,
          _fileDataUrl: pageImages[_pi] || pageImages[0] || '',
          _fileName: file.name,
          _asset: asset,
          _contract: contract,
          _contractor: contract?.contractor_name || '',
          _carInfo: asset ? `${asset.manufacturer || ''} ${asset.car_model || ''}`.trim() : '',
          // OCR 데이터
          ...p,
          date: p.date || '',
          amount: p.amount || p.penalty_amount || p.toll_amount || 0,
          customer_name: contract?.contractor_name || '',
          contract_code: contract?.contract_code || '',
          partner_code: asset?.partner_code || '',
          vin: asset?.vin || '',
        });
        saved++;
      }

      if (row) row.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;padding:8px">
          <span>✅</span>
          <span style="font-size:var(--font-size-sm)">${file.name} — ${saved}건 추가${dup ? ` · ${dup}건 중복` : ''}</span>
        </div>`;
      renderPenaltyMatchList();
    } catch (e) {
      if (row) row.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;padding:8px">
          <span>❌</span>
          <span style="font-size:var(--font-size-sm);color:var(--c-danger)">${file.name} — ${e.message}</span>
        </div>`;
    }
  }

  showToast('OCR 처리 완료', 'success');
  const fileInput = $('#penNoticeFile');
  if (fileInput) fileInput.value = '';
}

const DRIVE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxM5IzzD_vtaxSfnMsT1x5i9D6DqU6QViC60KLOhl5T3FLjM7GOo0bnvLdlnS5U3ki4tw/exec';

async function ensurePdfLibs() {
  await loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js');
  await loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
}

async function generatePenaltyPdf(item) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF('p', 'mm', 'a4');
  const asset = item._asset;
  const contract = item._contract;
  const carModel = asset ? `${asset.manufacturer || ''} ${asset.car_model || ''}`.trim() : '';
  const contractor = contract?.contractor_name || item._contractor || '';

  // 1페이지: 고지서 이미지
  if (item._fileDataUrl) {
    try { pdf.addImage(item._fileDataUrl, 'JPEG', 0, 0, 210, 297); }
    catch (e) { console.warn('[addImage]', e); }
  } else {
    pdf.setFontSize(16);
    pdf.text('고지서 파일 없음', 105, 148, { align: 'center' });
  }

  // 2페이지: 확인서
  pdf.addPage();
  const { style, body } = buildConfirmationContent({
    company_name: item.payer_name || '',
    car_number: item.car_number || '',
    car_model: carModel,
    vin: asset?.vin || item.vin || '',
    contractor_name: contractor,
    contractor_phone: contract?.contractor_phone || '',
    contractor_reg_no: contract?.contractor_reg_no || '',
    start_date: contract?.start_date || '',
    end_date: contract?.end_date || '',
    violation_date: item.date || '',
  });
  try {
    const tmp = document.createElement('div');
    tmp.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:#fff;';
    tmp.innerHTML = `<style>${style}</style><div style="padding:40px">${body}</div>`;
    document.body.appendChild(tmp);
    const canvas = await window.html2canvas(tmp, { scale: 2, useCORS: true });
    document.body.removeChild(tmp);
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
  } catch (e) {
    console.warn('[html2canvas]', e);
    pdf.setFontSize(14);
    pdf.text('확인서 생성 실패', 105, 148, { align: 'center' });
  }

  // 위반일시 → YYMMDD_HHMM
  const dt = (item.date || '').replace(/[^0-9]/g, ''); // '20260415 1430' → '202604151430'
  const dtShort = dt.length >= 12 ? dt.slice(2, 8) + '_' + dt.slice(8, 12) : dt.length >= 8 ? dt.slice(2, 8) : dt;
  const fileName = [item.issuer || '', item.car_number, dtShort, contractor || '미매칭', carModel].filter(Boolean).join(' ').trim();
  return { pdf, fileName };
}

async function loadScript(src) {
  if (document.querySelector(`script[src="${src}"]`)) return;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function downloadPenaltyAll() {
  if (!_penaltyWorkItems.length) { showToast('다운로드할 건이 없습니다', 'info'); return; }
  showToast(`${_penaltyWorkItems.length}건 PDF 생성 중...`, 'info');

  await ensurePdfLibs();
  await loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');

  const zip = new window.JSZip();
  for (const item of _penaltyWorkItems) {
    const { pdf, fileName } = await generatePenaltyPdf(item);
    zip.file(`${fileName}.pdf`, pdf.output('blob'));
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `과태료_${new Date().toISOString().slice(0, 10)}_${_penaltyWorkItems.length}건.zip`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast(`${_penaltyWorkItems.length}건 ZIP 다운로드 완료`, 'success');
}

async function uploadPenaltyToDrive() {
  if (!_penaltyWorkItems.length) { showToast('업로드할 건이 없습니다', 'info'); return; }

  try {
    showToast('PDF 라이브러리 로드 중...', 'info');
    await ensurePdfLibs();
  } catch (e) {
    showToast(`라이브러리 로드 실패: ${e.message}`, 'error'); return;
  }

  let uploaded = 0;
  for (let i = 0; i < _penaltyWorkItems.length; i++) {
    const item = _penaltyWorkItems[i];
    showToast(`${i + 1}/${_penaltyWorkItems.length} PDF 생성 중... ${item.car_number}`, 'info');

    try {
      const { pdf, fileName } = await generatePenaltyPdf(item);
      const pdfBase64 = pdf.output('datauristring').split(',')[1];

      showToast(`${i + 1}/${_penaltyWorkItems.length} 드라이브 업로드 중... ${fileName}`, 'info');
      const resp = await fetch(DRIVE_SCRIPT_URL, {
        method: 'POST',
        redirect: 'follow',
        body: JSON.stringify({ file: pdfBase64, name: `${fileName}.pdf` }),
      });
      const text = await resp.text();
      console.log('[drive resp]', resp.status, text);
      uploaded++;
    } catch (e) {
      console.error('[drive upload]', e);
      showToast(`${item.car_number} 업로드 실패: ${e.message}`, 'error');
    }
  }

  showToast(`${uploaded}/${_penaltyWorkItems.length}건 드라이브 업로드 완료`, uploaded > 0 ? 'success' : 'error');
}

async function completePenaltyItem(workId) {
  const idx = _penaltyWorkItems.findIndex(w => w._workId === workId);
  if (idx < 0) return;
  const item = _penaltyWorkItems[idx];

  // Storage 업로드 시도 (실패해도 DB 저장 진행)
  let fileUrl = '';
  const dateOnly = (item.date || '').split(' ')[0];
  try {
    if (item._fileDataUrl) {
      const resp = await fetch(item._fileDataUrl);
      const blob = await resp.blob();
      const ext = item._fileDataUrl.startsWith('data:application/pdf') ? 'pdf' : 'jpg';
      const file = new File([blob], `${item.car_number}_고지서.${ext}`);
      fileUrl = await uploadPenaltyFile(file, item.car_number, dateOnly);
    }
  } catch (e) { console.warn('[penalty upload on complete]', e); }

  // DB 저장
  await saveEvent({
    event_type: 'penalty',
    doc_type: item.doc_type,
    car_number: item.car_number,
    vin: item.vin || '',
    date: item.date || '',
    title: item.description || item.doc_type || '과태료',
    penalty_amount: item.penalty_amount,
    fine_amount: item.fine_amount,
    demerit_points: item.demerit_points,
    toll_amount: item.toll_amount,
    amount: item.amount,
    location: item.location,
    description: item.description,
    law_article: item.law_article,
    due_date: item.due_date,
    notice_no: item.notice_no,
    issuer: item.issuer,
    issue_date: item.issue_date,
    payer_name: item.payer_name,
    pay_account: item.pay_account,
    customer_name: item.customer_name || '',
    contract_code: item.contract_code || '',
    partner_code: item.partner_code || '',
    paid_status: '미납',
    direction: 'out',
    file_url: fileUrl,
    note: `과태료처리 (${item._fileName || ''})`,
  });

  // 세션에서 제거
  _penaltyWorkItems.splice(idx, 1);
  renderPenaltyMatchList();
  showToast(`${item.car_number} 처리완료 → DB 저장`, 'success');
}

async function completePenaltyAll() {
  if (!_penaltyWorkItems.length) { showToast('처리할 건이 없습니다', 'info'); return; }
  const total = _penaltyWorkItems.length;
  // 역순으로 처리 (splice 안전)
  while (_penaltyWorkItems.length) {
    await completePenaltyItem(_penaltyWorkItems[0]._workId);
  }
  showToast(`${total}건 일괄 처리완료`, 'success');
}
