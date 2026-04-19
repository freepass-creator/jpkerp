# 다음 세션 이어가기 — 전역 감사 큰 공사 3건

**작성**: 2026-04-20 · **리포**: github.com/freepass-creator/jpkerp2 (main)
**이전 세션 결과**: 즉시 + 중간 단계 완료 (아래 "완료 목록" 참조)

---

## 이전 세션 완료 요약

### 기능 추가
- **반납/회수 상태 전이** — [`app/(workspace)/input/operation/forms/ioc-form.tsx`](app/(workspace)/input/operation/forms/ioc-form.tsx) afterSave: 정상반납→`계약완료` + asset `휴차/상품화대기/정비중`, 강제회수→`계약해지` + `상품화대기`, 정상출고→`가동중`
- **반납 추가청구 → billings** — [`lib/derive/billings.ts`](lib/derive/billings.ts) `deriveBillingsFromReturnExtras()` 신규 (과주행·연료부족·손상수리 행 생성)
- **계약 연장 폼** — [`app/(workspace)/input/forms/contract-extension-form.tsx`](app/(workspace)/input/forms/contract-extension-form.tsx) 신규, `is_extension=true` + `original_contract_id` + 수납스케줄 재파생 + 원본 계약 `계약완료` 처리
- **/my 고객 포털** — [`app/my/page.tsx`](app/my/page.tsx), [`app/api/my/route.ts`](app/api/my/route.ts), [`lib/my/portal-auth.ts`](lib/my/portal-auth.ts). 차량번호 + 등록번호(주민/법인/사업자/전화) 인증 + HMAC 세션 30분. 운영 전 `MY_PORTAL_SECRET` env 설정 필수.

### 전역 감사 정리 (즉시 · 중간)
- `isActiveContractStatus()` ([`lib/data/contract-status.ts`](lib/data/contract-status.ts)) 5파일 적용 — ioc-form, disposal-form, car-number-picker, bulk-delivery, api/my
- `shortDate()` → [`lib/date-utils.ts`](lib/date-utils.ts) 승격. op-form-base / contract-extension-form 로컬 정의 제거
- `ph-car-simple` → `ph-car` 일원화 (my/page.tsx)
- `.my-pill` CSS 삭제, `.jpk-pill tone-X`로 단일화 (my/page.tsx 4곳)
- [`lib/hooks/useLookups.ts`](lib/hooks/useLookups.ts) 신규 — `useAssetByCar`, `useContractByCar({activeOnly, requireContractor})`, `useContractByCode`. 6파일에 적용 (op-form-base, disposal-form, ioc-form, op-context-panel, product-register-form, key-form)
- [`components/shared/empty-state.tsx`](components/shared/empty-state.tsx) 신규 (UI-STANDARDS 9.3 준수). op-context-panel + input-context-panel 적용

---

## 🚧 큰 공사 3건 (다음 세션)

### 1. 인라인 스타일 청소 — **먼저 시작 권장**
**리스크**: 저 · **노동**: 고 (120+곳)

`style={{ fontSize: 11/12/13, color: 'var(--c-text-muted)' }}` 패턴이 120회 이상 반복. Tailwind 없이 CSS 유틸 클래스로 승격.

**작업 순서**:
1. [`app/globals.css`](app/globals.css) 끝에 유틸 추가:
   ```css
   .text-xs  { font-size: 10px; }
   .text-sm  { font-size: 11px; }
   .text-md  { font-size: 12px; }
   .text-lg  { font-size: 13px; }
   .text-muted { color: var(--c-text-muted); }
   .text-sub   { color: var(--c-text-sub); }
   ```
2. Grep으로 상위 빈발 파일 선별 (op-context-panel, rtdb-status, my/page.tsx, ocr-capture-form 순)
3. 파일별로 `style={{ fontSize: 11 }}` → `className="text-sm"` 치환, 혼합된 경우 일부만 추출
4. 치환 후 시각 확인 (`npm run dev` → 해당 페이지 열람)

**주의**: `fontSize: 10px`는 `--font-size-xs` 토큰과 겹침 확인. 기존 토큰 있으면 재활용.

---

### 2. InputFormShell → OpFormBase 통합
**리스크**: 중 · **노동**: 중

두 shell 기능 99% 동일. `OpFormBase`는 `op-context-store`(차량번호 공유)에 의존하는데 개별입력 폼은 이 store를 안 씀 — **의존성 분리가 선결**.

**설계 선택지**:
- **A안**: OpFormBase에서 `useOpContext` 의존을 prop으로 주입 (`carNumber` prop). 둘 다 같은 shell 사용 가능
- **B안**: 두 shell의 공통부를 `BaseFormShell`로 추출, OpFormBase는 확장만 담당. InputFormShell 유지하되 내부 구현 공유

**권장**: A안. `op-context-store`는 `/input/operation` workspace 전용(세 패널이 차량번호 공유)이라 일반 input에 끌어들이면 안 됨. OpFormBase를 "shell + (옵션)외부 컨텍스트" 형태로.

