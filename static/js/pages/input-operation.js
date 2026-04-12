/**
 * pages/input-operation.js — 운영등록
 *
 * 좌: 유형 목록 (정비/사고/과태료/출고반납)
 * 우: 선택한 유형의 입력 폼 + 등록
 */
import { saveEvent } from '../firebase/events.js';
import { watchAssets } from '../firebase/assets.js';
import { showToast } from '../core/toast.js';

const $ = (s) => document.querySelector(s);

const DEFAULT_TYPES = [
  { key: 'maintenance', label: '정비',     icon: '🔧', sub: '차량 정비/소모품 교환', direction: 'out' },
  { key: 'accident',    label: '사고',     icon: '💥',  sub: '사고 발생/처리 기록', direction: 'out' },
  { key: 'penalty',     label: '과태료',   icon: '🚫', sub: '교통 과태료/위반', direction: 'out' },
  { key: 'delivery',    label: '출고(인도)', icon: '🚗', sub: '차량 인도',   direction: 'out' },
  { key: 'return',      label: '반납(회수)', icon: '🔙', sub: '차량 회수',   direction: 'in' },
  { key: 'transfer',    label: '이동',       icon: '🔄', sub: '차량 이동/배차', direction: 'out' },
  { key: 'key',         label: '키관리',     icon: '🔑', sub: '키 수령/반납/분실', direction: 'out' },
  { key: 'contact',     label: '고객응대',   icon: '📞', sub: '통화/상담/컴플레인', direction: 'out' },
];

const ORDER_KEY = 'jpk.op.order';
function loadTypes() {
  try {
    const saved = JSON.parse(localStorage.getItem(ORDER_KEY));
    if (saved?.length) {
      return saved.map(k => DEFAULT_TYPES.find(t => t.key === k)).filter(Boolean);
    }
  } catch {}
  return [...DEFAULT_TYPES];
}
function saveOrder(types) {
  localStorage.setItem(ORDER_KEY, JSON.stringify(types.map(t => t.key)));
}
let TYPES = loadTypes();

