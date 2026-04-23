/**
 * ocr.ts — Google Vision OCR (jpkerp core/ocr.js 이식)
 *
 * 이미지: Vision API TEXT_DETECTION
 * PDF: pdf.js로 텍스트 레이어 추출 (디지털) 또는 이미지 OCR (스캔)
 */

// 주의: 프로덕션에선 env로 옮기는 게 좋지만, 기존 jpkerp 흐름 유지를 위해 공용 키 하드코드.
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_VISION_KEY ?? 'AIzaSyBSPo1kZOefX-6NuHoQdUF1htqQDSxXsCs';
const ENDPOINT = `https://vision.googleapis.com/v1/images:annotate?key=${API_KEY}`;

// pdf.js 동적 로드 (CDN ESM)
type PdfjsModule = {
  getDocument: (params: { data: ArrayBuffer }) => { promise: Promise<PdfDocumentLike> };
  GlobalWorkerOptions: { workerSrc: string };
};
type PdfDocumentLike = {
  numPages: number;
  getPage: (n: number) => Promise<PdfPageLike>;
};
type PdfPageLike = {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> };
  getTextContent: () => Promise<{ items: Array<{ str: string }> }>;
};

let _pdfjsReady: Promise<PdfjsModule> | null = null;
async function loadPdfjs(): Promise<PdfjsModule> {
  if (_pdfjsReady) return _pdfjsReady;
  _pdfjsReady = (async () => {
    // @ts-expect-error — CDN dynamic import
    const mod = await import(/* webpackIgnore: true */ 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs');
    const lib = mod as PdfjsModule;
    lib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';
    return lib;
  })();
  return _pdfjsReady;
}

// PDF → 이미지 렌더 해상도.
// scale=1.5는 ~150DPI (작은 한글/숫자 인식 불안정).
// scale=2.5 (~250DPI)가 한글 작은 폰트도 안정 인식. Vision API 토큰 비용은 크게 늘지 않음.
async function pdfToImages(file: File, scale = 2.5): Promise<string[]> {
  const pdfjs = await loadPdfjs();
  const arrayBuf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuf }).promise;
  const images: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    images.push(dataUrl.split(',')[1]);
  }
  return images;
}

async function ocrBase64(base64: string): Promise<string> {
  // DOCUMENT_TEXT_DETECTION: 문서(폼·스캔본) 전용 모드. 레이아웃 보존 + 밀도 높은 텍스트 정확도 높음.
  // languageHints ["ko", "en"]: 한/영 혼합 문서 인식률 향상.
  //   - 한국어 힌트 없이는 "가"를 중국어/일본어 한자로 오인식하는 경우 있음.
  //   - 영어 힌트도 포함해서 VIN·형식번호 같은 라틴 문자도 정확히.
  const body = {
    requests: [{
      image: { content: base64 },
      features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
      imageContext: { languageHints: ['ko', 'en'] },
    }],
  };
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Vision API: ${res.status}`);
  const data = await res.json();
  return (data.responses?.[0]?.fullTextAnnotation?.text as string | undefined) ?? '';
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export interface OcrProgress {
  stage: 'render' | 'ocr';
  done: number;
  total: number;
  message: string;
}

/** 파일 → OCR 텍스트 (이미지·PDF 모두)
 *  @param opts.forceImage PDF여도 텍스트 레이어 무시하고 Vision API로 이미지 OCR 강제 실행.
 *    (한글 폰트 서브셋 임베딩이 깨진 PDF에서 텍스트 레이어가 "가"를 "7-" 같은 garbage로 내는 문제 회피용)
 */
export async function ocrFile(
  file: File,
  opts: { scale?: number; concurrency?: number; onProgress?: (p: OcrProgress) => void; forceImage?: boolean } = {},
): Promise<{ text: string; lines: string[] }> {
  const { scale = 2.5, concurrency = 6, onProgress, forceImage = false } = opts;
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  const progress = (stage: OcrProgress['stage'], done: number, total: number, message: string) =>
    onProgress?.({ stage, done, total, message });

  let fullText = '';
  if (ext === 'pdf') {
    progress('render', 0, 1, 'PDF 분석 중...');
    const pdfjs = await loadPdfjs();
    const arrayBuf = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuf }).promise;
    const total = pdf.numPages;
    const texts = new Array<string>(total);
    let hasText = false;
    if (!forceImage) {
      for (let i = 0; i < total; i++) {
        const page = await pdf.getPage(i + 1);
        const content = await page.getTextContent();
        const pageText = content.items.map((it) => it.str).join(' ');
        texts[i] = pageText;
        if (pageText.replace(/\s/g, '').length > 30) hasText = true;
        progress('render', i + 1, total, `텍스트 추출 ${i + 1}/${total}`);
      }
    }
    if (!forceImage && hasText) {
      fullText = texts.join('\n\n--- 페이지 구분 ---\n\n');
    } else {
      const images = await pdfToImages(file, scale);
      const ocrTexts = new Array<string>(total);
      let nextIdx = 0;
      let done = 0;
      progress('ocr', 0, total, `OCR 0/${total}`);
      await Promise.all(
        Array.from({ length: Math.min(concurrency, total) }, async () => {
          while (true) {
            const i = nextIdx++;
            if (i >= total) break;
            try { ocrTexts[i] = await ocrBase64(images[i]); } catch { ocrTexts[i] = ''; }
            done++;
            progress('ocr', done, total, `OCR ${done}/${total}`);
          }
        }),
      );
      fullText = ocrTexts.join('\n\n--- 페이지 구분 ---\n\n');
    }
  } else {
    progress('ocr', 0, 1, 'OCR 중...');
    const base64 = await fileToBase64(file);
    fullText = await ocrBase64(base64);
    progress('ocr', 1, 1, 'OCR 완료');
  }

  const lines = fullText.split('\n').map((l) => l.trim()).filter(Boolean);
  return { text: fullText, lines };
}

/** 차량번호 추출 — "12가 3456" 또는 "12가3456" */
export function extractCarNumber(text: string): string | null {
  const m = text.match(/\d{2,3}[가-힣]\s?\d{4}/g);
  return m ? m[0].replace(/\s/g, '') : null;
}

/** VIN (차대번호 17자리) */
export function extractVin(text: string): string | null {
  const m = text.match(/[A-HJ-NPR-Z0-9]{17}/g);
  return m ? m[0] : null;
}

/** 금액 (가장 큰 "숫자,숫자원" 패턴) */
export function extractAmount(text: string): number | null {
  const matches = text.match(/[\d,]+원/g) ?? [];
  const amounts = matches.map((m) => Number(m.replace(/[,원]/g, ''))).filter((n) => n > 0);
  return amounts.length ? Math.max(...amounts) : null;
}

/** 날짜 (yyyy.mm.dd / yy-mm-dd / 년월일) */
export function extractDate(text: string): string | null {
  const patterns = [
    /(\d{4})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})일?/,
    /(\d{2})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})일?/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const y = m[1].length === 2 ? (Number(m[1]) < 50 ? 2000 + Number(m[1]) : 1900 + Number(m[1])) : Number(m[1]);
      return `${y}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
    }
  }
  return null;
}
