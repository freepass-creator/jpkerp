/**
 * ocr.js — Google Vision OCR
 *
 * 이미지/PDF → 텍스트 추출
 */

const API_KEY = 'AIzaSyBSPo1kZOefX-6NuHoQdUF1htqQDSxXsCs';
const ENDPOINT = `https://vision.googleapis.com/v1/images:annotate?key=${API_KEY}`;

/**
 * 파일 → base64 → Vision API → 텍스트
 * @param {File} file
 * @returns {Promise<{text: string, lines: string[]}>}
 */
export async function ocrFile(file) {
  const base64 = await fileToBase64(file);
  const body = {
    requests: [{
      image: { content: base64 },
      features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
    }],
  };

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Vision API: ${res.status}`);
  const data = await res.json();
  const fullText = data.responses?.[0]?.fullTextAnnotation?.text || '';
  const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);

  return { text: fullText, lines };
}

/**
 * 여러 파일 일괄 OCR
 */
export async function ocrFiles(files) {
  const results = [];
  for (const file of files) {
    try {
      const r = await ocrFile(file);
      results.push({ file, ...r, error: null });
    } catch (e) {
      results.push({ file, text: '', lines: [], error: e.message });
    }
  }
  return results;
}

/**
 * OCR 텍스트에서 차량번호 추출
 */
export function extractCarNumber(text) {
  const m = text.match(/\d{2,3}[가-힣]\d{4}/g);
  return m ? m[0] : null;
}

/**
 * OCR 텍스트에서 차대번호(VIN) 추출
 */
export function extractVin(text) {
  const m = text.match(/[A-HJ-NPR-Z0-9]{17}/g);
  return m ? m[0] : null;
}

/**
 * OCR 텍스트에서 금액 추출 (가장 큰 금액)
 */
export function extractAmount(text) {
  const matches = text.match(/[\d,]+원/g) || [];
  const amounts = matches.map(m => Number(m.replace(/[,원]/g, ''))).filter(n => n > 0);
  return amounts.length ? Math.max(...amounts) : null;
}

/**
 * OCR 텍스트에서 날짜 추출
 */
export function extractDate(text) {
  const patterns = [
    /(\d{4})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})일?/,
    /(\d{2})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})일?/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      let y = m[1].length === 2 ? (Number(m[1]) < 50 ? 2000 + Number(m[1]) : 1900 + Number(m[1])) : Number(m[1]);
      return `${y}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
    }
  }
  return null;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
