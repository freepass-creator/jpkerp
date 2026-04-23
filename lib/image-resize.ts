/**
 * 클라이언트 사이드 이미지 리사이징.
 * 업로드 전 캔버스로 다운스케일 → 파일 크기·업로드 속도 대폭 개선.
 *
 * 이미지가 아닌 파일(PDF·DOC·영상 등)은 그대로 반환.
 */

interface ResizeOptions {
  /** 가장 긴 변 픽셀 한계. 기본 2048 (OCR·검토용 충분). */
  maxSide?: number;
  /** JPEG 품질 0~1. 기본 0.85. */
  quality?: number;
}

export async function resizeImage(file: File, opts: ResizeOptions = {}): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  const maxSide = opts.maxSide ?? 2048;
  const quality = opts.quality ?? 0.85;

  const url = URL.createObjectURL(file);
  try {
    const img = document.createElement('img');
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('이미지 디코딩 실패'));
      img.src = url;
    });

    const { naturalWidth: w0, naturalHeight: h0 } = img;
    const scale = Math.min(1, maxSide / Math.max(w0, h0));
    if (scale === 1 && file.size < 1_500_000) return file; // 이미 충분히 작음 (1.5MB 미만)

    const w = Math.round(w0 * scale);
    const h = Math.round(h0 * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
    });
    if (!blob || blob.size >= file.size) return file; // 원본보다 커지면 원본 사용

    const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], newName, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file; // 실패 시 원본 업로드
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 여러 파일 병렬 리사이징 */
export function resizeImages(files: File[], opts?: ResizeOptions): Promise<File[]> {
  return Promise.all(files.map((f) => resizeImage(f, opts)));
}
