/**
 * doc-generator.js — 문서 생성 (브라우저 인쇄/PDF)
 *
 * 새 탭에 HTML 문서 열기 → 인쇄(PDF 저장)
 */

/**
 * 계약사실확인서 생성
 * @param {object} data
 *   company_name  — 렌터카 회사명
 *   company_addr  — 회사 주소
 *   company_biz_no — 사업자번호
 *   company_ceo   — 대표자
 *   company_phone — 연락처
 *   car_number    — 차량번호
 *   car_model     — 차종
 *   vin           — 차대번호
 *   contractor_name — 임차인 이름
 *   contractor_phone — 임차인 연락처
 *   contractor_reg_no — 주민/사업자번호
 *   start_date    — 계약 시작일
 *   end_date      — 계약 종료일
 *   violation_date — 위반일 (과태료용)
 *   today         — 발급일
 */
export function generateRentalConfirmation(data) {
  const d = { ...data };
  d.today = d.today || new Date().toISOString().split('T')[0];

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>임대차계약 사실확인서</title>
<style>
  @page { size: A4; margin: 20mm 15mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Malgun Gothic', '맑은 고딕', sans-serif; font-size: 13px; color: #111; line-height: 1.8; padding: 40px; }
  .title { text-align: center; font-size: 22px; font-weight: bold; letter-spacing: 8px; margin-bottom: 30px; border-bottom: 2px solid #111; padding-bottom: 10px; }
  .subtitle { text-align: center; font-size: 14px; color: #444; margin-bottom: 30px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th, td { border: 1px solid #333; padding: 8px 12px; text-align: left; font-size: 13px; }
  th { background: #f5f5f5; width: 120px; font-weight: 600; text-align: center; }
  .section-title { font-size: 14px; font-weight: bold; margin: 24px 0 8px; padding-left: 4px; border-left: 3px solid #333; padding-left: 8px; }
  .body-text { margin: 20px 0; line-height: 2; text-indent: 1em; font-size: 14px; }
  .body-text b { font-size: 15px; }
  .stamp-area { margin-top: 40px; text-align: center; }
  .stamp-area .date { font-size: 15px; margin-bottom: 30px; }
  .stamp-area .company { font-size: 15px; line-height: 2.2; }
  .stamp-area .seal { display: inline-block; width: 60px; height: 60px; border: 2px solid #c00; border-radius: 50%; color: #c00; font-size: 11px; line-height: 60px; text-align: center; font-weight: bold; vertical-align: middle; margin-left: 8px; }
  .notice { margin-top: 30px; padding: 12px 16px; background: #f9f9f9; border: 1px solid #ddd; font-size: 11px; color: #666; line-height: 1.6; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>

<div class="title">임대차계약 사실확인서</div>

<div class="section-title">임대인 (렌터카 회사)</div>
<table>
  <tr><th>상 호</th><td>${d.company_name || ''}</td><th>대 표 자</th><td>${d.company_ceo || ''}</td></tr>
  <tr><th>사업자번호</th><td>${d.company_biz_no || ''}</td><th>연 락 처</th><td>${d.company_phone || ''}</td></tr>
  <tr><th>주 소</th><td colspan="3">${d.company_addr || ''}</td></tr>
</table>

<div class="section-title">임차인</div>
<table>
  <tr><th>성 명</th><td>${d.contractor_name || ''}</td><th>연 락 처</th><td>${d.contractor_phone || ''}</td></tr>
  <tr><th>등록번호</th><td colspan="3">${d.contractor_reg_no || ''}</td></tr>
</table>

<div class="section-title">임대차량</div>
<table>
  <tr><th>차량번호</th><td>${d.car_number || ''}</td><th>차 종</th><td>${d.car_model || ''}</td></tr>
  <tr><th>차대번호</th><td colspan="3">${d.vin || ''}</td></tr>
  <tr><th>계약기간</th><td colspan="3">${d.start_date || ''} ~ ${d.end_date || ''}</td></tr>
</table>

<div class="body-text">
  위 임대인은 위 임차인에게 상기 차량을 임대차계약에 의하여 대여하였음을 확인하며,<br>
  <b>${d.violation_date || '해당 일자'}</b> 현재 상기 차량의 실제 사용자(운전자)는<br>
  임차인 <b>${d.contractor_name || '___________'}</b> 임을 확인합니다.
</div>

<div class="body-text" style="font-size:12px;color:#555">
  본 확인서는 도로교통법에 의한 과태료 등의 운전자 변경부과를 위하여 발급하는 것이며,<br>
  위 내용이 사실과 다름없음을 확인합니다.
</div>

<div class="stamp-area">
  <div class="date">${formatDate(d.today)}</div>
  <div class="company">
    <div>${d.company_name || ''}</div>
    <div>대표이사 ${d.company_ceo || ''} <span class="seal">인</span></div>
  </div>
</div>

<div class="notice">
  ※ 본 확인서는 「자동차대여사업의 관리에 관한 규정」에 따라 발급된 것입니다.<br>
  ※ 허위 사실 기재 시 관련 법령에 의해 처벌받을 수 있습니다.
</div>

</body>
</html>`;

  openPrintWindow(html, '임대차계약_사실확인서');
}

// ── 인쇄 창 열기 ──
function openPrintWindow(html, title) {
  const w = window.open('', '_blank');
  if (!w) { alert('팝업이 차단되었습니다. 팝업을 허용해주세요.'); return; }
  w.document.write(html);
  w.document.close();
  w.document.title = title;
  w.onload = () => setTimeout(() => w.print(), 300);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${y}년 ${Number(m)}월 ${Number(d)}일`;
}
