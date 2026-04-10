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
    ('/tasks',     'pages/tasks.html',     '해야할 일',  'tasks'),
    ('/asset',     'pages/asset.html',     '자산관리',   'asset'),
    ('/contract',  'pages/contract.html',  '계약관리',   'contract'),
    ('/customer',  'pages/customer.html',  '고객관리',   'customer'),
    ('/billing',   'pages/billing.html',   '수납관리',   'billing'),
    ('/fund',      'pages/fund.html',      '입출금등록', 'fund'),
    ('/ledger',    'pages/ledger.html',    '입출금내역', 'ledger'),
    ('/settings',  'pages/settings.html',  '설정',       'settings'),
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
