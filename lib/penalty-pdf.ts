/**
 * 과태료 PDF 생성 + ZIP 다운로드.
 *
 * 각 고지서별 PDF (2~3페이지):
 *   1. 변경공문 (과태료 변경부과 요청서)
 *   2. 고지서 원본 (업로드된 이미지)
 *   3. 임대차계약사실확인서
 *
 * 전체 다운로드 시 ZIP으로 묶어서 내려감.
 */
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import type { PenaltyWorkItem } from '@/app/(workspace)/input/operation/penalty-notice-store';

const FONT = 'Pretendard';
const PAGE_W = 210; // A4 mm
const PAGE_H = 297;
const M = 20; // margin

function today() {
  const d = new Date();
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function shortDate(s?: string) {
  if (!s) return '';
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일` : s;
}

/**
 * 단일 고지서 → PDF Blob
 */
async function buildPenaltyPdf(item: PenaltyWorkItem): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const cw = PAGE_W - M * 2; // content width

  // ── 1페이지: 변경공문 ──
  let y = M + 10;

  doc.setFontSize(16);
  doc.text('과태료(범칙금) 변경부과 요청서', PAGE_W / 2, y, { align: 'center' });
  y += 14;

  doc.setFontSize(10);
  doc.text(`수신: ${item.issuer || '관할 경찰서장'}`, M, y); y += 7;
  doc.text(`발신: ${item.payer_name || '주식회사 ○○렌터카'}`, M, y); y += 7;
  doc.text(`제목: 과태료(범칙금) 변경부과 요청`, M, y); y += 12;

  doc.setFontSize(10);
  const bodyLines = [
    `1. 귀 기관의 무궁한 발전을 기원합니다.`,
    ``,
    `2. 아래 차량에 대한 과태료(범칙금)의 납부자 변경부과를 요청합니다.`,
    `   위반 차량의 소유자(관리자)는 당사이나, 위반 당시 해당 차량은`,
    `   임대차계약에 의하여 임차인이 사용 중이었으므로, 실제 운전자인`,
    `   임차인에게 변경부과하여 주시기 바랍니다.`,
    ``,
    `                        - 아 래 -`,
    ``,
    `   가. 차량번호: ${item.car_number || '—'}`,
    `   나. 위반일시: ${item.date || '—'}`,
    `   다. 위반장소: ${item.location || '—'}`,
    `   라. 위반내용: ${item.description || '—'}`,
    `   마. 과태료(범칙금): ${item.amount ? item.amount.toLocaleString() + '원' : '—'}`,
    `   바. 고지서번호: ${item.notice_no || '—'}`,
    ``,
    `   사. 임차인 정보`,
    `      - 성명: ${item._contract?.contractor_name || '—'}`,
    `      - 연락처: ${item._contract?.contractor_phone || '—'}`,
    `      - 계약기간: ${shortDate(item._contract?.start_date)} ~ ${shortDate(item._contract?.end_date)}`,
    ``,
    `3. 붙임: 1) 과태료 고지서 사본 1부`,
    `         2) 임대차계약 사실확인서 1부  끝.`,
    ``,
    ``,
    `                                          ${today()}`,
    ``,
    `                              ${item.payer_name || '주식회사 ○○렌터카'}  (인)`,
  ];

  for (const line of bodyLines) {
    if (y > PAGE_H - M - 10) { doc.addPage(); y = M; }
    doc.text(line, M, y);
    y += 5.5;
  }

  // ── 2페이지: 고지서 원본 이미지 ──
  if (item.fileDataUrl) {
    doc.addPage();
    try {
      // dataUrl → 이미지 삽입 (A4 꽉 차게)
      const imgW = PAGE_W - M * 2;
      const imgH = PAGE_H - M * 2;
      doc.addImage(item.fileDataUrl, 'JPEG', M, M, imgW, imgH);
    } catch {
      doc.setFontSize(10);
      doc.text('(고지서 이미지 삽입 실패)', PAGE_W / 2, PAGE_H / 2, { align: 'center' });
    }
  }

  // ── 3페이지: 임대차계약 사실확인서 ──
  doc.addPage();
  y = M + 10;

  doc.setFontSize(16);
  doc.text('임대차계약 사실확인서', PAGE_W / 2, y, { align: 'center' });
  y += 16;

  doc.setFontSize(10);
  const contract = item._contract;
  const asset = item._asset;

  const kvRows = [
    ['임대인 (회사)', item.payer_name || '주식회사 ○○렌터카'],
    ['임차인 (고객)', contract?.contractor_name || '—'],
    ['임차인 연락처', contract?.contractor_phone || '—'],
    ['차량번호', item.car_number || '—'],
    ['차종', [asset?.manufacturer, asset?.detail_model ?? asset?.car_model].filter(Boolean).join(' ') || '—'],
    ['회사코드', contract?.partner_code || asset?.partner_code || '—'],
    ['계약기간', `${shortDate(contract?.start_date)} ~ ${shortDate(contract?.end_date)}`],
    ['계약유형', contract?.product_type || '장기렌트'],
  ];

  for (const [k, v] of kvRows) {
    doc.setFont(FONT, 'normal', 'bold');
    doc.text(k, M, y);
    doc.setFont(FONT, 'normal', 'normal');
    doc.text(String(v), M + 45, y);
    y += 7;
  }

  y += 8;
  const confirmLines = [
    `위 임대인은 위 차량을 임차인에게 임대차계약에 의하여 대여하였으며,`,
    `위반 당시(${item.date || '—'}) 해당 차량은 임차인이 점유·사용 중이었음을`,
    `확인합니다.`,
    ``,
    `본 확인서는 관할 기관의 과태료(범칙금) 변경부과 요청을 위하여`,
    `작성되었습니다.`,
    ``,
    ``,
    ``,
    `                                          ${today()}`,
    ``,
    `                  확인자: ${item.payer_name || '주식회사 ○○렌터카'}  (인)`,
  ];

  for (const line of confirmLines) {
    if (y > PAGE_H - M - 10) { doc.addPage(); y = M; }
    doc.text(line, M, y);
    y += 5.5;
  }

  return doc.output('blob');
}

/**
 * 전체 고지서 → ZIP 다운로드
 */
export async function downloadPenaltyZip(
  items: PenaltyWorkItem[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const zip = new JSZip();
  const total = items.length;

  for (let i = 0; i < total; i++) {
    const it = items[i];
    const blob = await buildPenaltyPdf(it);
    const name = [
      it.car_number || '미확인',
      it.issuer || '',
      it.date?.slice(0, 10) || '',
      it._contract?.contractor_name || '',
    ].filter(Boolean).join('_');
    zip.file(`${name}.pdf`, blob);
    onProgress?.(i + 1, total);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `과태료_${new Date().toISOString().slice(0, 10)}_${total}건.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
