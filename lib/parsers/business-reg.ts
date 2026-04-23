/**
 * 사업자등록증 OCR 파서 — 법인/개인사업자 공통
 *
 * 추출 필드:
 *   - 사업자등록번호 (XXX-XX-XXXXX)
 *   - 법인명/상호
 *   - 대표자명
 *   - 개업연월일
 *   - 법인등록번호 (XXXXXX-XXXXXXX)
 *   - 사업장 소재지
 *   - 본점 소재지
 *   - 업태 / 종목
 *   - 전자세금계산서 이메일
 *   - 구분 (법인사업자 / 개인사업자)
 */

export interface BusinessRegParsed {
  biz_no: string;          // 사업자등록번호 (158-81-03213)
  corp_no: string;         // 법인등록번호 (110111-8596368) — 개인은 빈칸
  partner_name: string;    // 법인명/상호
  ceo: string;             // 대표자명
  open_date: string;       // 개업일 (yyyy-mm-dd)
  address: string;         // 사업장 소재지
  hq_address: string;      // 본점 소재지
  industry: string;        // 업태 (콤마 구분)
  category: string;        // 종목 (콤마 구분)
  email: string;           // 전자세금계산서 이메일
  entity_type: 'corporate' | 'individual'; // 법인 / 개인
}

const BIZ_KEYWORDS = [
  '사업자등록증', '등록번호', '법인명', '대표자', '개업연월일',
  '사업장', '사업의 종류', '세무서', '업태', '종목',
];

export function detectBusinessReg(text: string): boolean {
  return BIZ_KEYWORDS.filter((k) => text.includes(k)).length >= 3;
}

export function parseBusinessReg(text: string): BusinessRegParsed {
  const d: BusinessRegParsed = {
    biz_no: '', corp_no: '', partner_name: '', ceo: '', open_date: '',
    address: '', hq_address: '', industry: '', category: '',
    email: '', entity_type: 'corporate',
  };

  // ── 법인/개인 구분 ──
  if (text.includes('개인사업자')) d.entity_type = 'individual';
  else if (text.includes('법인사업자')) d.entity_type = 'corporate';

  // ── 사업자등록번호 (XXX-XX-XXXXX) ──
  const bizM = text.match(/등록번호\s*[:：]?\s*(\d{3}\s*-\s*\d{2}\s*-\s*\d{5})/);
  if (bizM) d.biz_no = bizM[1].replace(/\s/g, '');

  // ── 법인등록번호 (XXXXXX-XXXXXXX) ──
  const corpM = text.match(/법인등록번호\s*[:：]?\s*(\d{6}\s*-\s*\d{7})/);
  if (corpM) d.corp_no = corpM[1].replace(/\s/g, '');

  // ── 법인명/상호 ──
  const nameM = text.match(/법\s*인\s*명\s*\(?\s*단체명\s*\)?\s*[:：]?\s*([^\n(]+?)(?:\s*\(|$|\n)/);
  if (nameM) d.partner_name = nameM[1].trim();
  else {
    // 개인사업자: "상호(대표자)"
    const tradeM = text.match(/상\s*호\s*[:：]?\s*([^\n]+?)(?:\n|$)/);
    if (tradeM) d.partner_name = tradeM[1].trim();
  }

  // ── 대표자 ──
  // "대표자(대표유형) : 박영현" (동일 라인)
  //  또는 PDF 텍스트 추출 시 라벨과 값이 분리돼 멀리 떨어지는 경우
  const ceoPatterns = [
    /대표자\s*\(?\s*대표유형\s*\)?\s*[:：]\s*([가-힣]{2,5})(?:\s|\n|$)/,
    /대표자\s*[:：]\s*([가-힣]{2,5})(?:\s|\n|$)/,
    /대표자\s*\(?\s*대표유형\s*\)?\s*[:：]?\s*[\s\S]{0,300}?\n\s*([가-힣]{2,5})(?:\s*\n|$)/m,
  ];
  for (const p of ceoPatterns) {
    const m = text.match(p);
    if (m) { d.ceo = m[1].trim(); break; }
  }
  // 폴백: 독립 라인에 2~5자 한글 이름만 있는 줄 (일반적인 라벨/지명은 제외)
  if (!d.ceo) {
    const EXCLUDE = new Set([
      '서비스', '자동', '법인', '대표', '개업', '사업', '발급', '비고',
      '업태', '종목', '여부', '소재지', '등록번호', '연월일', '세무서',
      '경기도', '서울시', '부산시', '대구시', '인천시', '광주시', '대전시',
      '울산시', '세종시', '연천군', '전곡읍', '은전로',
    ]);
    const lines = text.split('\n').map((l) => l.trim());
    const candidate = lines.find((l) => /^[가-힣]{2,5}$/.test(l) && !EXCLUDE.has(l));
    if (candidate) d.ceo = candidate;
  }

  // ── 개업연월일 ──
  const openM = text.match(/개\s*업\s*연\s*월\s*일\s*[:：]?\s*(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (openM) {
    d.open_date = `${openM[1]}-${openM[2].padStart(2, '0')}-${openM[3].padStart(2, '0')}`;
  }

  // ── 사업장 소재지 ──
  const addrM = text.match(/사\s*업\s*장\s*소\s*재\s*지\s*[:：]?\s*([^\n]+)/);
  if (addrM) d.address = addrM[1].trim();

  // ── 본점 소재지 ──
  const hqM = text.match(/본\s*점\s*소\s*재\s*지\s*[:：]?\s*([^\n]+)/);
  if (hqM) d.hq_address = hqM[1].trim();

  // ── 업태 / 종목 ──
  // "업태 사업시설 관리, 사업지원 및 임대 서비스업\n비스업\n서비스\n서비스"
  // "종목 자동차 임대업(렌트카)\n중고자동차알선\n온라인정보제공"
  const industryBlock = text.match(/업\s*태\s*([\s\S]*?)(?:종\s*목|발\s*급\s*사\s*유|사업의 종류|$)/);
  if (industryBlock) {
    const lines = industryBlock[1].split('\n').map((s) => s.trim()).filter((s) => s && !s.includes('종목'));
    d.industry = lines.join(', ').replace(/,\s*,/g, ',').slice(0, 200);
  }

  const categoryBlock = text.match(/종\s*목\s*([\s\S]*?)(?:발\s*급\s*사\s*유|사업자 단위|$)/);
  if (categoryBlock) {
    const lines = categoryBlock[1].split('\n').map((s) => s.trim()).filter((s) => s && !s.includes('발급'));
    d.category = lines.join(', ').replace(/,\s*,/g, ',').slice(0, 200);
  }

  // ── 이메일 ──
  const emailM = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailM) d.email = emailM[1];

  return d;
}
