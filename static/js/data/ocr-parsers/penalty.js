/**
 * ocr-parsers/penalty.js — 과태료/통행료/범칙금 고지서 OCR 파서
 *
 * 실제 OCR 출력 기반으로 튜닝됨
 */

export function detect(text) {
  const keywords = ['과태료', '통행료', '납부고지', '위반사실', '범칙금', '고지서', '납부기한', '위반차량', '통행장소', '납부안내'];
  return keywords.filter(k => text.includes(k)).length >= 2;
}

export function parse(text, lines) {
  const data = {
    doc_type: '', notice_no: '', issuer: '', issue_date: '',
    payer_name: '', car_number: '', date: '', location: '',
    description: '', law_article: '',
    penalty_amount: 0, fine_amount: 0, demerit_points: 0,
    toll_amount: 0, surcharge_amount: 0, amount: 0,
    due_date: '', opinion_period: '', pay_account: '',
  };

  // ── 유형 판별 ──
  if (/통행료\s*납부고지/.test(text)) data.doc_type = '통행료';
  else if (/속도/.test(text) && /과태료/.test(text)) data.doc_type = '속도위반';
  else if (/주정차|주차위반/.test(text)) data.doc_type = '주정차위반';
  else if (/신호/.test(text) && /과태료/.test(text)) data.doc_type = '신호위반';
  else if (/과태료/.test(text)) data.doc_type = '과태료';
  else data.doc_type = '기타';

  // ── 차량번호 ──
  // 여러 패턴: "161호1063", "161호 1063", "161 호 1063"
  const carPatterns = [
    /위반\s*차량[\s\S]{0,30}?(\d{2,3})\s*호?\s*(\d{4})/,
    /차량\s*번호[\s\S]{0,30}?(\d{2,3})\s*호?\s*(\d{4})/,
  ];
  for (const p of carPatterns) {
    const m = text.match(p);
    if (m) { data.car_number = `${m[1]}호${m[2]}`; break; }
  }
  if (!data.car_number) {
    // 일반 차량번호 패턴
    const cm = text.match(/(\d{2,3})[가-힣]\s?(\d{4})/);
    if (cm) data.car_number = cm[0].replace(/\s/g, '');
  }

  // ── 납부자 (회사명) ──
  // "대상자: 주식회사 ..." 또는 "성 명 주식회사 ..." 또는 "납 부 자 주식회사 ..."
  const payerPatterns = [
    /대\s*상\s*자\s*[:：]?\s*(주식회사\s*\S+)/,
    /성\s*명\s*(주식회사\s*\S+)/,
    /납\s*부\s*자\s*(주식회사\s*\S+)/,
    /대\s*상\s*자\s*[:：]?\s*(.+?)(?:\n|$)/m,
    /성\s*명\s*[:：]?\s*(.+?)(?:\n|$)/m,
  ];
  for (const p of payerPatterns) {
    const m = text.match(p);
    if (m) {
      let name = m[1].trim();
      // "주식회사 손오공렌터카" 에서 뒤에 붙은 쓰레기 제거
      name = name.replace(/\s*(위반|귀하|貴下|귀하|주\s*소).*$/, '').trim();
      if (name.length >= 3) { data.payer_name = name; break; }
    }
  }

  // ── 위반/통행 일시 ──
  // 과태료: "2026년 04월 02일 09시 49분"
  const dateP1 = text.match(/위반\s*일\s*시\s*[\s\S]{0,10}?(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*(\d{1,2})\s*시\s*(\d{1,2})\s*분/);
  if (dateP1) {
    data.date = `${dateP1[1]}-${pad(dateP1[2])}-${pad(dateP1[3])} ${pad(dateP1[4])}:${pad(dateP1[5])}`;
  }
  // 통행료: "2026-01-26 00:03:33"
  if (!data.date) {
    const dateP2 = text.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
    if (dateP2) data.date = `${dateP2[1]}-${dateP2[2]}-${dateP2[3]} ${dateP2[4]}:${dateP2[5]}`;
  }

  // ── 장소 ──
  if (data.doc_type === '통행료') {
    // 통행료: "통행장소" 헤더 다음에 나오는 장소명 (테이블)
    // OCR에서 "청라하늘대교" 가 "통행장소" 와 같은 줄 또는 바로 다음
    const tollLoc = text.match(/통행장소[\s\S]{0,20}?(청라\S+|인천\S+|서울\S+|부산\S+|영동\S+|서해\S+|경부\S+|호남\S+|\S+대교|\S+터널|\S+IC|\S+고속)/);
    if (tollLoc) data.location = tollLoc[1];
    // 또는 영업소 이름에서
    if (!data.location) {
      const office = text.match(/(\S+)\s*영업소/);
      if (office) data.location = office[1];
    }
  } else {
    // 과태료: "위반장소" 키워드 뒤 여러 줄에 걸쳐 있을 수 있음
    for (let i = 0; i < lines.length; i++) {
      if (/위반\s*장\s*소/.test(lines[i])) {
        // 같은 줄에 값이 있으면
        const val = lines[i].replace(/위반\s*장\s*소\s*/, '').trim();
        if (val.length > 3) {
          // 다음 줄도 장소의 연속일 수 있음
          let loc = val;
          if (i + 1 < lines.length && !/위반\s*내용|적용|일련/.test(lines[i + 1])) {
            loc += ' ' + lines[i + 1].trim();
          }
          data.location = loc.trim();
        } else if (i + 1 < lines.length) {
          let loc = lines[i + 1].trim();
          if (i + 2 < lines.length && !/위반\s*내용|적용|일련/.test(lines[i + 2])) {
            loc += ' ' + lines[i + 2].trim();
          }
          data.location = loc;
        }
        break;
      }
    }
  }

  // ── 위반내용 ──
  for (let i = 0; i < lines.length; i++) {
    if (/위반\s*내\s*용/.test(lines[i])) {
      // "위반내용" 뒤의 값 — 장소와 구분
      // 속도위반: "속도(제한:50Km 주행:89Km 초과:39Km)"
      // 위반내용이 장소 다음에 나올 수 있으므로, 위반장소와 겹치지 않게
      const val = lines[i].replace(/위반\s*내\s*용\s*/, '').trim();
      if (val.length > 2 && !/부산|서울|인천|대구|광주|대전|울산|경기|강원/.test(val)) {
        data.description = val;
      } else {
        // 다음 줄들에서 속도 등 찾기
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          if (/속도|주정차|신호|중앙선|차선/.test(lines[j])) {
            data.description = lines[j].trim();
            break;
          }
        }
      }
      break;
    }
  }
  // 속도위반 직접 패턴
  if (!data.description) {
    const speedMatch = text.match(/속도\s*\(\s*제한\s*[:：]?\s*\d+\s*[Kk]?[Mm]?\s*주행\s*[:：]?\s*\d+\s*[Kk]?[Mm]?\s*초과\s*[:：]?\s*\d+\s*[Kk]?[Mm]?\s*\)/);
    if (speedMatch) data.description = speedMatch[0];
  }

  // ── 적용법조 ──
  const lawMatch = text.match(/적용\s*법\s*조\s*(도로교통법[^\n]{3,30})/);
  if (lawMatch) data.law_article = lawMatch[1].trim();

  // ── 과태료 금액 ──
  const penMatch = text.match(/과태료\s*[:：]?\s*([\d,]+)\s*원/);
  if (penMatch) data.penalty_amount = toNum(penMatch[1]);

  // ── 범칙금 + 벌점 ──
  const fineMatch = text.match(/범칙금\s*[:：]?\s*([\d,]+)\s*원\s*\(\s*벌\s*점\s*[:：]?\s*(\d+)\s*점?\s*\)/);
  if (fineMatch) {
    data.fine_amount = toNum(fineMatch[1]);
    data.demerit_points = Number(fineMatch[2]);
  } else {
    const fineOnly = text.match(/범칙금\s*[:：]?\s*([\d,]+)\s*원/);
    if (fineOnly) data.fine_amount = toNum(fineOnly[1]);
    const ptMatch = text.match(/벌\s*점\s*[:：]?\s*(\d+)\s*점/);
    if (ptMatch) data.demerit_points = Number(ptMatch[1]);
  }

  // ── 통행료 ──
  if (data.doc_type === '통행료') {
    // "납부할 금액" 에서 추출
    const payAmtMatch = text.match(/납부할\s*금\s*액[\s\S]{0,30}?([\d,]+)/);
    if (payAmtMatch) data.toll_amount = toNum(payAmtMatch[1]);
    // 또는 테이블에서 숫자 (통행료 컬럼)
    if (!data.toll_amount) {
      const tollInTable = text.match(/청라하늘대교\s*([\d,]+)/);
      if (tollInTable) data.toll_amount = toNum(tollInTable[1]);
    }
    // 부가통행료
    const surMatch = text.match(/([\d,]+)\s*원?\s*\)?\s*이\s*부과/);
    if (surMatch) data.surcharge_amount = toNum(surMatch[1]);
  }

  // ── 납부기한 ──
  const dueMatch = text.match(/(?:납부|사전)[\s\S]{0,10}?기\s*한[\s\S]{0,20}?(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (dueMatch) data.due_date = `${dueMatch[1]}-${pad(dueMatch[2])}-${pad(dueMatch[3])}`;

  // ── 의견제출기한 ──
  const opMatch = text.match(/의견제출[\s\S]{0,20}?(\d{4})[.\s]*(\d{1,2})[.\s]*(\d{1,2})[.\s]*~[.\s]*(\d{4})[.\s]*(\d{1,2})[.\s]*(\d{1,2})/);
  if (opMatch) data.opinion_period = `${opMatch[1]}-${pad(opMatch[2])}-${pad(opMatch[3])} ~ ${opMatch[4]}-${pad(opMatch[5])}-${pad(opMatch[6])}`;

  // ── 고지서번호 ──
  const noticeMatch = text.match(/(\d{4}[-‐\s]*\d{4}[-‐\s]*\d[-‐\s]*\d{3}[-‐\s]*\d{5,6}[-‐\s]*\d)/);
  if (noticeMatch) data.notice_no = noticeMatch[1].replace(/\s/g, '');
  if (!data.notice_no) {
    const noMatch = text.match(/NO\.\s*(\d+)/i);
    if (noMatch) data.notice_no = noMatch[1];
  }

  // ── 발행기관 ──
  const issuerMatch = text.match(/(\S+(?:경찰서|영업소|시청|구청|군청|대교|터널|고속도로))\s*(?:장|서장)?/);
  if (issuerMatch) data.issuer = issuerMatch[0].trim();

  // ── 발행일 ──
  const issDateMatch = text.match(/발\s*송\s*일\s*(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (issDateMatch) data.issue_date = `${issDateMatch[1]}-${pad(issDateMatch[2])}-${pad(issDateMatch[3])}`;
  if (!data.issue_date) {
    // 문서 하단 날짜
    const bottomDate = text.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*\n\s*\S+(?:경찰서|영업소)/);
    if (bottomDate) data.issue_date = `${bottomDate[1]}-${pad(bottomDate[2])}-${pad(bottomDate[3])}`;
  }

  // ── 납부계좌 ──
  const acctPatterns = [
    /(농협|국민|신한|우리|하나|기업|우체국)\s*은?\s*행?\s*([\d\-]{10,})/,
    /고객\s*가상\s*계좌\s*(농협|국민|신한|우리|하나)\s*은?\s*행?\s*([\d\-]{10,})/,
  ];
  for (const p of acctPatterns) {
    const m = text.match(p);
    if (m) { data.pay_account = `${m[1]} ${m[2]}`; break; }
  }

  // ── 통행료면 내용 자동 채움 ──
  if (data.doc_type === '통행료' && !data.description) {
    data.description = '통행료 미납';
  }

  // ── 최종 금액 ──
  data.amount = data.penalty_amount || data.toll_amount || 0;

  return data;
}

function pad(n) { return String(n).padStart(2, '0'); }
function toNum(s) { return Number(String(s).replace(/,/g, '')); }
