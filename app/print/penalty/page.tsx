'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { PenaltyWorkItem } from '@/app/(workspace)/input/operation/penalty-notice-store';
import { fmt } from '@/lib/utils';

const STORAGE_KEY = 'jpk.print.penalty';

function penaltyFileName(item: PenaltyWorkItem): string {
  const issuer = (item.issuer || '기관').replace(/\s+/g, '');
  const car = (item.car_number || 'NOCAR').replace(/\s+/g, '');
  const dateKey = ((item.date || '').replace(/\D/g, '').slice(2, 12)) || Date.now().toString().slice(-10);
  const contractor = (item._contractor || '미매칭').replace(/\s+/g, '');
  const model = (item._asset?.car_model || '').replace(/\s+/g, '');
  return [issuer, car, dateKey, contractor, model].filter(Boolean).join('_').replace(/[\\/:*?"<>|]/g, '');
}

function PenaltyPrintInner() {
  const params = useSearchParams();
  const auto = params.get('auto') === '1';
  const [items, setItems] = useState<PenaltyWorkItem[] | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) { setItems([]); return; }
      const arr = JSON.parse(raw) as PenaltyWorkItem[];
      setItems(arr);
      // 첫 항목명을 문서 제목으로 → 브라우저 PDF 저장 기본 파일명
      if (arr.length === 1) document.title = penaltyFileName(arr[0]);
      else if (arr.length > 1) document.title = `과태료_${new Date().toISOString().slice(0, 10)}_${arr.length}건`;
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    if (auto && items && items.length > 0) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [auto, items]);

  if (items === null) {
    return <div className="print-shell">로드 중...</div>;
  }
  if (items.length === 0) {
    return (
      <div className="print-shell">
        <div className="text-text-muted" style={{ textAlign: 'center', padding: 40 }}>
          인쇄할 고지서가 없습니다.
        </div>
      </div>
    );
  }

  return (
    <div className="print-shell penalty-print">
      <div className="print-toolbar">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => window.print()}>
          <i className="ph ph-printer" />인쇄 / PDF 저장
        </button>
        <button type="button" className="btn btn-sm btn-outline" onClick={() => window.close()}>
          닫기
        </button>
        <div className="spacer" />
        <span className="text-base text-text-muted">
          {items.length}건 · 각 2페이지 (원본 · 확인서)
        </span>
      </div>

      {items.map((item, idx) => (
        <PenaltyItemPages key={item.id} item={item} isLast={idx === items.length - 1} />
      ))}

      <style>{`
        @media print {
          .penalty-page { page-break-after: always; break-after: page; }
          .penalty-page.is-last { page-break-after: auto; break-after: auto; }
          .penalty-origin img { max-width: 100%; max-height: 100vh; object-fit: contain; }
          @page { size: A4; margin: 10mm; }
        }
        .penalty-page { min-height: 100vh; padding: 12px 0; }
        .penalty-origin {
          min-height: 600px;
          display: flex; align-items: center; justify-content: center;
          background: #fff;
        }
        .penalty-origin img { max-width: 100%; display: block; }
      `}</style>
    </div>
  );
}

function PenaltyItemPages({ item, isLast }: { item: PenaltyWorkItem; isLast: boolean }) {
  const isPdf = item.fileDataUrl?.startsWith('data:application/pdf');
  const isImage = item.fileDataUrl?.startsWith('data:image/');

  return (
    <>
      {/* 페이지 1 — 원본 */}
      <div className={`penalty-page penalty-origin${isLast ? ' is-last-orig' : ''}`}>
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.fileDataUrl} alt={item.fileName} />
        ) : isPdf ? (
          <div className="text-text-muted text-xl" style={{ padding: 40, textAlign: 'center' }}>
            원본 PDF 파일: <b>{item.fileName}</b><br />
            <span className="text-xs">(PDF는 인쇄에 포함되지 않음 — 별도 출력 필요)</span>
          </div>
        ) : (
          <div className="text-text-muted" style={{ padding: 40 }}>원본 첨부 없음</div>
        )}
      </div>

      {/* 페이지 2 — 확인서 */}
      <div className={`penalty-page${isLast ? ' is-last' : ''}`}>
        <div className="print-doc-title">과태료 확인서</div>
        <div className="print-doc-subtitle">{item.doc_type || '과태료'}</div>

        <table className="print-kv">
          <tbody>
            <Row k="부과기관" v={item.issuer} />
            <Row k="고지서번호" v={item.notice_no} />
            <Row k="차량번호" v={item.car_number} />
            <Row k="위반일시" v={item.date} />
            <Row k="위반장소" v={item.location} />
            <Row k="위반내용" v={item.description} />
            <Row k="적용법조" v={item.law_article} />
            <Row k="납부기한" v={item.due_date} />
            <Row k="과태료금액" v={item.amount ? `${fmt(item.amount)}원` : '-'} />
            {item.fine_amount ? <Row k="범칙금" v={`${fmt(item.fine_amount)}원`} /> : null}
            {item.demerit_points ? <Row k="벌점" v={`${item.demerit_points}점`} /> : null}
            <Row k="납부계좌" v={item.pay_account} />
          </tbody>
        </table>

        <div className="print-section-title">고객 매칭</div>
        <table className="print-kv">
          <tbody>
            <Row k="계약자" v={item._contract?.contractor_name || '미매칭'} />
            <Row k="연락처" v={item._contract?.contractor_phone} />
            <Row k="계약코드" v={item._contract?.contract_code} />
            <Row k="회사명" v={item._asset?.partner_code} />
            <Row k="차량모델" v={item._asset ? [item._asset.manufacturer, item._asset.car_model].filter(Boolean).join(' ') : ''} />
          </tbody>
        </table>

        <div
          className="text-text-muted text-xs" style={{ marginTop: 40, textAlign: 'right' }}
        >
          발행일: {new Date().toISOString().slice(0, 10)}
        </div>
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v?: string | number | null }) {
  return (
    <tr>
      <th>{k}</th>
      <td>{v === undefined || v === null || v === '' ? '-' : String(v)}</td>
    </tr>
  );
}


export default function PenaltyPrintPage() {
  return <Suspense><PenaltyPrintInner /></Suspense>;
}
