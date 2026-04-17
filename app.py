import os, re, time
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass
from flask import Flask, render_template, request, jsonify, redirect

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'jpkerp4-dev')

# ── 알리고 SMS/알림톡 (로컬 개발용) ────────
from services.aligo import send_sms as aligo_sms, send_alimtalk as aligo_alimtalk

@app.route('/api/aligo/sms', methods=['POST'])
def api_aligo_sms():
    d = request.get_json(silent=True) or {}
    to = (d.get('to') or '').strip()
    msg = (d.get('msg') or '').strip() or 'JPK ERP 테스트 메시지입니다.'
    testmode = bool(d.get('testmode', False))
    if not to:
        return jsonify({'ok': False, 'error': '수신번호(to) 필요'}), 400
    return jsonify(aligo_sms(to, msg, testmode=testmode))

# ── Solapi SMS/알림톡 (배포용 — IP 제한 없음) ──
from services.solapi import send_sms as solapi_sms, send_alimtalk as solapi_alimtalk, get_balance as solapi_balance

@app.route('/api/solapi/balance')
def api_solapi_balance():
    return jsonify(solapi_balance())

@app.route('/api/solapi/sms', methods=['POST'])
def api_solapi_sms():
    d = request.get_json(silent=True) or {}
    to = (d.get('to') or '').strip()
    msg = (d.get('msg') or '').strip() or 'JPK ERP 테스트 메시지입니다.'
    if not to:
        return jsonify({'ok': False, 'error': '수신번호(to) 필요'}), 400
    return jsonify(solapi_sms(to, msg))

@app.route('/api/solapi/alimtalk', methods=['POST'])
def api_solapi_alimtalk():
    d = request.get_json(silent=True) or {}
    to = (d.get('to') or '').strip()
    tpl = (d.get('tpl_id') or '').strip()
    vars_ = d.get('variables') or {}
    fb = (d.get('fallback_sms') or '').strip()
    if not (to and tpl):
        return jsonify({'ok': False, 'error': '수신번호/템플릿ID 필요'}), 400
    return jsonify(solapi_alimtalk(to, tpl, vars_, fallback_sms=fb))

# ── 모바일 자동 리다이렉트 ──────────────────
MOBILE_UA_RE = re.compile(r'(iPhone|iPod|Android.*Mobile|webOS|BlackBerry|Windows Phone|Mobile Safari)', re.I)

@app.before_request
def mobile_autoredirect():
    path = request.path
    # 이미 모바일/정적/API 경로는 패스
    if path.startswith('/m/') or path == '/m' or path.startswith('/static') or path.startswith('/api') \
       or path in ('/sw.js', '/manifest.webmanifest', '/login', '/favicon.ico'):
        return
    # 쿠키/쿼리로 데스크탑 강제 (핸드폰에서도 데스크탑 보고 싶을때)
    if request.args.get('desktop') == '1':
        resp = redirect(path)
        resp.set_cookie('force_desktop', '1', max_age=7*24*3600)
        return resp
    if request.cookies.get('force_desktop') == '1':
        return
    # User-Agent 로 모바일 감지 → /m 으로
    ua = request.headers.get('User-Agent', '')
    if MOBILE_UA_RE.search(ua):
        return redirect('/m')

@app.context_processor
def inject_globals():
    if app.debug:
        v = str(int(time.time()))  # 로컬: 매 요청마다 다름
    else:
        # Vercel 환경: 배포 커밋 SHA 사용 → 배포마다 자동 버전업
        v = (os.environ.get('VERCEL_GIT_COMMIT_SHA')
             or os.environ.get('VERCEL_DEPLOYMENT_ID')
             or os.environ.get('APP_VERSION')
             or '0.1.0')[:12]
    return {'v': v}

