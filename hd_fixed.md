# KENTECHTIME 수정 이력

---

## 1. 포털 데이터 추출 알고리즘 개선 (`lib/gradeParser.js`, `client/src/utils/gradeParser.js`)

### 문제
- `overflow:hidden` 컨테이너(eXbuilder6 내부 학기별 그리드)가 `scan()`에서 탐지되지 않아 학기 일부 과목(예: 2023-1학기 하단 3행)이 누락됨
- 추출 완료 후 `navigator.clipboard.writeText()`가 setTimeout 체인으로 인해 user gesture context 만료 → 클립보드 복사 실패
- `scrollIntoView({block:'center'})` 가 outer container의 scrollTop을 재설정하여 학기 건너뜀

### 수정
| 항목 | 변경 |
|------|------|
| `scan()` | `overflow` 스타일 체크 제거 → `scrollHeight > clientHeight + 10 && clientHeight > 0` 만 확인 |
| `finish()` | 파란 버튼(`__kt_btn`) 페이지에 주입, 사용자가 직접 클릭하여 복사 (user gesture 컨텍스트 확보) |
| `scrollFully()` | `{block:'nearest'}` 로 변경 (이미 보이는 경우 outer scroll 불변) |
| `scrollFully()` | `stableAtBottom >= 2` 조건 추가 (바닥 2회 연속 확인 후 완료) |
| 타이밍 | 80ms / 100ms / 150ms 로 단축 (기존 300ms → 전체 추출 ~3초) |

---

## 2. UI 가이드 업데이트 (6개 파일)

### 변경 파일
- `app/onboarding/page.jsx`
- `components/Settings/SettingsModal.jsx`
- `components/Dashboard/Dashboard.jsx`
- `client/src/pages/OnboardingPage.jsx`
- `client/src/components/Settings/SettingsModal.jsx`
- `client/src/components/Dashboard/Dashboard.jsx`

### 변경 내용
- 북마클릿 방식 → F12 콘솔 커맨드 방식으로 전환
- 가이드 단계: 3단계 → 4단계 (파란 버튼 클릭 단계 추가)
- `{BOOKMARKLET}` 코드 노출 → "여기를 클릭해서 복사" (클릭 시 `CONSOLE_COMMAND` 복사)
- `CONSOLE_COMMAND` import 추가, 구버전 `BOOKMARKLET` 상수 제거

---

## 3. 텍스트창 붙여넣기 안 되는 버그 (4개 파일)

### 문제
React 18 concurrent mode에서 controlled textarea(`value={state}`)가 paste 이벤트 처리 중 state 업데이트 커밋 전 DOM 값을 이전 state로 리셋하는 케이스 발생.

### 수정 파일
- `components/Dashboard/Dashboard.jsx`
- `client/src/components/Dashboard/Dashboard.jsx`
- `components/Settings/SettingsModal.jsx`
- `client/src/components/Settings/SettingsModal.jsx`

### 변경 내용
```jsx
// Before
<textarea value={pasteText} onChange={e => setPasteText(e.target.value)} />

// After
<textarea onChange={e => setPasteText(e.target.value)} />
```
`value` prop 제거 → uncontrolled textarea. `onChange`는 유지하여 분析 버튼 활성화 및 파싱에 사용.

---

## 4. RC_Student_Led 0.5학점 → 0학점 버그

### 원인
`scripts/seed.js`에서 `parseInt("0.5", 10) = 0` 으로 DB에 저장됨.  
import 시 DB 값 우선 → 0학점 그대로 사용.

### 수정

**`scripts/seed.js`**
```js
// Before
credits: parseInt(row[col.credits], 10) || 0,

// After
credits: parseFloat(row[col.credits]) || 0,
```

**`app/api/courses/import-by-codes/route.js`**  
DB에 `credits = 0`이지만 포털 파싱값 `> 0`이면 DB를 자동 보정:
```js
if (course.credits === 0 && parsedCredits > 0) {
  // supabase update credits
}
```
→ re-seed 전이라도 다음 import 시 자동 수정됨.

---

## 5. MN 과목 초과 이수처리 버그

### 원인
1. **이전 import 잔존**: `upsert` 방식으로 기존 portal import 과목이 삭제되지 않고 누적됨
2. **"分析" 시 즉시 DB 등록**: 사용자 확인 전에 import가 실행되어 취소 불가
3. **한글 코드 탐지**: CONSOLE_COMMAND fallback 경로에서 "MN합계" 같은 소계 행이 코드로 처리될 수 있음
4. **미이수 과목 포함**: 포털이 미이수 과목을 표시하는 경우 성적란이 빈 행도 수집됨

