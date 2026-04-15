/**
 * ocr.js — Google Vision OCR
 *
 * 이미지 → Vision API TEXT_DETECTION
 * PDF → pdf.js로 페이지별 이미지 변환 → OCR
 */

const API_KEY = 'AIzaSyBSPo1kZOefX-6NuHoQdUF1htqQDSxXsCs';
const ENDPOINT = `https://vision.googleapis.com/v1/images:annotate?key=${API_KEY}`;

// ─── pdf.js 동적 로드 ─────────────────────────────────────
let _pdfjsReady = null;
function loadPdfjs() {
  if (_pdfjsReady) return _pdfjsReady;
  _pdfjsReady = new Promise((resolve, reject) => {
    if (window.pdfjsLib) { resolve(window.pdfjsLib); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs';
    s.type = 'module';
    // pdf.js ESM은 script 태그로 안 됨 → dynamic import 사용
    s.onerror = () => { _pdfjsReady = null; reject(new Error('pdf.js 로드 실패')); };
    // dynamic import 방식
    import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs')
      .then(mod => {
        const lib = mod;
        lib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';
        resolve(lib);
      })
      .catch(reject);
  });
  return _pdfjsReady;
}

/**
 * PDF 파일 → 페이지별 base64 이미지 배열
 */
async function pdfToImages(file, scale = 2.0) {
  const pdfjsLib = await loadPdfjs();
  const arrayBuf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuf }).promise;
  const images = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    // canvas → base64 (JPEG, 품질 0.92)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    images.push(dataUrl.split(',')[1]);
  }

  return images;
}

/**
 * base64 이미지 → Vision API OCR
 */
async function ocrBase64(base64) {
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
  return data.responses?.[0]?.fullTextAnnotation?.text || '';
}

/**
 * 파일 → OCR 텍스트
 * PDF: 페이지별 이미지 변환 후 병렬 OCR → 합침
 * 이미지: 그대로 OCR
 * @param {File} file
 * @param {object} opts
 * @param {number} opts.concurrency — 동시 호출 수 (기본 6)
 * @param {number} opts.scale — PDF 렌더 배율 (기본 1.5)
 * @param {function} opts.onProgress — ({stage, done, total, message}) => void
 */
export async function ocrFile(file, opts = {}) {
  const { concurrency = 6, scale = 1.5, onProgress } = opts;
  const progress = (stage, done, total, message) => {
    if (onProgress) onProgress({ stage, done, total, message });
  };
  const ext = file.name.split('.').pop().toLowerCase();
  let fullText = '';

  if (ext === 'pdf') {
    progress('render', 0, 1, 'PDF 페이지 렌더링 중...');
    const images = await pdfToImages(file, scale);
    const total = images.length;
    progress('render', total, total, `${total}장 렌더 완료`);

    // 병렬 워커 풀: 각 워커가 다음 인덱스를 가져가 OCR
    const texts = new Array(total);
    let nextIdx = 0;
    let done = 0;
    progress('ocr', 0, total, `OCR 0/${total}`);

    await Promise.all(Array.from({ length: Math.min(concurrency, total) }, async () => {
      while (true) {
        const i = nextIdx++;
        if (i >= total) break;
        try {
          texts[i] = await ocrBase64(images[i]);
        } catch (e) {
          texts[i] = '';
          console.warn(`[OCR] page ${i + 1} failed:`, e);
        }
        done++;
        progress('ocr', done, total, `OCR ${done}/${total}`);
      }
    }));

    fullText = texts.join('\n\n--- 페이지 구분 ---\n\n');
  } else {
    progress('ocr', 0, 1, 'OCR 중...');
    const base64 = await fileToBase64(file);
    fullText = await ocrBase64(base64);
    progress('ocr', 1, 1, 'OCR 완료');
  }

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
  const m = text.match(/\d{2,3}[가-힣]\s?\d{4}/g);
  return m ? m[0].replace(/\s/g, '') : null;
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
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
