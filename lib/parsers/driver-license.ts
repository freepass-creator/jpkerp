/**
 * 운전면허증 OCR 파서
 *
 * 추출 항목:
 *   - 이름, 면허번호, 생년월일, 주소
 *   - 면허종류, 발급일, 유효기간
 *   - 주민등록번호 (앞자리)
 */

export interface DriverLicenseParsed {
  name: string;
  license_no: string;
  birth: string;
  address: string;
  license_type: string;
  issue_date: string;
  expiry_date: string;
  reg_no_front: string;   // 주민번호 앞 6자리
}

const pad = (n: number | string) => String(n).padStart(2, '0');

export function detectDriverLicense(text: string): boolean {
  const keywords = ['운전면허증', '면허번호', '면허종류', '운전면허', '도로교통공단'];
  return keywords.filter((k) => text.includes(k)).length >= 2;
}

export function parseDriverLicense(text: string): DriverLicenseParsed {
  const d: DriverLicenseParsed = {
    name: '', license_no: '', birth: '', address: '',
    license_type: '', issue_date: '', expiry_date: '', reg_no_front: '',
  };

  // 이름
  const name = text.match(/(?:성\s*명|이\s*름)\s*[:：]?\s*([가-힣]{2,5})/);
  if (name) d.name = name[1];
  if (!d.name) {
    // "홍길동" 패턴 - 면허번호 근처
    const n2 = text.match(/([가-힣]{2,4})\s*\d{2}-\d{2}-\d{6}-\d{2}/);
    if (n2) d.name = n2[1];
  }

  // 면허번호 (XX-XX-XXXXXX-XX)
  const licNo = text.match(/(\d{2})-(\d{2})-(\d{6})-(\d{2})/);
  if (licNo) d.license_no = licNo[0];
  if (!d.license_no) {
    const ln2 = text.match(/(\d{2}\s*-\s*\d{2}\s*-\s*\d{6}\s*-\s*\d{2})/);
    if (ln2) d.license_no = ln2[1].replace(/\s/g, '');
  }

  // 생년월일
  const birth = text.match(/(?:생년월일|생\s*년)\s*[:：]?\s*(\d{4})\s*[.\-년]\s*(\d{1,2})\s*[.\-월]\s*(\d{1,2})/);
  if (birth) d.birth = `${birth[1]}-${pad(birth[2])}-${pad(birth[3])}`;
  if (!d.birth) {
    // 주민번호 앞자리에서 추출
    const regNo = text.match(/(\d{6})\s*-\s*[1-4]/);
    if (regNo) {
      const r = regNo[1];
      const yy = Number(r.slice(0, 2));
      const mm = r.slice(2, 4);
      const dd = r.slice(4, 6);
      const year = yy >= 50 ? 1900 + yy : 2000 + yy;
      d.birth = `${year}-${mm}-${dd}`;
      d.reg_no_front = r;
    }
  }

  // 주민번호 앞자리
  if (!d.reg_no_front) {
    const regNo = text.match(/(\d{6})\s*-\s*[1-4*]/);
    if (regNo) d.reg_no_front = regNo[1];
  }

  // 주소
  const addr = text.match(/(?:주\s*소)\s*[:：]?\s*(.+?)(?:\n|면허|발급|$)/m);
  if (addr) d.address = addr[1].trim();
  if (!d.address) {
    // "도/시" 패턴
    const a2 = text.match(/((?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[^\n]{5,})/);
    if (a2) d.address = a2[1].trim();
  }

  // 면허종류
  const type = text.match(/(?:면허\s*종류|종\s*류)\s*[:：]?\s*(1종\s*[보대특]통|2종\s*[보대]통|1종|2종|[12]종\s*\S+)/);
  if (type) d.license_type = type[1].replace(/\s/g, '');
  if (!d.license_type) {
    const t2 = text.match(/(1종보통|1종대형|1종특수|2종보통|2종소형)/);
    if (t2) d.license_type = t2[1];
  }

  // 발급일
  const issue = text.match(/(?:발급\s*일|발급일자)\s*[:：]?\s*(\d{4})\s*[.\-년]\s*(\d{1,2})\s*[.\-월]\s*(\d{1,2})/);
  if (issue) d.issue_date = `${issue[1]}-${pad(issue[2])}-${pad(issue[3])}`;

  // 유효기간
  const expiry = text.match(/(?:유효\s*기간|적성검사)\s*[:：]?\s*(\d{4})\s*[.\-년]\s*(\d{1,2})\s*[.\-월]\s*(\d{1,2})/);
  if (expiry) d.expiry_date = `${expiry[1]}-${pad(expiry[2])}-${pad(expiry[3])}`;

  return d;
}