### 수정

**`lib/gradeParser.js` + `client/src/utils/gradeParser.js` — parseGradeData**
```js
// 한글 코드 필터 추가
if (...|| /[가-힣]/.test(code)) continue;

// 성적 열이 있는데 비어있으면 미이수 → 건너뜀
const grade = cols[4] !== undefined ? cols[4] : null;
if (grade !== null && grade === '') continue;
```

**CONSOLE_COMMAND (두 파일 동일)**
```js
// fallback 코드 탐지에 한글 필터 추가
if (fb && ... && !/[가-힣]/.test(fb)) ci = 1;

// code 최종 검증에 한글 필터 추가
if (!code || SKIP.test(code) || /^\d+$/.test(code) || /[가-힣]/.test(code)) return;

// 성적 열(ci+3) output에 추가 (5컬럼으로 확장)
out.push([cat, code, name, texts[ci+2]||'', texts[ci+3]||''].join('\t'));
```

**`app/api/courses/import-by-codes/route.js` — replace 모드**
```js
// replace=true: 기존 portal import 전부 삭제 후 교체
if (replace) {
  await supabase.from('completed_courses')
    .delete()
    .eq('user_id', auth.userId)
    .eq('semester', 'imported');
}
```
수동 추가 과목(`semester != 'imported'`)은 유지됨.

**`lib/api-client.js`**
```js
importByCodes: (courses, opts = {}) => api.post('/courses/import-by-codes', { courses, ...opts }),
```

**`components/Dashboard/Dashboard.jsx`**
```js
// handleParse: API 호출 없이 미리보기만 (즉각적, 부작용 없음)
const handleParse = () => {
  const { toImport, external } = parseGradeData(pasteText);
  setPreview({ toImport, external });
};

// handleConfirm: replace=true로 기존 이력 교체
await coursesAPI.importByCodes(preview.toImport, { replace: true });
```

**`components/Settings/SettingsModal.jsx`**
```js
await coursesAPI.importByCodes(portalPreview.toImport, { replace: true });
```

---

## 6. 수강이력 전체 삭제 기능 추가

### 파일
- `components/Settings/SettingsModal.jsx`
- `components/Settings/SettingsModal.css`

### 기능
설정 모달 → 기수강 과목 관리 → choose 모드 하단에 위치.

**UX 흐름**
1. "수강이력 전체 삭제" 버튼 (빨간 테두리) 표시
2. 클릭 → 인라인 확인 박스: "모두 삭제하시겠습니까? 수동으로 추가한 과목 포함 전체 삭제됩니다."
3. "전체 삭제" 확인 → `coursesAPI.saveCompleted([])` 호출
4. 완료 메시지 표시 → "확인" 클릭 시 모달 닫힘

**구현**
```js
// saveCompleted([]) = POST /courses/completed with courses:[]
// → 기존 전체 삭제 후 빈 배열 insert = 전체 삭제
const handleClearAll = async () => {
  await coursesAPI.saveCompleted([]);
  setClearDone(true);
};
```

---

## 수정 파일 전체 목록

| 파일 | 수정 내용 |
|------|-----------|
| `lib/gradeParser.js` | 추출 알고리즘, UI 가이드, 한글 필터, 성적 열, credits parseFloat |
| `client/src/utils/gradeParser.js` | 동일 |
| `app/onboarding/page.jsx` | 가이드 4단계 |
| `client/src/pages/OnboardingPage.jsx` | 가이드 4단계 |
| `components/Dashboard/Dashboard.jsx` | 가이드, handleParse/Confirm, textarea uncontrolled |
| `client/src/components/Dashboard/Dashboard.jsx` | 동일 |
| `components/Settings/SettingsModal.jsx` | 가이드, replace, 전체 삭제 기능, textarea uncontrolled |
| `client/src/components/Settings/SettingsModal.jsx` | 가이드, textarea uncontrolled |
| `components/Settings/SettingsModal.css` | 전체 삭제 UI 스타일 |
| `app/api/courses/import-by-codes/route.js` | replace 모드, credits 자동 보정 |
| `lib/api-client.js` | importByCodes opts 파라미터 |
| `scripts/seed.js` | parseInt → parseFloat |
