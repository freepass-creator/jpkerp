"""
services/aligo.py — 알리고 SMS/알림톡 발송

환경변수 (.env):
  ALIGO_USER_ID     = freepasserp
  ALIGO_API_KEY     = xxxxx
  ALIGO_SENDER_NO   = 010-XXXX-XXXX  (승인된 발신번호)
  ALIGO_SENDER_KEY  = xxxxx          (알림톡 발신프로필키, 카카오 연동 후)
"""
import os
import requests

ALIGO_USER_ID = os.environ.get('ALIGO_USER_ID', '')
ALIGO_API_KEY = os.environ.get('ALIGO_API_KEY', '')
ALIGO_SENDER_NO = os.environ.get('ALIGO_SENDER_NO', '')
ALIGO_SENDER_KEY = os.environ.get('ALIGO_SENDER_KEY', '')

SMS_URL = 'https://apis.aligo.in/send/'
ALIMTALK_URL = 'https://kakaoapi.aligo.in/akv10/alimtalk/send/'


def send_sms(receiver: str, message: str, title: str = '', testmode: bool = True) -> dict:
    """SMS 발송. receiver: '01012345678' 형태 (하이픈 허용). testmode=True 면 실제 발송 안 됨."""
    if not (ALIGO_USER_ID and ALIGO_API_KEY and ALIGO_SENDER_NO):
        return {'ok': False, 'error': '알리고 환경변수 미설정 (ALIGO_USER_ID/API_KEY/SENDER_NO)'}

    data = {
        'user_id': ALIGO_USER_ID,
        'key': ALIGO_API_KEY,
        'sender': ALIGO_SENDER_NO.replace('-', ''),
        'receiver': receiver.replace('-', ''),
        'msg': message,
        'title': title or '알림',
        'testmode_yn': 'Y' if testmode else 'N',
    }
    r = requests.post(SMS_URL, data=data, timeout=10)
    try:
        body = r.json()
    except Exception:
        return {'ok': False, 'error': f'응답 파싱 실패: {r.text[:200]}'}
    return {'ok': str(body.get('result_code')) == '1', 'raw': body}


def send_alimtalk(receiver: str, tpl_code: str, message: str,
                  button: dict | None = None, fallback_sms: str = '',
                  testmode: bool = True) -> dict:
    """알림톡 발송. 실패 시 fallback_sms 있으면 문자로 대체발송."""
    if not (ALIGO_USER_ID and ALIGO_API_KEY and ALIGO_SENDER_KEY and ALIGO_SENDER_NO):
        return {'ok': False, 'error': '알리고 환경변수 미설정 (ALIGO_SENDER_KEY 포함)'}

    data = {
        'apikey': ALIGO_API_KEY,
        'userid': ALIGO_USER_ID,
        'senderkey': ALIGO_SENDER_KEY,
        'tpl_code': tpl_code,
        'sender': ALIGO_SENDER_NO.replace('-', ''),
        'receiver_1': receiver.replace('-', ''),
        'subject_1': '알림톡',
        'message_1': message,
        'testMode': 'Y' if testmode else 'N',
    }
    if fallback_sms:
        data['failover'] = 'Y'
        data['fsubject_1'] = '알림'
        data['fmessage_1'] = fallback_sms
    if button:
        import json
        data['button_1'] = json.dumps({'button': [button]}, ensure_ascii=False)

    r = requests.post(ALIMTALK_URL, data=data, timeout=10)
    try:
        body = r.json()
    except Exception:
        return {'ok': False, 'error': f'응답 파싱 실패: {r.text[:200]}'}
    return {'ok': str(body.get('code')) == '0', 'raw': body}