**작업 순서**:
1. [`app/(workspace)/input/operation/op-form-base.tsx`](app/(workspace)/input/operation/op-form-base.tsx) 에 `carNumber?/date?/onCarChange?/onDateChange?` props 추가, `useOpContext`를 default fallback으로
2. [`app/(workspace)/input/forms/input-form-shell.tsx`](app/(workspace)/input/forms/input-form-shell.tsx) 를 래퍼로 얇게 (OpFormBase 재사용)
3. 기존 7개 input 폼(asset/contract/customer/task/gps/partner/ocr/extension) 영향 확인
4. 테스트: 각 폼 1회씩 등록 테스트

**의외 복잡점**: InputFormShell은 `form="inputForm"` / OpFormBase는 `form="opForm"` id가 다름. panel-head 버튼이 id로 submit 연결돼 있어서, 통합 시 한쪽 id 통일 또는 button도 분리 필요.

---

### 3. OpKey 17 → 11 축소
**리스크**: **높음** (DB 이벤트 `type` 마이그레이션 필요) · **노동**: 중

현재 [`app/(workspace)/input/operation/op-types.ts`](app/(workspace)/input/operation/op-types.ts) `OpKey` 17종 중 실질 중복:

| 현재 | 통합안 | 이주 전략 |
|-----|-------|---------|
| `maint` + `repair` | `pc_work` (type_detail) | events 테이블에서 `type='maint'` → `type='pc_work', type_detail='maint'` 일괄 변환 |
| `penalty` + `penalty_notice` | `penalty` (subtype) | `type='penalty_notice'` → `type='penalty', subtype='notice'` |
| `product` + `product_register` | `product_flow` (stage) | `type='product_register'` → `type='product_flow', stage='register'` |
| `wash` → `pc_work` 흡수 | `pc_work` (type_detail='wash') | `type='wash'` → `type='pc_work', type_detail='wash'` |

**보류 권장**: 지금은 enum 줄이기보다, 운영 중 데이터 이주 스크립트 + 롤백 플랜 준비 후 진행.
당장 진행하려면 [`scripts/migrate.ts`](scripts/migrate.ts) 참조해서 옮김 스크립트 작성, dev 환경에서 먼저 적용 → 프로덕션 RTDB 백업 → 일괄 이주.

---

## 기타 남은 것

### 미수금 3중 관리 정리 (이전 세션에서 유예)
현재 `collect event` / `billing.overdue` / `status/overdue` 3곳에 흩어짐.
**제안된 경계**:
- `billings` = SoT (금액·상태)
- `collect event` = 처리 로그 (독촉·내용증명만)
- `status/overdue` = billing.overdue 뷰

**작업**: `collect-form.tsx` 재검토 → 금액 필드가 있으면 billing 파생으로 전환. event는 log-only로.

### env 세팅 (회사 PC)
```bash
cp .env.local.example .env.local
# .env.local에 Firebase 키 채우기 (NEXT_PUBLIC_FIREBASE_*)
# /my 포털 운영 전: MY_PORTAL_SECRET 추가 (HMAC 키)
```

### 포털 하드코딩 교체
[`app/my/page.tsx`](app/my/page.tsx) 긴급연락 섹션:
- `tel:1588-0000` (사고·정비 24시간)
- `tel:02-0000-0000` (고객센터)
- 이메일 `jpkpyh@gmail.com` (신청 4종)

실제 번호/주소로 교체 필요.

---

## 감사 결과 요약 (참고)

**치명적 발견**:
- `isActiveContractStatus()` 만들어놓고 실제 0회 호출 → 이번 세션에 5파일 적용으로 해결
- `InputFormShell` vs `OpFormBase` 기능 99% 동일 → 통합 대상
- `OpKey` 17종 중 실질 중복 다수 → 11종으로 축소 가능

**디자인 이중 정의 (남은 것)**:
- 버튼 `.btn` (32px) vs `.m-btn` (44px, 폰트 리터럴) — 토큰 통일 검토
- Key-Value `.jpk-item-table` vs `.my-kv` — 용도 분리, 내부 토큰 공유

**아이콘 규약** (결정됨, 문서화만 남음):
- 일반 차량 `ph-car`, 사고 `ph-car-profile`, `ph-car-simple` 금지
- 고객 신규 `ph-user-circle-plus`, 직원 `ph-users-three`
- 저장 진행 `ph-spinner spin`, 완료 `ph-check` (단일 checkmark) / `ph-check-circle` (완료 상태)

---

## 업무 흐름 커버리지

| 단계 | 폼 | 상태 |
|-----|---|-----|
| 차량 구입 | asset-create-form + ocr-capture-form | ✓ |
| 계약 체결 | contract-create-form | ✓ (deriveBillingsFromContract 자동) |
| 사후 관리 | 17개 운영폼 | ✓ (OpKey 축소 후 11개 목표) |
| 계약 종료 | ioc-form `정상반납` (추가청구 포함) | ✓ |
| 연장 운행 | contract-extension-form | ✓ |
| 재계약 | contract-create-form 재활용 + `is_renewal=true` | **폼 미분리** — 필요시 전용 폼 신규 |

**구멍**: 재계약 전용 폼 없음. 지금은 신규 계약 폼에서 `is_renewal` 플래그 수동 세팅해야 함. 필요도 낮으면 유지.
