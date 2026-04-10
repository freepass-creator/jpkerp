/**
 * shinhan.js — 신한카드 이용내역 CSV 파서
 *
 * 컬럼 (예상):
 *   이용일자, 이용시간, 카드번호, 가맹점명, 업종, 이용금액, 할부, 메모
 */

const SYNONYMS = {
  date:   ['이용일자', '이용일', '거래일자', '결제일'],
  vendor: ['가맹점명', '가맹점', '이용처'],
  amount: ['이용금액', '결제금액', '금액'],
  card:   ['카드번호', '카드'],
  memo:   ['메모', '비고'],
};

function findCol(headers, list) {
  const norm = headers.map(h => String(h || '').trim());
  for (const c of list) {
    const i = norm.indexOf(c);
    if (i >= 0) return i;
  }
  return -1;
}

export const LABEL = '신한카드';

export function detect(headers) {
  if (!Array.isArray(headers)) return false;
  return findCol(headers, SYNONYMS.date) >= 0
      && findCol(headers, SYNONYMS.amount) >= 0;
}

const num = (v) => {
  if (v == null || v === '') return 0;
  const n = Number(String(v).replace(/[,\s원]/g, ''));
  return isNaN(n) ? 0 : n;
};

const parseDate = (s) => {
  const m = String(s || '').match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (!m) return '';
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
};

export function parseRow(row, headers) {
  const ix = {
    date: findCol(headers, SYNONYMS.date),
    vendor: findCol(headers, SYNONYMS.vendor),
    amount: findCol(headers, SYNONYMS.amount),
    card: findCol(headers, SYNONYMS.card),
    memo: findCol(headers, SYNONYMS.memo),
  };
  const date = parseDate(row[ix.date]);
  const amount = num(row[ix.amount]);
  if (!date || !amount) return null;

  return {
    type: 'card_tx',
    source: 'card_shinhan',
    date,
    direction: 'out',
    amount,
    counterparty: ix.vendor >= 0 ? String(row[ix.vendor] || '').trim() : '',
    card_no: ix.card >= 0 ? String(row[ix.card] || '').trim() : '',
    memo: ix.memo >= 0 ? String(row[ix.memo] || '').trim() : '',
    raw_key: `${date}|card|${amount}|${ix.vendor >= 0 ? row[ix.vendor] : ''}`,
  };
}
