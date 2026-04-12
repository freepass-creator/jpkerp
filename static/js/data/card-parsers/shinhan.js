/**
 * shinhan.js — 신한카드 법인카드 이용내역 CSV 파서
 *
 * 실제 헤더:
 *   이용일시, 접수일, 승인번호, 이용카드, 이용자명, 가맹점명,
 *   이용금액, 이용구분, 할부개월수, 이용지역, 카드구분, 결제예정일
 */
import { classifyExpense } from '../../core/match-engine.js';

const REQUIRED = ['이용일시', '가맹점명', '이용금액'];
const SYNONYMS = {
  date:     ['이용일시', '이용일자', '이용일', '거래일자'],
  acceptDt: ['접수일'],
  approval: ['승인번호'],
  card:     ['이용카드', '카드번호', '카드'],
  user:     ['이용자명', '사용자'],
  vendor:   ['가맹점명', '가맹점', '이용처'],
  amount:   ['이용금액', '결제금액', '금액'],
  kind:     ['이용구분'],
  installment: ['할부개월수', '할부'],
  region:   ['이용지역'],
  cardType: ['카드구분'],
  payDate:  ['결제예정일', '결제일'],
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
  const hasDate = findCol(headers, SYNONYMS.date) >= 0;
  const hasAmount = findCol(headers, SYNONYMS.amount) >= 0;
  const hasVendor = findCol(headers, SYNONYMS.vendor) >= 0;
  return hasDate && hasAmount && hasVendor;
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
  const ix = {};
  for (const [key, syns] of Object.entries(SYNONYMS)) {
    ix[key] = findCol(headers, syns);
  }

  const date = parseDate(row[ix.date]);
  const amount = num(row[ix.amount]);
  if (!date || !amount) return null;

  const vendor = ix.vendor >= 0 ? String(row[ix.vendor] || '').trim() : '';
  const cardNo = ix.card >= 0 ? String(row[ix.card] || '').trim() : '';
  const userName = ix.user >= 0 ? String(row[ix.user] || '').trim() : '';
  const approval = ix.approval >= 0 ? String(row[ix.approval] || '').trim() : '';
  const kind = ix.kind >= 0 ? String(row[ix.kind] || '').trim() : '';
  const installment = ix.installment >= 0 ? String(row[ix.installment] || '').trim() : '';
  const payDate = ix.payDate >= 0 ? parseDate(row[ix.payDate]) : '';

  const event = {
    type: 'card_tx',
    source: 'card_shinhan',
    date,
    direction: 'out',
    amount,
    counterparty: vendor,
    card_no: cardNo,
    card_user: userName,
    approval_no: approval,
    pay_method: kind,
    installment: installment,
    pay_date: payDate,
    raw_key: `${date}|card|${amount}|${approval || vendor}`,
  };

  // 자동 분류
  const expense = classifyExpense(event);
  event.expense_category = expense.category;
  event.expense_type = expense.type;

  return event;
}
