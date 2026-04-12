/**
 * pages/input-operation.js — 운영등록
 *
 * 좌: 유형 목록 (정비/사고/과태료/출고반납)
 * 우: 선택한 유형의 입력 폼 + 등록
 */
import { saveEvent, watchEvents } from '../firebase/events.js';
import { watchAssets } from '../firebase/assets.js';
import { watchContracts } from '../firebase/contracts.js';
import { showToast } from '../core/toast.js';

const $ = (s) => document.querySelector(s);

// 최근 차량 / 즐겨찾기 / 자주 쓰는 제목
const RECENT_KEY = 'jpk.op.recent_cars';
const FAV_KEY = 'jpk.op.favorites';
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

const DEFAULT_TYPES = [
  { key: 'contact',     label: '고객응대',       icon: '📞', sub: '통화/상담/컴플레인',       direction: 'out' },
  { key: 'delivery',    label: '출고(인도)',     icon: '🚗', sub: '차량 인도',                 direction: 'out' },
  { key: 'return',      label: '정상반납',       icon: '🔙', sub: '계약만료/정상회수',          direction: 'in' },
  { key: 'force',       label: '강제회수',       icon: '🚨', sub: '미납/연락두절/강제회수',     direction: 'in' },
  { key: 'transfer',    label: '차량이동',       icon: '🔄', sub: '이동/배차/탁송',            direction: 'out' },
  { key: 'key',         label: '차키 전달/분출', icon: '🔑', sub: '키 전달/회수/분실',          direction: 'out' },
  { key: 'maint',       label: '정비',           icon: '🔧', sub: '소모품교체 + 기능수리',      direction: 'out' },
  { key: 'product',     label: '상품화',         icon: '✨', sub: '반납 후 재상품화',           direction: 'out' },
  { key: 'accident',    label: '사고접수 및 처리', icon: '💥', sub: '사고 발생/보험접수',        direction: 'out' },
  { key: 'repair',      label: '사고수리',       icon: '🔨', sub: '판금/도색/수리',             direction: 'out' },
  { key: 'penalty',     label: '과태료',         icon: '🚫', sub: '교통 과태료/위반',           direction: 'out' },
  { key: 'collect',     label: '미수관리',       icon: '📨', sub: '독촉/내용증명/법적조치',     direction: 'out' },
  { key: 'insurance',   label: '보험관리',       icon: '🛡', sub: '보험배서/연령변경/갱신',     direction: 'out' },
  { key: 'wash',        label: '세차',           icon: '🧼', sub: '세차/실내크리닝',           direction: 'out' },
  { key: 'fuel',        label: '연료보충',       icon: '⛽', sub: '주유/전기충전',              direction: 'out' },
];

const ORDER_KEY = 'jpk.op.order';
function loadTypes() {
  try {
    const saved = JSON.parse(localStorage.getItem(ORDER_KEY));
    if (saved?.length) {
      const ordered = saved.map(k => DEFAULT_TYPES.find(t => t.key === k)).filter(Boolean);
      // 새로 추가된 항목도 뒤에 붙이기
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
let currentType = null;
let lastCarNumber = '';

function renderList() {
  const host = $('#opList');
  host.innerHTML = TYPES.map(t => `
    <div class="op-type${currentType === t.key ? ' is-active' : ''}" data-type="${t.key}" draggable="true">
      <span class="op-type__icon">${t.icon}</span>
      <span class="op-type__label">${t.label}</span>
      <span class="op-type__sub">${t.sub}</span>
      <span class="op-type__handle">⠿</span>
    </div>
  `).join('');

  // 클릭
  host.querySelectorAll('.op-type').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('[draggable]') && e.detail === 0) return;
      currentType = el.dataset.type;
      renderList();
      renderForm();
    });
  });

  // 드래그 정렬
  let dragEl = null;
  host.querySelectorAll('.op-type').forEach(el => {
    el.addEventListener('dragstart', (e) => {
      dragEl = el;
      el.style.opacity = '0.4';
      e.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragend', () => {
      el.style.opacity = '';
      dragEl = null;
    });
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      el.style.borderTop = '2px solid var(--c-primary)';
    });
    el.addEventListener('dragleave', () => {
      el.style.borderTop = '';
    });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.style.borderTop = '';
      if (!dragEl || dragEl === el) return;
      const fromKey = dragEl.dataset.type;
      const toKey = el.dataset.type;
      const fromIdx = TYPES.findIndex(t => t.key === fromKey);
      const toIdx = TYPES.findIndex(t => t.key === toKey);
      if (fromIdx < 0 || toIdx < 0) return;
      const [moved] = TYPES.splice(fromIdx, 1);
      TYPES.splice(toIdx, 0, moved);
      saveOrder(TYPES);
      renderList();
    });
  });
}

