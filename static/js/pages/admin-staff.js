/**
 * pages/admin-staff.js — 직원관리 (가입한 사용자 목록)
 */
import { showContextMenu } from '../core/context-menu.js';
import { showToast } from '../core/toast.js';
import { openDetail } from '../core/detail-panel.js';

let gridApi;

export async function mount() {
  document.getElementById('adminTitle').textContent = '직원관리';

  const { ref, get, update } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
  const { db } = await import('../firebase/config.js');

  gridApi = agGrid.createGrid(document.getElementById('adminGrid'), {
    columnDefs: [
      { headerName: '#', valueGetter: 'node.rowIndex+1', width: 45 },
      { headerName: '이름', field: 'name', width: 100 },
      { headerName: '이메일', field: 'email', width: 180 },
      { headerName: '연락처', field: 'phone', width: 120 },
      { headerName: '권한', field: 'role', width: 100,
        cellRenderer: (p) => {
          const r = p.value;
          if (r === 'superadmin') return '<span style="color:var(--c-danger);font-weight:600">최고관리자</span>';
          if (r === 'admin') return '<span style="color:var(--c-primary);font-weight:500">관리자</span>';
          if (r === 'staff') return '직원';
          if (r === 'pending') return '<span style="color:var(--c-warn)">승인대기</span>';
          return r || '-';
        }
      },
      { headerName: '가입일', field: 'created_at', width: 120,
        valueFormatter: (p) => {
          if (!p.value) return '-';
          if (typeof p.value === 'number') return new Date(p.value).toISOString().slice(0, 10);
          return String(p.value).slice(0, 10);
        }
      },
    ],
    rowData: [],
    defaultColDef: { resizable: true, sortable: true, filter: 'agTextColumnFilter', minWidth: 50 },
    rowHeight: 28,
    headerHeight: 28,
    animateRows: false,
    suppressContextMenu: true,
    getRowId: (p) => p.data.uid || String(Math.random()),
  });

  // 우클릭 메뉴
  document.getElementById('adminGrid').addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const rowEl = e.target.closest('[row-index]');
    if (!rowEl) return;
    const rowIndex = parseInt(rowEl.getAttribute('row-index'));
    const node = gridApi.getDisplayedRowAtIndex(rowIndex);
    if (!node) return;
    const d = node.data;

    showContextMenu(e, [
      { label: '관리자 지정', icon: '⭐', disabled: d.role === 'superadmin' || d.role === 'admin', action: async () => {
        await update(ref(db, 'users/' + d.uid), { role: 'admin' });
        showToast(d.name + ' → 관리자', 'success');
        loadUsers();
      }},
      { label: '직원으로 변경', icon: '👤', disabled: d.role === 'superadmin' || d.role === 'staff', action: async () => {
        await update(ref(db, 'users/' + d.uid), { role: 'staff' });
        showToast(d.name + ' → 직원', 'success');
        loadUsers();
      }},
    ]);
  });

  // 행 더블클릭 → 상세
  document.getElementById('adminGrid').addEventListener('dblclick', (e) => {
    const rowEl = e.target.closest('[row-index]');
    if (!rowEl) return;
    const node = gridApi.getDisplayedRowAtIndex(parseInt(rowEl.getAttribute('row-index')));
    if (!node) return;
    const d = node.data;
    const roleMap = { superadmin: '최고관리자', admin: '관리자', staff: '직원', pending: '승인대기' };
    openDetail({
      title: d.name || '-',
      subtitle: d.email || '',
      sections: [{
        label: '기본 정보',
        rows: [
          { label: '이름', value: d.name },
          { label: '이메일', value: d.email },
          { label: '연락처', value: d.phone },
          { label: '권한', value: roleMap[d.role] || d.role },
          { label: '가입일', value: typeof d.created_at === 'number' ? new Date(d.created_at).toISOString().slice(0,10) : (d.created_at || '').slice(0,10) },
        ],
      }],
    });
  });

  loadUsers();

  async function loadUsers() {
    const snap = await get(ref(db, 'users'));
    const data = snap.val() || {};
    const list = Object.entries(data).map(([uid, v]) => ({ uid, ...v }));
    list.sort((a, b) => {
      const order = { superadmin: 0, admin: 1, staff: 2, pending: 3 };
      return (order[a.role] || 9) - (order[b.role] || 9);
    });
    gridApi.setGridOption('rowData', list);
  }
}
