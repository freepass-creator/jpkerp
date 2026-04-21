/**
 * 계약 + 수납스케줄 + 미수 반영 일괄 등록
 *
 * 1. 계약 생성 (contracts)
 * 2. 수납스케줄 생성 (billings) — 시작일~종료일, 월대여료, 결제일
 * 3. 과거 회차 납부 완료 처리, 현재미수 반영
 */
import fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, push, set, get, update } from 'firebase/database';

const app = initializeApp({
  databaseURL: 'https://jpkerp-default-rtdb.asia-southeast1.firebasedatabase.app',
  apiKey: 'AIzaSyCCzPhqUiLXFB0zu41txT9OjKXE8ACqu4Y',
  projectId: 'jpkerp',
});
const db = getDatabase(app);

function parseCSVLine(line) {
  const result = []; let cur = ''; let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { result.push(cur); cur = ''; continue; }
    cur += ch;
  }
  result.push(cur);
  return result;
}

function parseCSV(text) {
  const lines = text.split('\n');
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).filter(l => l.trim()).map(l => {
    const vals = parseCSVLine(l);
    const row = {};
    headers.forEach((h, j) => { row[h.trim()] = (vals[j] || '').trim(); });
    return row;
  });
}

function toNum(s) { return Number(String(s || '').replace(/[,\s]/g, '')) || 0; }
function clean(s) { return (s || '').trim().replace(/^\s*-\s*$/, ''); }

/** 날짜 정규화: "2026-02-11" or "26-02-11" → "2026-02-11" */
function normDate(s) {
  if (!s) return '';
  const v = clean(s);
  if (!v) return '';
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  // YY-MM-DD
  const m = v.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (m) return `20${m[1]}-${m[2]}-${m[3]}`;
  return v;
}

/** 결제일 기반 N회차 due_date 계산 */
function calcDueDate(startDate, debitDay, monthOffset) {
  const d = new Date(startDate);
  d.setMonth(d.getMonth() + monthOffset);
  const day = debitDay || d.getDate();
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
}

const counters = {};
function genCode(prefix) {
  const cur = counters[prefix] ?? 0;
  counters[prefix] = cur + 1;
  return `${prefix}${String(cur + 1).padStart(5, '0')}`;
}

