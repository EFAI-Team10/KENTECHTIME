# 수정사항 정리

## UI — 포털 수강이력 가져오기 안내 통일

### 문제
- Dashboard의 "수강이력 가져오기"는 북마클릿 드래그 방식으로 안내
- Settings의 "포털에서 가져오기"는 F12 콘솔 방식으로만 안내
- 팀원 커밋 이후 Dashboard.css에 `.guide-note` 클래스가 없어 UI 깨짐

### 변경 파일

**`components/Settings/SettingsModal.jsx`**
- 포털 가이드를 북마클릿 드래그 방식으로 교체 (Dashboard/Onboarding과 통일)
- `BOOKMARKLET_HREF_HTML` import 추가, `dangerouslySetInnerHTML`로 드래그 가능한 `<a>` 버튼 렌더링

**`components/Settings/SettingsModal.css`**
- `.bookmarklet-row`, `.bookmarklet-drag-btn`, `.bookmarklet-hint`, `.guide-note` 스타일 추가
- 미사용 클래스(`.guide-url-row`, `.console-cmd-sm`) 제거

**`components/Dashboard/Dashboard.css`**
- `.guide-note { font-size: 11px; color: #888; }` 추가 (선언은 됐으나 정의 누락된 클래스)

---

## 데이터 — 개설교과목 엑셀 DB 시딩 (seed.js 버그 수정)

### 문제
- `SUPABASE_URL 환경변수가 없습니다` → dotenv 로드 없음
- `category` 전부 null → 엑셀 헤더 `영역\r\n구분`을 `영역\n구분`으로 찾아서 인식 실패
- `target_grade` 전부 0 → 헤더가 `null`인 열을 `indexOf`로 찾으려 해서 항상 -1
- `ON CONFLICT DO UPDATE command cannot affect row a second time` → 같은 파일 내 분반 중복으로 upsert 배치 충돌

### 변경 파일

**`scripts/seed.js`**
- `require('dotenv').config(...)` 추가 (`.env`, `.env.local` 순서로 로드)
- 헤더 `\r\n` 정규화: `.replace(/\r/g, '')`
- `target_grade` 열 인덱스 하드코딩: `grade: 1` (수강학년 열은 항상 index 1)
- 배치 전 `Map`으로 코드 기준 중복 제거

**`package.json`**
- `dotenv` devDependency 추가

---

## 추천 로직 — 최신 학기 자동 고정

### 문제
- 추천 API가 클라이언트 전달 `semester`를 그대로 사용해 과거 학기 과목이 추천에 섞일 수 있었음

### 변경 파일

**`lib/server/recommender.js`**
- `getLatestSemester()` 함수 추가: courses 테이블에서 학기 목록을 가져와 spring(1) < summer(2) < fall(3) < winter(4) 순으로 정렬, 가장 최근 학기 반환
- `getRequiredCourses()`: 클라이언트 전달 semester 무시, 항상 최신 학기 사용
- `generateRecommendations()` 시그니처의 semester 파라미터 → `_semester` 마킹 (API 호환 유지)

---

## 데이터 — 과목 트랙 매핑

### 배경
- courses 테이블에 `track VARCHAR(50)` 컬럼이 있었으나 항상 `null`
- 2026 봄학기 학사편람 기준으로 EL(전공선택) 과목을 4개 트랙으로 분류

### 변경 파일

**`classlist/track-map.json`** (신규)
- 학사편람 섹션 기준 과목코드 → 트랙 매핑 정의

| 트랙 | 과목 수 | 설명 |
|------|--------|------|
| 전기/전자 | 11개 | 기초회로이론, 전력전자, 제어이론과응용 등 |
| 재료/화학 | 18개 | 재료과학기초, 전기화학, 열역학 등 |
| 인공지능 | 9개 | 심층학습개론, 자연어처리, 강화학습 등 |
| 원자력 | 2개 | 원자력에너지공학(EL4012), 핵융합공학(EL5012) |

EF/VC/HASS 등 공통과목은 `null` 유지

**`scripts/seed.js`**
- `track-map.json` 로드 후 과목코드 → 트랙 역방향 맵 빌드
- 레코드 생성 시 `track: TRACK_MAP[code] || null` 적용

---

## 커밋 이력

| 커밋 | 내용 |
|------|------|
| `92194a6` | UI 통일(Settings 포털 가이드), Dashboard.css guide-note 추가, seed.js 버그 수정 3종 |
| `d240cc6` | 추천 로직 최신 학기 고정, 과목 트랙 매핑 추가 |
