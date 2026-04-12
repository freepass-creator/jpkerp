/**
 * grid-filter.js — AG Grid 헤더 클릭 → 값 목록 필터
 *
 * 자동 초기화: initAllGridFilters() — 페이지 내 모든 AG Grid에 바인딩
 */

let popup = null;

export function initAllGridFilters() {
  document.addEventListener('click', (e) => {
    const headerCell = e.target.closest('.ag-header-cell');
    if (!headerCell) { closePopup(); return; }

    const colId = headerCell.getAttribute('col-id');
    if (!colId || colId === '0') return;

    // AG Grid element 찾기
    const gridEl = headerCell.closest('.ag-theme-alpine');
    if (!gridEl) return;

    e.stopPropagation();

    // AG Grid API 접근 — 내부 속성
    let api = null;
    try {
      const rows = gridEl.querySelectorAll('.ag-row');
      if (!rows.length) return;
      // getRowData를 직접 DOM에서 추출
      api = gridEl.__agGridApi || gridEl._agApi;
    } catch {}

    if (!api) {
      // fallback: DOM에서 직접 데이터 추출
      showDomFilterPopup(gridEl, colId, headerCell);
      return;
    }

    showFilterPopup(api, colId, headerCell);
  });
}

function showDomFilterPopup(gridEl, colId, headerEl) {
  closePopup();

  const headers = gridEl.querySelectorAll('.ag-header-cell');
  let colIdx = -1;
  headers.forEach((h, i) => { if (h.getAttribute('col-id') === colId) colIdx = i; });
  if (colIdx < 0) return;

  const counts = {};
  gridEl.querySelectorAll('.ag-row').forEach(row => {
    const cells = row.querySelectorAll('.ag-cell');
    const cell = cells[colIdx];
    const val = (cell?.textContent || '').trim() || '(빈값)';
    counts[val] = (counts[val] || 0) + 1;
  });

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, c]) => s + c, 0);
  const uniqueCount = sorted.length;
  const isSearchMode = uniqueCount > 10;
  const rect = headerEl.getBoundingClientRect();

  popup = document.createElement('div');
  popup.className = 'grid-filter-popup';
  popup.style.top = rect.bottom + 2 + 'px';
  popup.style.left = rect.left + 'px';
  popup.style.minWidth = Math.max(rect.width, 140) + 'px';

  if (isSearchMode) {
    popup.innerHTML = `
      <input class="gf-search" placeholder="검색어 입력 후 Enter..." autofocus>
      <div class="gf-clear">전체 (${total})</div>
    `;
    const searchInput = popup.querySelector('.gf-search');
    const doSearch = () => {
      const q = searchInput.value.toLowerCase();
      gridEl.querySelectorAll('.ag-row').forEach(row => {
        const cells = row.querySelectorAll('.ag-cell');
        const cell = cells[colIdx];
        const cellVal = (cell?.textContent || '').trim().toLowerCase();
        row.style.display = !q || cellVal.includes(q) ? '' : 'none';
      });
      if (q) closePopup();
    };
    searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
  } else {
    popup.innerHTML = `
      <div class="gf-list">
        ${sorted.map(([val, cnt]) =>
          `<div class="gf-item" data-val="${val}">${val}<span class="gf-count">${cnt}</span></div>`
        ).join('')}
      </div>
      <div class="gf-clear">전체 (${total})</div>
    `;
    popup.querySelectorAll('.gf-item').forEach(item => {
      item.addEventListener('click', () => {
        const val = item.dataset.val;
        gridEl.querySelectorAll('.ag-row').forEach(row => {
          const cells = row.querySelectorAll('.ag-cell');
          const cell = cells[colIdx];
          const cellVal = (cell?.textContent || '').trim() || '(빈값)';
          row.style.display = cellVal === val ? '' : 'none';
        });
        closePopup();
      });
    });
  }

  popup.querySelector('.gf-clear').addEventListener('click', () => {
    gridEl.querySelectorAll('.ag-row').forEach(row => { row.style.display = ''; });
    closePopup();
  });

  document.body.appendChild(popup);
  popup.querySelector('.gf-search')?.focus();
}

function showFilterPopup(api, colId, headerEl) {
  closePopup();

  const counts = {};
  api.forEachNode(node => {
    const val = String(node.data?.[colId] ?? '').trim() || '(빈값)';
    counts[val] = (counts[val] || 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, c]) => s + c, 0);
  const uniqueCount = sorted.length;
  const isSearchMode = uniqueCount > 10;
  const rect = headerEl.getBoundingClientRect();
  const filterInstance = api.getFilterInstance(colId);

  popup = document.createElement('div');
  popup.className = 'grid-filter-popup';
  popup.style.top = rect.bottom + 2 + 'px';
  popup.style.left = rect.left + 'px';
  popup.style.minWidth = Math.max(rect.width, 140) + 'px';

  if (isSearchMode) {
    popup.innerHTML = `
      <input class="gf-search" placeholder="검색어 입력 후 Enter..." autofocus>
      <div class="gf-clear">전체 (${total})</div>
    `;
    const searchInput = popup.querySelector('.gf-search');
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = searchInput.value.trim();
        if (filterInstance) {
          filterInstance.setModel(q ? { type: 'contains', filter: q } : null);
          api.onFilterChanged();
        }
        closePopup();
      }
    });
  } else {
    const currentFilter = filterInstance?.getModel()?.filter || '';
    popup.innerHTML = `
      <div class="gf-list">
        ${sorted.map(([val, cnt]) => {
          const active = currentFilter === val ? ' is-active' : '';
          return `<div class="gf-item${active}" data-val="${val === '(빈값)' ? '' : val}">${val}<span class="gf-count">${cnt}</span></div>`;
        }).join('')}
      </div>
      <div class="gf-clear">전체 (${total})</div>
    `;
    popup.querySelectorAll('.gf-item').forEach(item => {
      item.addEventListener('click', () => {
        const val = item.dataset.val;
        if (filterInstance) {
          filterInstance.setModel(val ? { type: 'equals', filter: val } : null);
          api.onFilterChanged();
        }
        closePopup();
      });
    });
  }

  popup.querySelector('.gf-clear').addEventListener('click', () => {
    if (filterInstance) { filterInstance.setModel(null); api.onFilterChanged(); }
    closePopup();
  });

  document.body.appendChild(popup);
  popup.querySelector('.gf-search')?.focus();
}

function closePopup() {
  if (popup) { popup.remove(); popup = null; }
}