async function main() {
  const csv = fs.readFileSync('scripts/contracts.csv', 'utf-8');
  const rows = parseCSV(csv);
  console.log(`CSV: ${rows.length}행`);

  const today = new Date().toISOString().slice(0, 10);
  let contractCount = 0, billingCount = 0, skipCount = 0;

  for (const row of rows) {
    const carNumber = clean(row['차량번호']);
    const contractorName = clean(row['계약자명']);
    const startDate = normDate(row['시작일']);
    const rentAmount = toNum(row['월 대여료']);
    const status = clean(row['상태']);

    // 필수 필드 없으면 스킵
    if (!carNumber || !startDate || !rentAmount) {
      skipCount++;
      continue;
    }
    // 대기중이면 스킵
    if (status === '대기중') {
      skipCount++;
      continue;
    }

    const partnerCode = clean(row['회원사코드']);
    const months = toNum(row['기간(개월)']) || 12;
    const endDate = normDate(row['종료일']);
    const deposit = toNum(row['보증금']);
    const debitDay = toNum(row['결제일']);
    const unpaid = toNum(row['현재미수']);
    const contractCode = genCode('CT');
    const customerCode = genCode('CU');

    // 고객 정보
    const phone = clean(row['연락처']);
    const regNo = clean(row['고객등록번호']);
    const custType = clean(row['구분']);
    const address = clean(row['주소']);
    const bizNo = clean(row['사업자등록번호']);

    // 1. 계약 저장
    const contractPayload = {
      contract_code: contractCode,
      customer_code: customerCode,
      partner_code: partnerCode || undefined,
      car_number: carNumber,
      contractor_name: contractorName || undefined,
      contractor_phone: phone || undefined,
      contractor_reg_no: regNo || undefined,
      customer_type: custType || undefined,
      address: address || undefined,
      biz_no: bizNo || undefined,
      company_name: clean(row['상호']) || undefined,
      ceo_name: clean(row['대표자명']) || undefined,
      biz_type: clean(row['업태']) || undefined,
      biz_item: clean(row['종목']) || undefined,
      tax_email: clean(row['세금계산서 이메일']) || undefined,
      driver_name: clean(row['실운전자 이름']) || undefined,
      driver_phone: clean(row['실운전자 연락처']) || undefined,
      driver_reg_no: clean(row['실운전자 주민번호']) || undefined,
      start_date: startDate,
      end_date: endDate || undefined,
      rent_months: months,
      rent_amount: rentAmount,
      deposit_amount: deposit || undefined,
      auto_debit_day: debitDay || undefined,
      product_type: '장기렌트',
      contract_status: '계약진행',
      note: clean(row['메모']) || undefined,
      status: 'active',
      created_at: Date.now(),
    };
    const cleanContract = Object.fromEntries(Object.entries(contractPayload).filter(([, v]) => v !== undefined && v !== ''));
    const cRef = push(ref(db, 'contracts'));
    await set(cRef, cleanContract);
    contractCount++;

    // 2. 보증금 스케줄 (있으면)
    if (deposit > 0) {
      const depPayload = {
        billing_code: genCode('BL'),
        contract_code: contractCode,
        customer_code: customerCode,
        car_number: carNumber,
        partner_code: partnerCode || undefined,
        bill_type: '보증금',
        bill_count: 1,
        due_date: startDate,
        amount: deposit,
        paid_total: deposit, // 기존 계약은 보증금 납부 완료
        status: 'active',
        created_at: Date.now(),
      };
      await set(push(ref(db, 'billings')), Object.fromEntries(Object.entries(depPayload).filter(([, v]) => v !== undefined)));
      billingCount++;
    }

    // 3. 대여료 스케줄
    for (let i = 0; i < months; i++) {
      const dueDate = calcDueDate(startDate, debitDay, i);
      const isPast = dueDate < today;

      const billingPayload = {
        billing_code: genCode('BL'),
        contract_code: contractCode,
        customer_code: customerCode,
        car_number: carNumber,
        partner_code: partnerCode || undefined,
        bill_type: '대여료',
        bill_count: i + 1,
        due_date: dueDate,
        amount: rentAmount,
        paid_total: isPast ? rentAmount : 0, // 과거는 납부 완료, 미래는 미납
        status: 'active',
        created_at: Date.now(),
      };
      await set(push(ref(db, 'billings')), Object.fromEntries(Object.entries(billingPayload).filter(([, v]) => v !== undefined)));
      billingCount++;
    }

    // 3. 현재미수 반영 — 과거 회차 중 최근부터 미수 역배분
    if (unpaid > 0) {
      // billings에서 이 계약의 과거 회차를 찾아서 최근부터 미납 처리
      const billSnap = await get(ref(db, 'billings'));
      if (billSnap.exists()) {
        const entries = Object.entries(billSnap.val())
          .filter(([, b]) => b.contract_code === contractCode && b.due_date < today && b.status !== 'deleted')
          .sort((a, b) => b[1].due_date.localeCompare(a[1].due_date)); // 최근부터

        let remaining = unpaid;
        for (const [key, bill] of entries) {
          if (remaining <= 0) break;
          const amt = bill.amount || rentAmount;
          if (remaining >= amt) {
            // 전액 미납
            await update(ref(db, `billings/${key}`), { paid_total: 0 });
            remaining -= amt;
          } else {
            // 일부 미납
            await update(ref(db, `billings/${key}`), { paid_total: amt - remaining });
            remaining = 0;
          }
        }
      }
    }

    if (contractCount % 10 === 0) console.log(`  ${contractCount}건...`);
  }

  console.log(`\n완료: 계약 ${contractCount}건 / 수납스케줄 ${billingCount}건 / 스킵 ${skipCount}건`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