ROUTES = [
    ('/',          'pages/home.html',      '대시보드',   'index'),
    ('/home',      'pages/home.html',      '대시보드',   'home'),
    # 입력
    # 업로드센터
    ('/upload',          'pages/upload.html',          '업로드',     'upload'),
    ('/upload/list',     'pages/upload-list.html',     '업로드목록', 'upload_list'),
    # 개별입력 (통합 랜딩)
    ('/input',           'pages/input.html',           '개별입력', 'input'),
    ('/input/history',   'pages/input-history.html',   '입력내역', 'input_history'),
    # 개별입력 하위 (개별입력 랜딩에서 링크)
    ('/input/task',      'pages/input-task.html',      '업무생성', 'input_task'),
    ('/input/operation', 'pages/input-operation.html', '운영업무', 'input_operation'),
    ('/input/asset',     'pages/input-asset.html',     '자산등록', 'input_asset'),
    ('/input/contract',  'pages/input-contract.html',  '계약등록', 'input_contract'),
    ('/input/customer',  'pages/customer.html',        '고객등록', 'input_customer'),
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
    ('/loan',      'pages/loan.html',      '할부관리',   'loan'),
    ('/insurance',         'pages/insurance.html',     '보험관리',   'insurance'),
    ('/product',           'pages/product.html',       '상품관리',   'product'),
    ('/finance',           'pages/finance.html',       '재무관리',   'finance'),
    ('/operation/contact',  'pages/operation.html',    '고객응대',   'op_contact'),
    ('/operation/delivery', 'pages/operation.html',    '입출고센터',  'op_delivery'),
    ('/operation/maint',    'pages/operation.html',    '정비이력',   'op_maint'),
    ('/operation/accident', 'pages/operation.html',    '사고이력',   'op_accident'),
    ('/operation/wash',     'pages/operation.html',    '세차',       'op_wash'),
    ('/operation/fuel',     'pages/operation.html',    '주유',       'op_fuel'),
    ('/gps',                'pages/asset.html',        'GPS관리',    'gps'),
    ('/disposal',           'pages/asset.html',        '매각차량',   'disposal'),
    ('/billing/overdue',    'pages/billing.html',      '미납관리',   'billing_overdue'),
    ('/return-schedule',    'pages/return-schedule.html', '반납관리', 'return_schedule'),
    ('/autodebit',          'pages/autodebit.html',       '자동이체', 'autodebit'),
    # 현황
    ('/status/operation','pages/status-operation.html','운영현황', 'status_operation'),
    ('/status/overdue',  'pages/status-overdue.html',  '미납현황', 'status_overdue'),
    ('/status/idle',     'pages/status-idle.html',     '휴차현황', 'status_idle'),
    ('/status/product',  'pages/status-product.html',  '상품대기', 'status_product'),
    ('/status/pending',  'pages/status-pending.html',  '미결업무', 'status_pending'),
    ('/status/ignition', 'pages/status-ignition.html', '시동제어', 'status_ignition'),
    ('/status/expiring', 'pages/status-expiring.html', '만기도래', 'status_expiring'),
    # 고객용
    ('/my',              'pages/my.html',             '계약조회',     'my'),
    ('/profile',         'pages/profile.html',        '내 정보',      'profile'),
    ('/guide',           'pages/guide.html',          '사용설명',     'guide'),
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
    ('/dev',            'pages/dev.html',            '개발도구',     'dev'),
]

def _make_view(tpl, title):
    def view(): return render_template(tpl, page_title=title)
    return view

for path, tpl, title, ep in ROUTES:
    app.add_url_rule(path, endpoint=ep, view_func=_make_view(tpl, title))

@app.route('/login')
def login():
    # 모바일은 전용 템플릿
    ua = request.headers.get('User-Agent', '')
    if MOBILE_UA_RE.search(ua) and not request.cookies.get('force_desktop') == '1':
        return render_template('pages/m/login.html')
    return render_template('login.html')

@app.route('/m/login')
def m_login():
    return render_template('pages/m/login.html')

# ── PWA Service Worker (루트 스코프 필요, 버전 동기화) ──────
from flask import send_from_directory, make_response
@app.route('/sw.js')
def sw():
    body = render_template('sw.js')
    resp = make_response(body)
    resp.headers['Content-Type'] = 'application/javascript'
    resp.headers['Service-Worker-Allowed'] = '/'
    resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    return resp

@app.route('/manifest.webmanifest')
def manifest_root():
    return send_from_directory(app.static_folder, 'manifest.webmanifest',
                               mimetype='application/manifest+json')

# ── 모바일 (운영팀 현장용) ────────────────────
MOBILE_ROUTES = [
    ('/m',          'pages/m/upload.html', '입출고', 'm_upload',  'upload'),
    ('/m/upload',   'pages/m/upload.html', '입출고', 'm_upload_alias', 'upload'),
    ('/m/input',    'pages/m/input.html',  '입력',   'm_input',   'input'),
    ('/m/status',   'pages/m/status.html', '현황',   'm_status',  'status'),
    ('/m/search',   'pages/m/search.html', '조회',   'm_search',  'search'),
    ('/m/me',       'pages/m/me.html',     '내정보', 'm_me',      'me'),
]

def _make_mobile_view(tpl, title, tab):
    def view(): return render_template(tpl, page_title=title, active_tab=tab)
    return view

for path, tpl, title, ep, tab in MOBILE_ROUTES:
    app.add_url_rule(path, endpoint=ep, view_func=_make_mobile_view(tpl, title, tab))

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 7400)), debug=True)
