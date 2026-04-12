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
    ('/upload',          'pages/upload.html',          '업로드센터', 'upload'),
    ('/input/operation', 'pages/input-operation.html', '운영등록', 'input_operation'),
    ('/input/asset',     'pages/input-asset.html',     '자산등록', 'input_asset'),
    ('/input/contract',  'pages/input-contract.html',  '계약등록', 'input_contract'),
    ('/fund',            'pages/fund.html',            '입출금등록', 'fund'),
    # 조회
    ('/total',     'pages/total.html',     '통합관리', 'total'),
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
    # 기타
    ('/settings',  'pages/settings.html',  '설정',   'settings'),
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