let assets = [];
let currentType = null;

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

  // 유형별 폼 생성
  let sections = '';

  if (currentType === 'maintenance') {
    sections = `
    <div class="form-section">
      <div class="form-section-title">정비 정보</div>
      <div class="form-grid">
        <div class="field is-required"><label>일자</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"><label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
        <div class="field is-required"><label>정비내용</label><input type="text" name="title" placeholder="예: 엔진오일 교환"></div>
        <div class="field"><label>정비유형</label><select name="maint_type"><option value="정기점검">정기점검</option><option value="소모품교체">소모품교체</option><option value="수리">수리</option><option value="판금/도색">판금/도색</option><option value="타이어">타이어</option><option value="기타">기타</option></select></div>
        <div class="field"><label>금액</label><input type="text" name="amount" inputmode="numeric" placeholder="0"></div>
        <div class="field"><label>정비업체</label><input type="text" name="vendor" placeholder="카센터명"></div>
        <div class="field"><label>주행거리</label><input type="text" name="mileage" inputmode="numeric" placeholder="km"></div>
        <div class="field"><label>다음정비예정</label><input type="date" name="next_maint_date"></div>
        <div class="field" style="grid-column:1/-1"><label>메모</label><textarea name="note" rows="2"></textarea></div>
      </div>
    </div>`;

  } else if (currentType === 'accident') {
    sections = `
    <div class="form-section">
      <div class="form-section-title">사고 정보</div>
      <div class="form-grid">
        <div class="field is-required"><label>사고일시</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"><label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
        <div class="field is-required"><label>사고내용</label><input type="text" name="title" placeholder="예: 후방추돌"></div>
        <div class="field"><label>사고유형</label><select name="accident_type"><option value="자차">자차</option><option value="대물">대물</option><option value="대인">대인</option><option value="자차+대물">자차+대물</option><option value="자차+대인">자차+대인</option></select></div>
        <div class="field"><label>사고장소</label><input type="text" name="vendor" placeholder="사고 발생 위치"></div>
        <div class="field"><label>과실비율</label><input type="text" name="fault_ratio" placeholder="예: 100:0, 70:30"></div>
        <div class="field"><label>상대방</label><input type="text" name="accident_other" placeholder="상대방 이름/차량"></div>
        <div class="field"><label>상대방연락처</label><input type="text" name="accident_other_phone" placeholder="010-0000-0000"></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">보험 처리</div>
      <div class="form-grid">
        <div class="field"><label>보험사</label><input type="text" name="insurance_company" placeholder="삼성화재, 현대해상 등"></div>
        <div class="field"><label>보험접수번호</label><input type="text" name="insurance_no" placeholder="접수번호"></div>
        <div class="field"><label>수리예상금액</label><input type="text" name="repair_estimate" inputmode="numeric" placeholder="0"></div>
        <div class="field"><label>수리업체</label><input type="text" name="repair_shop" placeholder="수리 맡긴 곳"></div>
        <div class="field"><label>수리기간(예상)</label><input type="text" name="repair_days" placeholder="일"></div>
        <div class="field"><label>대차여부</label><select name="rental_car"><option value="">미정</option><option value="Y">대차 제공</option><option value="N">대차 없음</option></select></div>
        <div class="field" style="grid-column:1/-1"><label>메모</label><textarea name="note" rows="2"></textarea></div>
      </div>
    </div>`;

  } else if (currentType === 'penalty') {
    sections = `
    <div class="form-section">
      <div class="form-section-title">과태료 정보</div>
      <div class="form-grid">
        <div class="field is-required"><label>위반일자</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"><label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
        <div class="field is-required"><label>위반내용</label><input type="text" name="title" placeholder="예: 주정차위반, 속도위반"></div>
        <div class="field"><label>위반유형</label><select name="penalty_type"><option value="주정차위반">주정차위반</option><option value="속도위반">속도위반</option><option value="신호위반">신호위반</option><option value="버스전용">버스전용</option><option value="기타">기타</option></select></div>
        <div class="field"><label>과태료금액</label><input type="text" name="amount" inputmode="numeric" placeholder="0"></div>
        <div class="field"><label>위반장소</label><input type="text" name="vendor" placeholder="위반 위치"></div>
        <div class="field"><label>납부기한</label><input type="date" name="due_date"></div>
        <div class="field"><label>부담자</label><select name="payer"><option value="고객">고객 부담</option><option value="회사">회사 부담</option></select></div>
        <div class="field"><label>고객명</label><input type="text" name="customer_name" placeholder="해당 고객"></div>
        <div class="field"><label>납부여부</label><select name="paid_status"><option value="미납">미납</option><option value="납부완료">납부완료</option></select></div>
        <div class="field" style="grid-column:1/-1"><label>메모</label><textarea name="note" rows="2"></textarea></div>
      </div>
    </div>`;

  } else if (currentType === 'delivery') {
    sections = `
    <div class="form-section">
      <div class="form-section-title">출고 기본</div>
      <div class="form-grid">
        <div class="field is-required"><label>출고일</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"><label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
        <div class="field is-required"><label>제목</label><input type="text" name="title" placeholder="예: 홍길동 출고"></div>
        <div class="field"><label>인도장소</label><input type="text" name="delivery_location" placeholder="사무실/고객방문/탁송"></div>
        <div class="field"><label>인수자명</label><input type="text" name="receiver_name"></div>
        <div class="field"><label>인수자연락처</label><input type="text" name="receiver_phone" placeholder="010-0000-0000"></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">차량 상태</div>
      <div class="form-grid">
        <div class="field"><label>주행거리</label><input type="text" name="mileage" inputmode="numeric" placeholder="km"></div>
        <div class="field"><label>연료잔량</label><select name="fuel_level"><option value="F">F (만탱)</option><option value="3/4">3/4</option><option value="1/2">1/2</option><option value="1/4">1/4</option><option value="E">E (공)</option></select></div>
        <div class="field"><label>외관상태</label><select name="exterior"><option value="양호">양호</option><option value="경미흠집">경미흠집</option><option value="손상있음">손상있음</option></select></div>
        <div class="field"><label>실내상태</label><select name="interior"><option value="양호">양호</option><option value="보통">보통</option><option value="청소필요">청소필요</option></select></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">키 인도</div>
      <div class="form-grid">
        <div class="field"><label>메인키</label><input type="number" name="key_main_count" value="1" min="0"></div>
        <div class="field"><label>보조키</label><input type="number" name="key_sub_count" value="0" min="0"></div>
        <div class="field"><label>카드키</label><input type="number" name="key_card_count" value="0" min="0"></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">서류 확인</div>
      <div class="form-grid">
        ${chk('check_contract', '계약서 수령')}
        ${chk('check_license', '면허증 확인')}
        ${chk('check_insurance', '보험 확인')}
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
        <div class="field" style="grid-column:1/-1"><label>특이사항</label><textarea name="note" rows="2" placeholder="기스 위치, 고객 요청사항 등"></textarea></div>
      </div>
    </div>`;

  } else if (currentType === 'return') {
    sections = `
    <div class="form-section">
      <div class="form-section-title">반납 기본</div>
      <div class="form-grid">
        <div class="field is-required"><label>반납일</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"><label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
        <div class="field is-required"><label>제목</label><input type="text" name="title" placeholder="예: 홍길동 반납"></div>
        <div class="field"><label>반납장소</label><input type="text" name="return_location" placeholder="사무실/고객방문/탁송"></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">차량 상태</div>
      <div class="form-grid">
        <div class="field"><label>주행거리</label><input type="text" name="mileage" inputmode="numeric" placeholder="km"></div>
        <div class="field"><label>연료잔량</label><select name="fuel_level"><option value="F">F (만탱)</option><option value="3/4">3/4</option><option value="1/2">1/2</option><option value="1/4">1/4</option><option value="E">E (공)</option></select></div>
        <div class="field"><label>차량상태</label><select name="car_condition"><option value="양호">양호</option><option value="경미손상">경미손상</option><option value="수리필요">수리필요</option><option value="사고차">사고차</option></select></div>
        <div class="field"><label>세차상태</label><select name="wash_status"><option value="깨끗">깨끗</option><option value="보통">보통</option><option value="세차필요">세차필요</option></select></div>
        <div class="field"><label>외관상태</label><select name="exterior"><option value="양호">양호</option><option value="경미흠집">경미흠집</option><option value="손상있음">손상있음</option></select></div>
        <div class="field"><label>실내상태</label><select name="interior"><option value="양호">양호</option><option value="보통">보통</option><option value="청소필요">청소필요</option></select></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">키 회수</div>
      <div class="form-grid">
        <div class="field"><label>메인키</label><input type="number" name="key_main_count" value="1" min="0"></div>
        <div class="field"><label>보조키</label><input type="number" name="key_sub_count" value="0" min="0"></div>
        <div class="field"><label>카드키</label><input type="number" name="key_card_count" value="0" min="0"></div>
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
      <div class="form-section-title">추가청구</div>
      <div class="form-grid">
        <div class="field"><label>과주행 추가금</label><input type="text" name="extra_mileage" inputmode="numeric" placeholder="0"></div>
        <div class="field"><label>연료부족 추가금</label><input type="text" name="extra_fuel" inputmode="numeric" placeholder="0"></div>
        <div class="field"><label>손상수리 추가금</label><input type="text" name="extra_damage" inputmode="numeric" placeholder="0"></div>
        <div class="field"><label>다음예정</label><select name="next_plan"><option value="재출고">재출고</option><option value="정비입고">정비입고</option><option value="상품화">상품화</option><option value="매각">매각</option></select></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-grid">
        <div class="field" style="grid-column:1/-1"><label>특이사항</label><textarea name="note" rows="2" placeholder="손상부위, 추가청구 사유 등"></textarea></div>
      </div>
    </div>`;

  } else if (currentType === 'transfer') {
    sections = `
    <div class="form-section">
      <div class="form-section-title">이동 정보</div>
      <div class="form-grid">
        <div class="field is-required"><label>이동일</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"><label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
        <div class="field is-required"><label>제목</label><input type="text" name="title" placeholder="예: 김포→인천 배차"></div>
        <div class="field"><label>출발지</label><input type="text" name="from_location" placeholder="출발 위치"></div>
        <div class="field"><label>도착지</label><input type="text" name="to_location" placeholder="도착 위치"></div>
        <div class="field"><label>이동사유</label><select name="transfer_reason"><option value="배차">배차</option><option value="정비입고">정비입고</option><option value="탁송">탁송</option><option value="기타">기타</option></select></div>
        <div class="field"><label>주행거리</label><input type="text" name="mileage" inputmode="numeric" placeholder="km"></div>
        <div class="field"><label>비용</label><input type="text" name="amount" inputmode="numeric" placeholder="0"></div>
        <div class="field" style="grid-column:1/-1"><label>메모</label><textarea name="note" rows="2"></textarea></div>
      </div>
    </div>`;

  } else if (currentType === 'key') {
    sections = `
    <div class="form-section">
      <div class="form-section-title">키 관리</div>
      <div class="form-grid">
        <div class="field is-required"><label>일자</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"><label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
        <div class="field is-required"><label>제목</label><input type="text" name="title" placeholder="예: 메인키 수령"></div>
        <div class="field"><label>구분</label><select name="key_action"><option value="수령">수령</option><option value="반납">반납</option><option value="분실">분실</option><option value="복제">복제</option></select></div>
        <div class="field"><label>키종류</label><select name="key_type"><option value="메인키">메인키</option><option value="보조키">보조키</option><option value="카드키">카드키</option><option value="기타">기타</option></select></div>
        <div class="field"><label>키번호/위치</label><input type="text" name="key_info" placeholder="키번호 또는 보관위치"></div>
        <div class="field" style="grid-column:1/-1"><label>메모</label><textarea name="note" rows="2"></textarea></div>
      </div>
    </div>`;

  } else if (currentType === 'contact') {
    sections = `
    <div class="form-section">
      <div class="form-section-title">고객 응대</div>
      <div class="form-grid">
        <div class="field is-required"><label>일자</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"><label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
        <div class="field is-required"><label>제목</label><input type="text" name="title" placeholder="예: 대여료 문의"></div>
        <div class="field"><label>고객명</label><input type="text" name="customer_name"></div>
        <div class="field"><label>연락처</label><input type="text" name="customer_phone" placeholder="010-0000-0000"></div>
        <div class="field"><label>유형</label><select name="contact_type"><option value="일반문의">일반문의</option><option value="컴플레인">컴플레인</option><option value="계약문의">계약문의</option><option value="정비요청">정비요청</option><option value="사고접수">사고접수</option><option value="반납협의">반납협의</option><option value="연장문의">연장문의</option><option value="기타">기타</option></select></div>
        <div class="field"><label>처리결과</label><select name="contact_result"><option value="처리완료">처리완료</option><option value="진행중">진행중</option><option value="보류">보류</option><option value="에스컬레이션">에스컬레이션</option></select></div>
        <div class="field"><label>담당자</label><input type="text" name="handler" placeholder="처리 담당자"></div>
        <div class="field" style="grid-column:1/-1"><label>통화내용</label><textarea name="note" rows="3" placeholder="상담 내용 기록"></textarea></div>
      </div>
    </div>`;

  } else {
    sections = `
    <div class="form-section">
      <div class="form-grid">
        <div class="field is-required"><label>일자</label><input type="date" name="date" value="${today}"></div>
        <div class="field is-required"><label>차량번호</label><input type="text" name="car_number" list="opCarList" autocomplete="off">${carList}</div>
        <div class="field is-required"><label>제목</label><input type="text" name="title"></div>
        <div class="field"><label>금액</label><input type="text" name="amount" inputmode="numeric" placeholder="0"></div>
        <div class="field"><label>업체/장소</label><input type="text" name="vendor"></div>
        <div class="field" style="grid-column:1/-1"><label>메모</label><textarea name="note" rows="2"></textarea></div>
      </div>
    </div>`;
  }

  host.innerHTML = sections;
        ${currentType === 'accident' ? `
        <div class="field"><label>사고유형</label><select name="accident_type"><option value="자차">자차</option><option value="대물">대물</option><option value="대인">대인</option><option value="자차+대물">자차+대물</option></select></div>
        <div class="field"><label>상대방</label><input type="text" name="accident_other" placeholder="상대방 정보"></div>
        <div class="field"><label>보험사</label><input type="text" name="insurance_company" placeholder="삼성화재, 현대해상 등"></div>
        <div class="field"><label>보험접수번호</label><input type="text" name="insurance_no" placeholder="접수번호"></div>
        ` : ''}
        ${currentType === 'delivery' ? `
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">인도 정보</div>
      <div class="form-grid">
        <div class="field"><label>인도장소</label><input type="text" name="delivery_location" placeholder="사무실/고객방문/탁송"></div>
        <div class="field"><label>인수자명</label><input type="text" name="receiver_name" placeholder="인수자 이름"></div>
        <div class="field"><label>인수자연락처</label><input type="text" name="receiver_phone" placeholder="010-0000-0000"></div>
        <div class="field"><label>주행거리</label><input type="text" name="mileage" inputmode="numeric" placeholder="km"></div>
        <div class="field"><label>연료잔량</label><select name="fuel_level"><option value="F">F (만탱)</option><option value="3/4">3/4</option><option value="1/2">1/2</option><option value="1/4">1/4</option><option value="E">E (공)</option></select></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">키 인도</div>
      <div class="form-grid">
        <div class="field"><label>메인키</label><input type="number" name="key_main_count" value="1" min="0"></div>
        <div class="field"><label>보조키</label><input type="number" name="key_sub_count" value="0" min="0"></div>
        <div class="field"><label>카드키</label><input type="number" name="key_card_count" value="0" min="0"></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">서류 확인</div>
      <div class="form-grid">
        <div class="field"><label style="display:flex;align-items:center;gap:6px"><input type="checkbox" name="check_contract" value="Y"> 계약서 수령</label></div>
        <div class="field"><label style="display:flex;align-items:center;gap:6px"><input type="checkbox" name="check_license" value="Y"> 면허증 확인</label></div>
        <div class="field"><label style="display:flex;align-items:center;gap:6px"><input type="checkbox" name="check_insurance" value="Y"> 보험 확인</label></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">비품 확인</div>
      <div class="form-grid">
        <div class="field"><label style="display:flex;align-items:center;gap:6px"><input type="checkbox" name="equip_navi" value="Y"> 네비</label></div>
        <div class="field"><label style="display:flex;align-items:center;gap:6px"><input type="checkbox" name="equip_blackbox" value="Y"> 블랙박스</label></div>
        <div class="field"><label style="display:flex;align-items:center;gap:6px"><input type="checkbox" name="equip_hipass" value="Y"> 하이패스</label></div>
        <div class="field"><label style="display:flex;align-items:center;gap:6px"><input type="checkbox" name="equip_charger" value="Y"> 충전케이블</label></div>
        <div class="field"><label style="display:flex;align-items:center;gap:6px"><input type="checkbox" name="equip_triangle" value="Y"> 삼각대</label></div>
        <div class="field"><label style="display:flex;align-items:center;gap:6px"><input type="checkbox" name="equip_fire" value="Y"> 소화기</label></div>
      </div>
        ` : ''}
        ${currentType === 'return' ? `
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">반납 정보</div>
      <div class="form-grid">
        <div class="field"><label>반납장소</label><input type="text" name="return_location" placeholder="사무실/고객방문/탁송"></div>
        <div class="field"><label>주행거리</label><input type="text" name="mileage" inputmode="numeric" placeholder="km"></div>
        <div class="field"><label>연료잔량</label><select name="fuel_level"><option value="F">F (만탱)</option><option value="3/4">3/4</option><option value="1/2">1/2</option><option value="1/4">1/4</option><option value="E">E (공)</option></select></div>
        <div class="field"><label>차량상태</label><select name="car_condition"><option value="양호">양호</option><option value="경미손상">경미손상</option><option value="수리필요">수리필요</option><option value="사고차">사고차</option></select></div>
        <div class="field"><label>세차상태</label><select name="wash_status"><option value="깨끗">깨끗</option><option value="보통">보통</option><option value="세차필요">세차필요</option></select></div>
        <div class="field"><label>다음예정</label><select name="next_plan"><option value="재출고">재출고</option><option value="정비입고">정비입고</option><option value="상품화">상품화</option><option value="매각">매각</option></select></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">키 회수</div>
      <div class="form-grid">
        <div class="field"><label>메인키</label><input type="number" name="key_main_count" value="1" min="0"></div>
        <div class="field"><label>보조키</label><input type="number" name="key_sub_count" value="0" min="0"></div>
        <div class="field"><label>카드키</label><input type="number" name="key_card_count" value="0" min="0"></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">추가청구</div>
      <div class="form-grid">
        <div class="field"><label>과주행 추가금</label><input type="text" name="extra_mileage" inputmode="numeric" placeholder="0"></div>
        <div class="field"><label>연료부족 추가금</label><input type="text" name="extra_fuel" inputmode="numeric" placeholder="0"></div>
        <div class="field"><label>손상수리 추가금</label><input type="text" name="extra_damage" inputmode="numeric" placeholder="0"></div>
      </div>
        ` : ''}
        ${currentType === 'key' ? `
        <div class="field"><label>구분</label><select name="key_action"><option value="수령">수령</option><option value="반납">반납</option><option value="분실">분실</option><option value="복제">복제</option></select></div>
        <div class="field"><label>키종류</label><select name="key_type"><option value="메인키">메인키</option><option value="보조키">보조키</option><option value="카드키">카드키</option><option value="기타">기타</option></select></div>
        <div class="field"><label>키번호/위치</label><input type="text" name="key_info" placeholder="키번호 또는 보관위치"></div>
        ` : ''}
        ${currentType === 'contact' ? `
        <div class="field"><label>고객명</label><input type="text" name="customer_name" placeholder="고객명"></div>
        <div class="field"><label>연락처</label><input type="text" name="customer_phone" placeholder="010-0000-0000"></div>
        <div class="field"><label>유형</label><select name="contact_type"><option value="일반문의">일반문의</option><option value="컴플레인">컴플레인</option><option value="계약문의">계약문의</option><option value="정비요청">정비요청</option><option value="사고접수">사고접수</option><option value="반납협의">반납협의</option><option value="기타">기타</option></select></div>
        ` : ''}
        <div class="field" style="grid-column:1/-1"><label>메모</label><textarea name="note" rows="2"></textarea></div>
      </div>
    </div>
  `;

  const amtInput = host.querySelector('[name="amount"]');
  amtInput?.addEventListener('input', () => {
    const d = amtInput.value.replace(/[^\d]/g, '');
    amtInput.value = d ? Number(d).toLocaleString() : '';
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

  if (!data.date || !data.car_number || !data.title) {
    showToast('일자, 차량번호, 제목은 필수입니다', 'error');
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
      'key_action', 'key_type', 'key_info',
      'customer_name', 'customer_phone', 'contact_type', 'contact_result', 'handler',
    ];
    extras.forEach(k => { if (data[k]) event[k] = data[k]; });
    await saveEvent(event);
    showToast('등록 완료', 'success');
    renderForm();
  } catch (err) { showToast(err.message, 'error'); }
}

export async function mount() {
  watchAssets((items) => { assets = items; });
  renderList();
  $('#opReset')?.addEventListener('click', resetForm);
  $('#opSubmit')?.addEventListener('click', submitForm);
}
