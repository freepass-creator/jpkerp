import type { CellStyle, ColDef } from 'ag-grid-community';
import { JpkSetFilter } from './set-filter';

export type ColType = 'select' | 'text' | 'number' | 'date' | 'action';

/** cellStyle에서 분기별로 다른 키를 반환해도 허용하는 느슨한 함수 타입 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseCellStyleFn<T = any> = (params: { value: unknown; data: T; [k: string]: unknown }) => Record<string, string | number | undefined> | CellStyle | null | undefined;
type LooseColDef<T> = Omit<ColDef<T>, 'cellStyle'> & { cellStyle?: CellStyle | LooseCellStyleFn<T> };

/**
 * 타입별 기본 필터·정렬·정렬방식을 주입한 ColDef 생성.
 */
export function typedColumn<T>(type: ColType, def: LooseColDef<T>): ColDef<T> {
  const base = { ...def } as ColDef<T>;

  if (type === 'number') {
    // 숫자: 필터 없음, 정렬(오름/내림)만. 우측 정렬 + tabular-nums
    base.filter = false;
    base.sortable ??= true;
    base.cellClass = [base.cellClass, 'col-right'].filter(Boolean).join(' ');
    base.headerClass = [base.headerClass, 'col-right'].filter(Boolean).join(' ');
    base.cellStyle = { fontVariantNumeric: 'tabular-nums', ...(typeof base.cellStyle === 'object' && base.cellStyle ? base.cellStyle : {}) } as ColDef<T>['cellStyle'];
  } else if (type === 'action') {
    // 행번호·버튼 등: 필터·정렬 모두 꺼짐
    base.filter = false;
    base.sortable = false;
  } else {
    // select / text / date — 모두 엑셀식 체크박스 드롭다운 필터 (JpkSetFilter)
    base.filter = base.filter ?? JpkSetFilter;
    base.sortable ??= true;
  }

  return base;
}

/**
 * 행번호(#) 컬럼 — 거의 모든 그리드 첫 컬럼으로 사용.
 * @param opts.width 기본 45
 * @param opts.pinned 'left' 고정 여부
 */
export function rowNumColumn<T = unknown>(opts?: { width?: number; pinned?: 'left' | 'right' }): ColDef<T> {
  return typedColumn<T>('action', {
    headerName: '#',
    valueGetter: (p: { node: { rowIndex: number | null } | null }) => (p.node?.rowIndex ?? 0) + 1,
    width: opts?.width ?? 45,
    ...(opts?.pinned ? { pinned: opts.pinned } : {}),
    cellStyle: { color: 'var(--c-text-muted)' },
  });
}

/** 코드/계좌번호/증권번호 등 고정폭 글꼴 필요한 셀에 쓰는 공통 스타일 (11px). */
export const MONO_CELL_STYLE: CellStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
};

/** MONO_CELL_STYLE + 굵게 (회사코드 등 강조 코드용). */
export const MONO_CELL_STYLE_BOLD: CellStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  fontWeight: '600',
};
