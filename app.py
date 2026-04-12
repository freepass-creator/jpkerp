import os, time
from flask import Flask, render_template

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'jpkerp4-dev')

@app.context_processor
def inject_globals():
    v = str(int(time.time())) if app.debug else '0.1.0'
    return {'v': v}

ROUTES = [
    ('/',          'pages/home.html',      '대시보드',   'index'),
    ('/home',      'pages/home.html',      '대시보드',   'home'),
    # 입력
    # 업로드센터
    ('/upload',          'pages/upload.html',          '업로드',     'upload'),
    ('/upload/list',     'pages/upload-list.html',     '업로드목록', 'upload_list'),
    # 입력
    ('/input/task',      'pages/input-task.html',      '업무생성', 'input_task'),
    ('/input/operation', 'pages/input-operation.html', '운영등록', 'input_operation'),
    ('/input/asset',     'pages/input-asset.html',     '자산등록', 'input_asset'),
    ('/input/contract',  'pages/input-contract.html',  '계약등록', 'input_contract'),
    ('/fund',            'pages/fund.html',            '입출금등록', 'fund'),
    # 조회
    ('/total',     'pages/total.html',     '통합관리', 'total'),
    ('/tasks',     'pages/tasks.html',     '업무관리', 'tasks_view'),
    ('/operation', 'pages/operation.html', '운영관리', 'operation'),
    ('/asset',     'pages/asset.html',     '자산관리', 'asset'),
    ('/contract',  'pages/contract.html',  '계약관리', 'contract'),
    ('/customer',  'pages/customer.html',  '고객관리', 'customer'),
    ('/billing',   'pages/billing.html',   '수납관리', 'billing'),
    ('/ledger',    'pages/ledger.html',    '입출금관리', 'ledger'),
    # 현황
    ('/status/overdue',  'pages/status-overdue.html',  '미납현황', 'status_overdue'),
    ('/status/idle',     'pages/status-idle.html',     '휴차현황', 'status_idle'),
    ('/status/expiring', 'pages/status-expiring.html', '만기도래', 'status_expiring'),
    # 고객용
    ('/my',              'pages/my.html',             '계약조회',     'my'),
    # 회사관리
    ('/admin/company',  'pages/admin-company.html',  '회사정보',     'admin_company'),
    ('/admin/staff',    'pages/admin-staff.html',    '직원관리',     'admin_staff'),
    ('/admin/card',     'pages/admin-card.html',     '법인카드관리', 'admin_card'),
    ('/admin/account',  'pages/admin-account.html',  '계좌관리',     'admin_account'),
    ('/admin/vendor',   'pages/admin-vendor.html',   '거래처관리',   'admin_vendor'),
    ('/admin/member',   'pages/admin-member.html',   '회원사관리',   'admin_member'),
    ('/admin/notice',   'pages/admin-notice.html',   '고지서업무',   'admin_notice'),
    ('/admin/approval', 'pages/admin-approval.html', '전자결재',     'admin_approval'),
    ('/admin/leave',    'pages/admin-leave.html',    '휴가관리',     'admin_leave'),
    ('/admin/lease',    'pages/admin-lease.html',    '임대관리',     'admin_lease'),
    ('/admin/contract', 'pages/admin-contract.html', '계약서관리',   'admin_contract'),
    ('/admin/seal',     'pages/admin-seal.html',     '인감/도장',    'admin_seal'),
]

def _make_view(tpl, title):
    def view(): return render_template(tpl, page_title=title)
    return view

for path, tpl, title, ep in ROUTES:
    app.add_url_rule(path, endpoint=ep, view_func=_make_view(tpl, title))

@app.route('/login')
def login():
    return render_template('login.html')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 7400)), debug=True)
