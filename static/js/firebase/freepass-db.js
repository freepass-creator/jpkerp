/**
 * freepass-db.js — freepasserp Firebase 연동 (상품 등록용)
 * jpkerp4 → freepasserp3 DB에 상품 데이터 push
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getDatabase, ref, set, push, get, query, orderByChild, equalTo, onValue, off }
  from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js';

const fpConfig = {
  apiKey: 'AIzaSyA0q_6yo9YRkpNeNaawH1AFPZx1IMgj-dY',
  authDomain: 'freepasserp3.firebaseapp.com',
  databaseURL: 'https://freepasserp3-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'freepasserp3',
  storageBucket: 'freepasserp3.firebasestorage.app',
  messagingSenderId: '172664197996',
  appId: '1:172664197996:web:91b7219f22eb68b5005949',
};

const fpApp = initializeApp(fpConfig, 'freepass');
const fpDb = getDatabase(fpApp);

/**
 * 상품 전체 실시간 감시 — car_number 기준 Map으로 콜백
 * callback(Map<car_number, product>)
 */
export function watchProducts(callback) {
  const productsRef = ref(fpDb, 'products');
  const handler = onValue(productsRef, (snap) => {
    const map = new Map();
    if (snap.exists()) {
      Object.entries(snap.val()).forEach(([uid, p]) => {
        if (p.status === 'deleted') return;
        const cn = String(p.car_number || '').trim();
        if (!cn) return;
        // 같은 차량번호면 최신 것
        const existing = map.get(cn);
        if (!existing || (p.created_at || 0) > (existing.created_at || 0)) {
          map.set(cn, { uid, ...p });
        }
      });
    }
    callback(map);
  });
  return () => off(productsRef, 'value', handler);
}

/**
 * 차량번호로 기존 상품 조회 (1회성)
 */
export async function findProductByCarNumber(carNumber) {
  const snap = await get(query(ref(fpDb, 'products'), orderByChild('car_number'), equalTo(carNumber)));
  if (!snap.exists()) return null;
  const entries = Object.entries(snap.val());
  // 최신 것 반환
  const sorted = entries.sort((a, b) => (b[1].created_at || 0) - (a[1].created_at || 0));
  return { uid: sorted[0][0], ...sorted[0][1] };
}

/**
 * 상품 등록 (freepasserp products 컬렉션)
 */
export async function saveProductToFreepass(product) {
  const carNumber = String(product.car_number || '').trim();
  if (!carNumber) throw new Error('차량번호 필수');

  // 중복 체크
  const existing = await findProductByCarNumber(carNumber);
  if (existing) throw new Error(`이미 등록된 상품입니다 (${existing.product_code || existing.uid})`);

  const partnerCode = String(product.partner_code || '').trim();
  const productCode = `${carNumber}-${partnerCode || 'JPK'}`;
  const productUid = push(ref(fpDb, 'products')).key;

  const payload = {
    product_uid: productUid,
    product_code: productCode,
    car_number: carNumber,
    partner_code: partnerCode,
    provider_company_code: partnerCode,
    provider_name: product.partner_name || '',
    vehicle_status: '출고가능',
    product_type: product.product_type || '중고렌트',
    maker: product.maker || '',
    model_name: product.model_name || '',
    sub_model: product.sub_model || '',
    trim_name: product.trim_name || '',
    fuel_type: product.fuel_type || '',
    vehicle_price: Number(product.vehicle_price) || 0,
    mileage: Number(product.mileage) || 0,
    year: product.year || '',
    ext_color: product.ext_color || '',
    int_color: product.int_color || '',
    first_registration_date: product.first_registration_date || '',
    vehicle_age_expiry_date: product.vehicle_age_expiry_date || '',
    options: product.options || '',
    partner_memo: product.note || '',
    note: product.note || '',
    price: product.price || {},
    rental_price_48: Number(product.price?.['48']?.rent) || 0,
    deposit_48: Number(product.price?.['48']?.deposit) || 0,
    rental_price: Number(product.price?.['48']?.rent) || 0,
    deposit: Number(product.price?.['48']?.deposit) || 0,
    image_urls: product.image_urls || [],
    image_url: (product.image_urls || [])[0] || '',
    image_count: (product.image_urls || []).length,
    source: 'jpkerp4',
    created_at: Date.now(),
    updated_at: Date.now(),
  };

  await set(ref(fpDb, `products/${productUid}`), payload);
  return { productUid, productCode };
}

/**
 * 상품 수정
 */
export async function updateProductInFreepass(productUid, updates) {
  const current = await get(ref(fpDb, `products/${productUid}`));
  if (!current.exists()) throw new Error('상품을 찾을 수 없습니다.');
  await set(ref(fpDb, `products/${productUid}`), {
    ...current.val(),
    ...updates,
    updated_at: Date.now(),
  });
}