function renderForm() {
  const t = TYPES.find(x => x.key === currentType);
  if (!t) return;
  const today = new Date().toISOString().slice(0, 10);
  $('#opFormTitle').textContent = `${t.icon} ${t.label} 입력`;

  const host = $('#opFormHost');
  const carList = `<datalist id="opCarList">${assets.map(a => `<option value="${a.car_number || ''}">${a.car_model || ''}</option>`).join('')}</datalist>`;
  const chk = (name, label) => `<div class="field"><label style="display:flex;align-items:center;gap:6px"><input type="checkbox" name="${name}" value="Y"> ${label}</label></div>`;
  const sel = (name, label, opts) => `<div class="field"></label>${label}</label><input type="hidden" name="${name}"><div class="btn-group" data-name="${name}">${opts.map((o, i) => `<span class="btn-opt${i === 0 ? ' is-active' : ''}" data-val="${o}">${o}</span>`).join('')}</div></div>`;

  // 유형별 폼 생성
  let sections = '';

  if (currentType === 'maintenance') {
    sections = `
    <div class="form-section">
      <div class="form-section-title">정비 정보</div>
      <div class="form-grid">
        <div class="field is-required"></label>일자</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"></label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
        <div class="field is-required"></label>정비내용</label><input type="text" name="title" placeholder="예: 엔진오일 교환"></div>
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
      <div class="form-section-title">사고 정보</div>
      <div class="form-grid">
        <div class="field is-required"></label>사고일시</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"></label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
        <div class="field is-required"></label>사고내용</label><input type="text" name="title" placeholder="예: 후방추돌"></div>
        ${sel('accident_type', '사고유형', ['자차','대물','대인','자차+대물','자차+대인'])}
        <div class="field"></label>사고장소</label><input type="text" name="vendor" placeholder="사고 발생 위치"></div>
        <div class="field"></label>과실비율</label><input type="text" name="fault_ratio" placeholder="예: 100:0, 70:30"></div>
        <div class="field"></label>상대방</label><input type="text" name="accident_other" placeholder="상대방 이름/차량"></div>
        <div class="field"></label>상대방연락처</label><input type="text" name="accident_other_phone" placeholder="010-0000-0000"></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">보험 처리</div>
      <div class="form-grid">
        <div class="field"></label>보험사</label><input type="text" name="insurance_company" placeholder="삼성화재, 현대해상 등"></div>
        <div class="field"></label>보험접수번호</label><input type="text" name="insurance_no" placeholder="접수번호"></div>
        <div class="field"></label>수리예상금액</label><input type="text" name="repair_estimate" inputmode="numeric" placeholder="0"></div>
        <div class="field"></label>수리업체</label><input type="text" name="repair_shop" placeholder="수리 맡긴 곳"></div>
        <div class="field"></label>수리기간(예상)</label><input type="text" name="repair_days" placeholder="일"></div>
        ${sel('rental_car', '대차여부', ['미정','대차 제공','대차 없음'])}
        <div class="field" style="grid-column:1/-1"></label>메모</label><textarea name="note" rows="2"></textarea></div>
      </div>
    </div>`;

  } else if (currentType === 'penalty') {
    sections = `
    <div class="form-section">
      <div class="form-section-title">과태료 정보</div>
      <div class="form-grid">
        <div class="field is-required"></label>위반일자</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"></label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
        <div class="field is-required"></label>위반내용</label><input type="text" name="title" placeholder="예: 주정차위반, 속도위반"></div>
        ${sel('penalty_type', '위반유형', ['주정차위반','속도위반','신호위반','버스전용','기타'])}
        <div class="field"></label>과태료금액</label><input type="text" name="amount" inputmode="numeric" placeholder="0"></div>
        <div class="field"></label>위반장소</label><input type="text" name="vendor" placeholder="위반 위치"></div>
        <div class="field"></label>납부기한</label><input type="date" name="due_date"></div>
        ${sel('payer', '부담자', ['고객부담','회사부담'])}
        <div class="field"></label>고객명</label><input type="text" name="customer_name" placeholder="해당 고객"></div>
        ${sel('paid_status', '납부여부', ['미납','납부완료'])}
        <div class="field" style="grid-column:1/-1"></label>메모</label><textarea name="note" rows="2"></textarea></div>
      </div>
    </div>`;

  } else if (currentType === 'delivery') {
    sections = `
    <div class="form-section">
      <div class="form-section-title">출고 기본</div>
      <div class="form-grid">
        <div class="field is-required"></label>출고일</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"></label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
        <div class="field is-required"></label>제목</label><input type="text" name="title" placeholder="예: 홍길동 출고"></div>
        <div class="field"></label>인도장소</label><input type="text" name="delivery_location" placeholder="사무실/고객방문/탁송"></div>
        <div class="field"></label>인수자명</label><input type="text" name="receiver_name"></div>
        <div class="field"></label>인수자연락처</label><input type="text" name="receiver_phone" placeholder="010-0000-0000"></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">차량 상태</div>
      <div class="form-grid">
        <div class="field"></label>주행거리</label><input type="text" name="mileage" inputmode="numeric" placeholder="km"></div>
        ${sel('fuel_level', '연료잔량', ['F','3/4','1/2','1/4','E'])}
        ${sel('exterior', '외관상태', ['양호','경미흠집','손상있음'])}
        ${sel('interior', '실내상태', ['양호','보통','청소필요'])}
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">키 인도</div>
      <div class="form-grid" style="grid-template-columns:repeat(4,1fr)">
        ${chk('key_main', '메인키')}
        ${chk('key_sub', '보조키')}
        ${chk('key_card', '카드키')}
        ${chk('key_etc', '기타')}
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">출고 필수 확인</div>
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
      <div class="form-section-title">차량 사진</div>
      <div class="form-grid">
        <div class="field" style="grid-column:1/-1"><label>사진 첨부 (전면/후면/좌/우/실내)</label><input type="file" name="photos" multiple accept="image/*"></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">비품 확인</div>
      <div class="form-grid">
        ${chk('equip_navi', '네비')}
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
      <div class="form-section-title">반납 기본</div>
      <div class="form-grid">
        <div class="field is-required"></label>반납일</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"></label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
        <div class="field is-required"></label>제목</label><input type="text" name="title" placeholder="예: 홍길동 반납"></div>
        <div class="field"></label>반납장소</label><input type="text" name="return_location" placeholder="사무실/고객방문/탁송"></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">차량 상태</div>
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
      <div class="form-section-title">키 회수</div>
      <div class="form-grid" style="grid-template-columns:repeat(4,1fr)">
        ${chk('key_main', '메인키')}
        ${chk('key_sub', '보조키')}
        ${chk('key_card', '카드키')}
        ${chk('key_etc', '기타')}
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">추가청구</div>
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
      <div class="form-section-title">강제회수 정보</div>
      <div class="form-grid">
        <div class="field is-required"><label>회수일</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"><label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
        <div class="field is-required"><label>제목</label><input type="text" name="title" placeholder="예: 미납 3개월 강제회수"></div>
        ${sel('force_reason', '회수사유', ['미납','연락두절','계약위반','사고방치','기타'])}
        <div class="field"><label>회수장소</label><input type="text" name="return_location" placeholder="회수 위치"></div>
        <div class="field"><label>회수담당</label><input type="text" name="handler"></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">차량 상태</div>
      <div class="form-grid">
        <div class="field"><label>주행거리</label><input type="text" name="mileage" inputmode="numeric" placeholder="km"></div>
        ${sel('fuel_level', '연료잔량', ['F','3/4','1/2','1/4','E'])}
        ${sel('car_condition', '차량상태', ['양호','경미손상','수리필요','사고차','파손심함'])}
        ${sel('exterior', '외관', ['양호','경미흠집','손상있음','심각손상'])}
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">키 회수</div>
      <div class="form-grid" style="grid-template-columns:repeat(4,1fr)">
        ${chk('key_main', '메인키')}
        ${chk('key_sub', '보조키')}
        ${chk('key_card', '카드키')}
        ${chk('key_etc', '기타')}
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">미수/정산</div>
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
      <div class="form-section-title">이동 정보</div>
      <div class="form-grid">
        <div class="field is-required"></label>이동일</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"></label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
        <div class="field is-required"></label>제목</label><input type="text" name="title" placeholder="예: 김포→인천 배차"></div>
        <div class="field"></label>출발지</label><input type="text" name="from_location" placeholder="출발 위치"></div>
        <div class="field"></label>도착지</label><input type="text" name="to_location" placeholder="도착 위치"></div>
        ${sel('transfer_reason', '이동사유', ['배차','정비입고','탁송','기타'])}
        <div class="field"></label>주행거리</label><input type="text" name="mileage" inputmode="numeric" placeholder="km"></div>
        <div class="field"></label>비용</label><input type="text" name="amount" inputmode="numeric" placeholder="0"></div>
        <div class="field" style="grid-column:1/-1"></label>메모</label><textarea name="note" rows="2"></textarea></div>
      </div>
    </div>`;

  } else if (currentType === 'key') {
    sections = `
    <div class="form-section">
      <div class="form-section-title">차키 전달/분출</div>
      <div class="form-grid">
        <div class="field is-required"><label>일자</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"><label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
        <div class="field is-required"><label>제목</label><input type="text" name="title" placeholder="예: 메인키 전달"></div>
        ${sel('key_action', '구분', ['전달','회수','분실','복제'])}
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">키 종류 (해당 체크, 메인키 기본)</div>
      <div class="form-grid" style="grid-template-columns:repeat(4,1fr)">
        ${chk('key_main', '메인키')}
        ${chk('key_sub', '보조키')}
        ${chk('key_card', '카드키')}
        ${chk('key_etc', '기타')}
      </div>
    </div>
    <div class="form-section">
      <div class="form-grid">
        <div class="field"><label>키번호/위치</label><input type="text" name="key_info" placeholder="키번호 또는 보관위치"></div>
        <div class="field" style="grid-column:1/-1"><label>메모</label><textarea name="note" rows="2"></textarea></div>
      </div>
    </div>`;

  } else if (currentType === 'maint') {
    const PARTS = ['엔진오일','미션오일','브레이크오일','에어필터','에어컨필터','와이퍼','배터리','타이어','브레이크패드','냉각수','부동액','점화플러그','벨트류','기타'];
    const FIX_ITEMS = ['에어컨','히터','시동불량','엔진이상','미션이상','전기장치','계기판','오디오/네비','창문/선루프','잠금장치','누유/누수','소음/진동','조향장치','서스펜션','배기장치','기타'];
    sections = `
    <div class="form-section">
      <div class="form-section-title">정비 기본</div>
      <div class="form-grid">
        <div class="field is-required"><label>일자</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"><label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
        <div class="field"><label>정비업체</label><input type="text" name="vendor" placeholder="업체명"></div>
        <div class="field"><label>주행거리</label><input type="text" name="mileage" inputmode="numeric" placeholder="km"></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">소모품 교체 (해당 항목 체크)</div>
      <div class="form-grid" style="grid-template-columns:repeat(3,1fr)">
        ${PARTS.map(p => chk('parts_' + p.replace(/[\/\s]/g,'_'), p)).join('')}
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">기능수리 (해당 시)</div>
      <div class="form-grid">
        <div class="field" style="grid-column:1/-1"><label>수리내용</label><input type="text" name="fix_detail" placeholder="예: 에어컨 가스 충전, 배터리 교체"></div>
        <div class="field"><label>수리비</label><input type="text" name="fix_cost" inputmode="numeric" placeholder="0"></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">합계</div>
      <div class="form-grid">
        <div class="field"><label>총 금액</label><input type="text" name="amount" inputmode="numeric" placeholder="소모품+수리 합계"></div>
        <div class="field"><label>다음정비예정</label><input type="date" name="next_maint_date"></div>
        <div class="field" style="grid-column:1/-1"><label>메모</label><textarea name="note" rows="2"></textarea></div>
      </div>
    </div>`;

  } else if (currentType === 'product') {
    sections = `
    <div class="form-section">
      <div class="form-section-title">상품화 기본</div>
      <div class="form-grid">
        <div class="field is-required"><label>일자</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"><label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
        <div class="field is-required"><label>제목</label><input type="text" name="title" placeholder="예: 반납 후 상품화"></div>
        ${sel('product_status', '진행상태', ['시작','진행중','완료'])}
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">세차/크리닝</div>
      <div class="form-grid">
        ${sel('wash_type', '세차', ['미실시','외부세차','실내크리닝','외부+실내','광택'])}
        <div class="field"><label>세차비용</label><input type="text" name="wash_cost" inputmode="numeric" placeholder="0"></div>
        <div class="field"><label>세차업체</label><input type="text" name="wash_vendor"></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">정비/소모품 (해당 시)</div>
      <div class="form-grid">
        ${sel('product_maint', '정비여부', ['없음','소모품교체','수리','판금/도색'])}
        <div class="field"><label>정비내용</label><input type="text" name="maint_detail" placeholder="예: 엔진오일+와이퍼"></div>
        <div class="field"><label>정비비용</label><input type="text" name="maint_cost" inputmode="numeric" placeholder="0"></div>
        <div class="field"><label>정비업체</label><input type="text" name="maint_vendor"></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">차량 상태</div>
      <div class="form-grid">
        ${sel('exterior', '외관', ['양호','경미흠집','손상있음'])}
        ${sel('interior', '실내', ['양호','보통','청소필요'])}
        ${sel('tire_status', '타이어', ['양호','교체필요','편마모'])}
        <div class="field"><label>주행거리</label><input type="text" name="mileage" inputmode="numeric" placeholder="km"></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-grid">
        <div class="field"><label>총 비용</label><input type="text" name="amount" inputmode="numeric" placeholder="세차+정비 합계"></div>
        <div class="field"><label>예상출고일</label><input type="date" name="expected_delivery"></div>
        <div class="field" style="grid-column:1/-1"><label>메모</label><textarea name="note" rows="2" placeholder="상품화 상세 기록"></textarea></div>
      </div>
    </div>`;

  } else if (currentType === 'repair') {
    sections = `
    <div class="form-section">
      <div class="form-section-title">사고수리 정보</div>
      <div class="form-grid">
        <div class="field is-required"><label>일자</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"><label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
        <div class="field is-required"><label>수리내용</label><input type="text" name="title" placeholder="예: 전면범퍼 판금도색"></div>
        ${sel('repair_type', '수리유형', ['판금','도색','판금+도색','부품교체','전체수리'])}
        <div class="field"><label>수리업체</label><input type="text" name="vendor" placeholder="공업사명"></div>
        <div class="field"><label>입고일</label><input type="date" name="repair_in_date"></div>
        <div class="field"><label>출고예정일</label><input type="date" name="repair_out_date"></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">비용</div>
      <div class="form-grid">
        <div class="field"><label>수리비(견적)</label><input type="text" name="repair_estimate" inputmode="numeric" placeholder="0"></div>
        <div class="field"><label>보험처리금액</label><input type="text" name="insurance_amount" inputmode="numeric" placeholder="0"></div>
        <div class="field"><label>자기부담금</label><input type="text" name="self_pay" inputmode="numeric" placeholder="0"></div>
        <div class="field"><label>금액(확정)</label><input type="text" name="amount" inputmode="numeric" placeholder="0"></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-grid">
        ${sel('repair_status', '수리상태', ['견적중','수리중','수리완료','출고완료'])}
        ${sel('rental_car', '대차', ['미제공','대차중','대차반납'])}
        <div class="field" style="grid-column:1/-1"><label>메모</label><textarea name="note" rows="2"></textarea></div>
      </div>
    </div>`;

  } else if (currentType === 'collect') {
    sections = `
    <div class="form-section">
      <div class="form-section-title">미수관리</div>
      <div class="form-grid">
        <div class="field is-required"><label>일자</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"><label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
        <div class="field is-required"><label>제목</label><input type="text" name="title" placeholder="예: 3회차 미납 독촉"></div>
        <div class="field"><label>고객명</label><input type="text" name="customer_name"></div>
        <div class="field"><label>연락처</label><input type="text" name="customer_phone" placeholder="010-0000-0000"></div>
        <div class="field"><label>미수금액</label><input type="text" name="amount" inputmode="numeric" placeholder="0"></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">조치 내역</div>
      <div class="form-grid">
        ${sel('collect_action', '조치', ['전화독촉','문자발송','내용증명발송','법적조치예고','법적조치진행','기타'])}
        ${sel('collect_result', '결과', ['납부약속','즉시납부','연락불가','거부','기타'])}
        <div class="field"><label>약속납부일</label><input type="date" name="promise_date"></div>
        <div class="field"><label>담당자</label><input type="text" name="handler"></div>
        <div class="field" style="grid-column:1/-1"><label>상세내용</label><textarea name="note" rows="3" placeholder="통화 내용, 조치 사항 기록"></textarea></div>
      </div>
    </div>`;

  } else if (currentType === 'insurance') {
    sections = `
    <div class="form-section">
      <div class="form-section-title">보험관리</div>
      <div class="form-grid">
        <div class="field is-required"><label>일자</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"><label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
        <div class="field is-required"><label>제목</label><input type="text" name="title" placeholder="예: 보험연령 21세→26세 변경"></div>
        ${sel('insurance_action', '업무구분', ['배서(연령변경)','신규가입','갱신','해지','보험청구','기타'])}
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">배서 정보</div>
      <div class="form-grid">
        ${sel('age_before', '변경 전 연령', ['21세','26세','만30세','만35세','전연령'])}
        ${sel('age_after', '변경 후 연령', ['21세','26세','만30세','만35세','전연령'])}
        <div class="field"><label>보험사</label><input type="text" name="insurance_company" placeholder="삼성화재, 현대해상 등"></div>
        <div class="field"><label>증권번호</label><input type="text" name="insurance_no"></div>
        <div class="field"><label>추가/환급 보험료</label><input type="text" name="amount" inputmode="numeric" placeholder="0"></div>
        <div class="field"><label>적용일</label><input type="date" name="insurance_start"></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-grid">
        <div class="field" style="grid-column:1/-1"><label>메모</label><textarea name="note" rows="2" placeholder="출고 고객명, 변경 사유 등"></textarea></div>
      </div>
    </div>`;

  } else if (currentType === 'wash') {
    sections = `
    <div class="form-section">
      <div class="form-section-title">세차 정보</div>
      <div class="form-grid">
        <div class="field is-required"><label>일자</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"><label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
        <div class="field is-required"><label>제목</label><input type="text" name="title" placeholder="예: 외부세차+실내크리닝"></div>
        ${sel('wash_type', '세차유형', ['외부세차','실내크리닝','외부+실내','광택','기타'])}
        <div class="field"><label>금액</label><input type="text" name="amount" inputmode="numeric" placeholder="0"></div>
        <div class="field"><label>세차업체</label><input type="text" name="vendor" placeholder="세차장명"></div>
        <div class="field" style="grid-column:1/-1"><label>메모</label><textarea name="note" rows="2"></textarea></div>
      </div>
    </div>`;

  } else if (currentType === 'inspect') {
    sections = `
    <div class="form-section">
      <div class="form-section-title">차량 점검</div>
      <div class="form-grid">
        <div class="field is-required"><label>일자</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"><label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
        <div class="field is-required"><label>제목</label><input type="text" name="title" placeholder="예: 출고전 점검"></div>
        ${sel('inspect_type', '점검유형', ['출고전점검','반납후점검','정기점검','임시점검'])}
        <div class="field"><label>주행거리</label><input type="text" name="mileage" inputmode="numeric" placeholder="km"></div>
        ${sel('fuel_level', '연료잔량', ['F','3/4','1/2','1/4','E'])}
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">외관 점검</div>
      <div class="form-grid">
        ${sel('exterior', '외관상태', ['양호','경미흠집','손상있음'])}
        ${sel('interior', '실내상태', ['양호','보통','청소필요'])}
        ${sel('tire_status', '타이어', ['양호','교체필요','편마모'])}
        ${sel('light_status', '등화장치', ['정상','이상있음'])}
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">비품 확인</div>
      <div class="form-grid">
        ${chk('equip_navi', '네비')}
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
      <div class="form-section-title">주유/충전 정보</div>
      <div class="form-grid">
        <div class="field is-required"><label>일자</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"><label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
        <div class="field is-required"><label>제목</label><input type="text" name="title" placeholder="예: 주유 50L"></div>
        ${sel('fuel_type', '유종', ['휘발유','경유','LPG','전기충전'])}
        <div class="field"><label>리터/kWh</label><input type="text" name="fuel_amount" inputmode="numeric" placeholder="리터 또는 kWh"></div>
        <div class="field"><label>금액</label><input type="text" name="amount" inputmode="numeric" placeholder="0"></div>
        <div class="field"><label>주유소</label><input type="text" name="vendor" placeholder="주유소명"></div>
        <div class="field"><label>주행거리</label><input type="text" name="mileage" inputmode="numeric" placeholder="km"></div>
        <div class="field" style="grid-column:1/-1"><label>메모</label><textarea name="note" rows="2"></textarea></div>
      </div>
    </div>`;

  } else if (currentType === 'insurance') {
    sections = `
    <div class="form-section">
      <div class="form-section-title">보험 정보</div>
      <div class="form-grid">
        <div class="field is-required"><label>일자</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"><label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
        <div class="field is-required"><label>제목</label><input type="text" name="title" placeholder="예: 자동차보험 갱신"></div>
        ${sel('insurance_type', '구분', ['신규가입','갱신','보험청구','해지'])}
        <div class="field"><label>보험사</label><input type="text" name="insurance_company" placeholder="삼성화재, 현대해상 등"></div>
        <div class="field"><label>증권번호</label><input type="text" name="insurance_no" placeholder="증권번호"></div>
        <div class="field"><label>보험시작일</label><input type="date" name="insurance_start"></div>
        <div class="field"><label>보험만료일</label><input type="date" name="insurance_end"></div>
        <div class="field"><label>보험료</label><input type="text" name="amount" inputmode="numeric" placeholder="0"></div>
        <div class="field" style="grid-column:1/-1"><label>메모</label><textarea name="note" rows="2"></textarea></div>
      </div>
    </div>`;

  } else if (currentType === 'contact') {
    sections = `
    <div class="form-section">
      <div class="form-section-title">고객 응대</div>
      <div class="form-grid">
        <div class="field is-required"></label>일자</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"></label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
        <div class="field is-required"></label>제목</label><input type="text" name="title" placeholder="예: 대여료 문의"></div>
        <div class="field"></label>고객명</label><input type="text" name="customer_name"></div>
        <div class="field"></label>연락처</label><input type="text" name="customer_phone" placeholder="010-0000-0000"></div>
        ${sel('contact_type', '유형', ['일반문의','컴플레인','계약문의','정비요청','사고접수','반납협의','연장문의','기타'])}
        ${sel('contact_result', '처리결과', ['처리완료','진행중','보류','에스컬레이션'])}
        <div class="field"></label>담당자</label><input type="text" name="handler" placeholder="처리 담당자"></div>
        <div class="field" style="grid-column:1/-1"></label>통화내용</label><textarea name="note" rows="3" placeholder="상담 내용 기록"></textarea></div>
      </div>
    </div>`;

  } else {
    sections = `
    <div class="form-section">
      <div class="form-grid">
        <div class="field is-required"></label>일자</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"></label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
        <div class="field is-required"></label>제목</label><input type="text" name="title"></div>
        <div class="field"></label>금액</label><input type="text" name="amount" inputmode="numeric" placeholder="0"></div>
        <div class="field"></label>업체/장소</label><input type="text" name="vendor"></div>
        <div class="field" style="grid-column:1/-1"></label>메모</label><textarea name="note" rows="2"></textarea></div>
      </div>
    </div>`;
  }

  host.innerHTML = sections;

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

  // 차량번호 입력 → 차량정보 자동 표시
  const carInput = host.querySelector('[name="car_number"]');
  let carInfoEl = document.createElement('div');
  carInfoEl.style.cssText = 'font-size:var(--font-size-xs);color:var(--c-text-muted);padding:2px 0';
  carInput?.parentNode?.appendChild(carInfoEl);
  carInput?.addEventListener('input', () => {
    const car = carInput.value.trim();
    const a = assets.find(x => x.car_number === car);
    const c = contracts.find(x => x.car_number === car);
    if (a || c) {
      carInfoEl.innerHTML = [
        a?.car_model, a?.ext_color, c?.contractor_name, c?.contractor_phone
      ].filter(Boolean).join(' · ');
    } else {
      carInfoEl.textContent = '';
    }
  });
  if (lastCarNumber) { carInput.value = lastCarNumber; carInput.dispatchEvent(new Event('input')); }

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

  // btn-group 클릭 바인딩
  host.querySelectorAll('.btn-group').forEach(group => {
    const hidden = group.previousElementSibling;
    if (hidden) hidden.value = group.querySelector('.btn-opt.is-active')?.dataset.val || '';
    group.querySelectorAll('.btn-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        group.querySelectorAll('.btn-opt').forEach(o => o.classList.remove('is-active'));
        opt.classList.add('is-active');
        if (hidden) hidden.value = opt.dataset.val;
      });
    });
  });

  // 금액 콤마
  host.querySelectorAll('[name="amount"],[name="extra_mileage"],[name="extra_fuel"],[name="extra_damage"],[name="repair_estimate"]').forEach(inp => {
    inp.addEventListener('input', () => {
      const d = inp.value.replace(/[^\d]/g, '');
      inp.value = d ? Number(d).toLocaleString() : '';
    });
  });

  host.querySelector('[name="car_number"]')?.focus();
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

  // 정비: 소모품 체크 + 기능수리 내용 → title 자동 생성
  if (currentType === 'maint' && !data.title) {
    const parts = [];
    host.querySelectorAll('[name^="parts_"]:checked').forEach(cb => {
      parts.push(cb.name.replace('parts_', '').replace(/_/g, '/'));
    });
    const fix = data.fix_detail || '';
    const items = [...parts];
    if (fix) items.push(fix);
    data.title = items.length ? items.join(', ') : '';
    if (parts.length) data.parts_items = parts.join(', ');
  }

  if (!data.date || !data.car_number) {
    showToast('일자, 차량번호는 필수입니다', 'error');
    return;
  }
  if (!data.title) {
    if (currentType === 'maint') {
      showToast('교체 항목을 선택하거나 수리내용을 입력하세요', 'error');
    } else {
      showToast('제목을 입력하세요', 'error');
    }
    return;
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
      'accident_type', 'accident_other', 'accident_other_phone', 'fault_ratio',
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
      'wash_type', 'wash_cost', 'wash_vendor', 'inspect_type', 'tire_status', 'light_status',
      'fuel_type', 'fuel_amount',
      'insurance_action', 'age_before', 'age_after',
      'insurance_type', 'insurance_start', 'insurance_end',
      'check_gps', 'check_insurance_age', 'check_payment',
      'parts_items', 'next_maint_km', 'fix_detail', 'fix_cost', 'symptom',
      'product_status', 'product_maint', 'maint_detail', 'maint_cost', 'maint_vendor', 'expected_delivery',
      'repair_type', 'repair_in_date', 'repair_out_date', 'repair_estimate', 'insurance_amount', 'self_pay', 'repair_status',
      'collect_action', 'collect_result', 'promise_date',
      'force_reason', 'unpaid_amount', 'damage_claim', 'legal_action',
      'key_action', 'key_type', 'key_info',
      'customer_name', 'customer_phone', 'contact_type', 'contact_result', 'handler',
    ];
    extras.forEach(k => { if (data[k]) event[k] = data[k]; });
    await saveEvent(event);
    showToast('등록 완료', 'success');
    // 학습: 최근 차량 / 제목 / 즐겨찾기
    if (data.car_number) saveRecent(data.car_number);
    if (data.title) saveTitle(currentType, data.title);
    if (data.vendor) saveFavorite(data.vendor);
    if (data.delivery_location) saveFavorite(data.delivery_location);
    if (data.return_location) saveFavorite(data.return_location);
    // 연속 입력: 차량번호 유지
    lastCarNumber = data.car_number || '';
    renderForm();
  } catch (err) { showToast(err.message, 'error'); }
}

export async function mount() {
  watchAssets((items) => { assets = items; });
  watchContracts((items) => { contracts = items; });
  watchEvents((items) => { allEvents = items; });
  renderList();
  $('#opReset')?.addEventListener('click', resetForm);
  $('#opSubmit')?.addEventListener('click', submitForm);
}
