/**
 * grid-filter.js — AG Grid 헤더 클릭 → 값 목록 필터 드롭다운
 *
 * 사용: initGridFilter(gridApi, gridElement)
 * 헤더 칸 클릭 → 해당 컬럼의 고유 값 목록 (빈도순) → 클릭하면 필터
 */

let popup = null;

export function initGridFilter(gridApi, gridEl) {
  gridEl.addEventListener('click', (e) => {
    const headerCell = e.target.closest('.ag-header-cell');
    if (!headerCell) return;
    const colId = headerCell.getAttribute('col-id');
    if (!colId || colId === '0') return; // # 컬럼 무시

    e.stopPropagation();
    showFilterPopup(gridApi, colId, headerCell);
  });

  // 바깥 클릭 → 닫기
  document.addEventListener('click', (e) => {
    if (popup && !popup.contains(e.target)) closePopup();
  });
}

function showFilterPopup(gridApi, colId, headerEl) {
  closePopup();

  // 현재 데이터에서 해당 컬럼 값 수집 (빈도순)
  const counts = {};
  gridApi.forEachNode(node => {
    const val = String(node.data?.[colId] ?? '').trim() || '(빈값)';
    counts[val] = (counts[val] || 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, c]) => s + c, 0);

  // 현재 필터 확인
  const filterInstance = gridApi.getFilterInstance(colId);
  const currentFilter = filterInstance?.getModel()?.filter || '';

  // 위치
  const rect = headerEl.getBoundingClientRect();

  popup = document.createElement('div');
  popup.className = 'grid-filter-popup';
  popup.style.top = rect.bottom + 'px';
  popup.style.left = rect.left + 'px';
  popup.style.minWidth = Math.max(rect.width, 160) + 'px';

  popup.innerHTML = `
    <input class="gf-search" placeholder="검색..." autofocus>
    <div class="gf-list">
      ${sorted.map(([val, cnt]) => {
        const active = currentFilter === val ? ' is-active' : '';
        const label = val === '(빈값)' ? '<span style="color:var(--c-text-muted)">(빈값)</span>' : val;
        return `<div class="gf-item${active}" data-val="${val === '(빈값)' ? '' : val}">${label}<span class="gf-count">${cnt}</span></div>`;
      }).join('')}
    </div>
    <div class="gf-clear">전체 (${total})</div>
  `;

  document.body.appendChild(popup);

  // 검색
  const searchInput = popup.querySelector('.gf-search');
  const listEl = popup.querySelector('.gf-list');
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase();
    listEl.querySelectorAll('.gf-item').forEach(item => {
      item.style.display = item.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });

  // 항목 클릭 → 필터
  listEl.querySelectorAll('.gf-item').forEach(item => {
    item.addEventListener('click', () => {
      const val = item.dataset.val;
      if (filterInstance) {
        filterInstance.setModel(val ? { type: 'equals', filter: val } : null);
        gridApi.onFilterChanged();
      }
      closePopup();
    });
  });

  // 전체 → 필터 해제
  popup.querySelector('.gf-clear').addEventListener('click', () => {
    if (filterInstance) {
      filterInstance.setModel(null);
      gridApi.onFilterChanged();
    }
    closePopup();
  });

  searchInput.focus();
}

function closePopup() {
  if (popup) { popup.remove(); popup = null; }
}
