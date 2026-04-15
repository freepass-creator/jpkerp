"""
services/solapi.py — Solapi (구 쿨SMS) SMS/알림톡 발송

환경변수 (.env):
  SOLAPI_API_KEY     = NCSV5JTOZ121DIDR
  SOLAPI_API_SECRET  = xxxxx
  SOLAPI_SENDER_NO   = 010-XXXX-XXXX  (등록된 발신번호)
  SOLAPI_PFID        = xxxxx          (카카오 비즈채널 연결 후, 알림톡용)

인증: HMAC-SHA256 시그니처 (date + salt 기반)
"""
import os
import hmac
import hashlib
import secrets
import datetime
import requests

API_KEY = os.environ.get('SOLAPI_API_KEY', '')
API_SECRET = os.environ.get('SOLAPI_API_SECRET', '')
SENDER_NO = os.environ.get('SOLAPI_SENDER_NO', '')
PFID = os.environ.get('SOLAPI_PFID', '')

BASE_URL = 'https://api.solapi.com'


def _auth_header():
    """HMAC-SHA256 인증 헤더 생성"""
    date = datetime.datetime.now(datetime.timezone.utc).isoformat()
    salt = secrets.token_hex(16)
    msg = (date + salt).encode()
    sig = hmac.new(API_SECRET.encode(), msg, hashlib.sha256).hexdigest()
    return {
        'Authorization': f'HMAC-SHA256 apiKey={API_KEY}, date={date}, salt={salt}, signature={sig}',
        'Content-Type': 'application/json; charset=utf-8',
    }


def _normalize_phone(p: str) -> str:
    return (p or '').replace('-', '').replace(' ', '').strip()


def send_sms(receiver: str, message: str, subject: str = '') -> dict:
    """SMS/LMS 자동 분기 (메시지 길이 기준). subject는 LMS에서 사용."""
    if not (API_KEY and API_SECRET and SENDER_NO):
        return {'ok': False, 'error': 'Solapi 환경변수 미설정 (API_KEY/SECRET/SENDER_NO)'}

    msg = {
        'to': _normalize_phone(receiver),
        'from': _normalize_phone(SENDER_NO),
        'text': message,
    }
    if subject:
        msg['subject'] = subject

    body = {'message': msg}
    try:
        r = requests.post(f'{BASE_URL}/messages/v4/send',
                          headers=_auth_header(), json=body, timeout=10)
        data = r.json()
    except Exception as e:
        return {'ok': False, 'error': f'요청 실패: {e}'}

    # Solapi 응답: { messageId, statusCode: '2000' (성공), statusMessage }
    ok = str(data.get('statusCode')) == '2000'
    return {'ok': ok, 'raw': data}


def send_alimtalk(receiver: str, tpl_id: str, variables: dict | None = None,
                  fallback_sms: str = '') -> dict:
    """
    알림톡 발송. tpl_id는 Solapi 콘솔에서 발급된 템플릿 ID.
    variables: {'고객명': '홍길동', '차량번호': '123가4567', ...}
    fallback_sms: 알림톡 실패 시 SMS로 대체 발송할 문구
    """
    if not (API_KEY and API_SECRET and SENDER_NO and PFID):
        return {'ok': False, 'error': 'Solapi 알림톡 환경변수 미설정 (PFID 포함)'}

    msg = {
        'to': _normalize_phone(receiver),
        'from': _normalize_phone(SENDER_NO),
        'kakaoOptions': {
            'pfId': PFID,
            'templateId': tpl_id,
            'variables': variables or {},
        },
    }
    if fallback_sms:
        msg['text'] = fallback_sms  # 알림톡 실패 시 SMS 대체 발송

    body = {'message': msg}
    try:
        r = requests.post(f'{BASE_URL}/messages/v4/send',
                          headers=_auth_header(), json=body, timeout=10)
        data = r.json()
    except Exception as e:
        return {'ok': False, 'error': f'요청 실패: {e}'}

    ok = str(data.get('statusCode')) == '2000'
    return {'ok': ok, 'raw': data}


def get_balance() -> dict:
    """잔액 조회 — API 연결 테스트용"""
    if not (API_KEY and API_SECRET):
        return {'ok': False, 'error': '환경변수 미설정'}
    try:
        r = requests.get(f'{BASE_URL}/cash/v1/balance',
                         headers=_auth_header(), timeout=10)
        return {'ok': r.status_code == 200, 'raw': r.json()}
    except Exception as e:
        return {'ok': False, 'error': f'요청 실패: {e}'}
