# JPK ERP — 장기렌터카 내부 전산

## 메뉴 구조 (1차 — 핵심 3개)
```
대시보드
해야할 일
차량등록             ← 자산 + 할부
계약등록             ← 계약 + 고객 → 청구 자동생성
수납관리             ← 청구 목록 + 입금 매칭 + 미수 추적
설정
```

## 규격 (확정)
| 항목 | 값 |
|------|-----|
| 라운드 | 6px |
| 버튼/입력 높이 | 32px |
| 테두리 | 1px #cbd5e1 |
| 패널헤드 | 52px |
| 폰트 | 12px |
| primary | #475569 |
| 아이콘 | 14px |

## 트리
```
jpkerp4/
├── app.py
├── templates/
│   ├── base.html
│   ├── workspace.html
│   ├── login.html
│   ├── _macros/
│   │   └── ui.html
│   └── pages/
│       ├── home.html
│       ├── tasks.html
│       ├── car/
│       │   ├── register.html
│       │   └── status.html
│       ├── contract/
│       │   ├── register.html
│       │   └── status.html
│       ├── daily/
│       │   ├── operation.html
│       │   └── finance.html
│       ├── report/
│       │   ├── schedule.html
│       │   └── analysis.html
│       └── settings.html
├── static/
│   ├── css/
│   │   ├── tokens.css
│   │   ├── reset.css
│   │   ├── layout.css
│   │   ├── panel.css
│   │   ├── controls.css
│   │   ├── form.css
│   │   ├── grid.css
│   │   └── util.css
│   └── js/
│       ├── app.js
│       ├── core/
│       │   ├── icons.js
│       │   ├── entry-page.js
│       │   ├── toast.js
│       │   ├── menu.js
│       │   └── scheduler.js
│       ├── firebase/
│       │   ├── config.js
│       │   ├── db.js
│       │   ├── assets.js
│       │   ├── contracts.js
│       │   ├── billings.js
│       │   ├── loans.js
│       │   ├── events.js
│       │   └── tasks.js
│       ├── data/schemas/
│       │   ├── asset.js
│       │   ├── contract.js
│       │   └── operation.js
│       ├── widgets/
│       │   ├── csv-upload.js
│       │   └── panel-resize.js
│       └── pages/
│           ├── home.js
│           ├── tasks.js
│           ├── car-register.js
│           ├── car-status.js
│           ├── contract-register.js
│           ├── contract-status.js
│           ├── daily-operation.js
│           ├── daily-finance.js
│           ├── report-schedule.js
│           ├── report-analysis.js
│           └── settings.js
```

## 빌드 순서
1. 뼈대 (CSS + 레이아웃 + 매크로 + app.py)
2. Firebase 레이어 복사 + 신규(loans/tasks)
3. 차량등록 → 차량현황
4. 계약등록 → 계약현황 → 청구 자동생성
5. 운영입력 → 입출금
6. 사전안내 엔진 → 해야할 일
7. 스케줄 → 분석 → 대시보드
