# CHANGELOG

## 2026-05-25

### feat: 3단계 회원가입 플로우 (`ff8fe0a`)

회원가입 시 기본 정보 입력 이후 추가 단계를 도입했습니다.

- **Step 1 — 기본 정보**: 이메일 · 이름 · 학번 · 학년 · 비밀번호
- **Step 2 — 기수강 과목 선택**: VC / EF / EL 카테고리별 체크박스, 과목명 검색 지원
- **Step 3 — 선호도 조사**: 관심 트랙 · 공강 요일 · 아침 수업 기피 · 최소 공강 시간

추가된 파일 및 변경 사항:

| 파일 | 내용 |
|------|------|
| `server/routes/users.js` | `POST /api/users/preferences`, `GET /api/users/preferences` 신규 |
| `server/routes/courses.js` | `POST /api/courses/completed` 신규 |
| `client/src/pages/RegisterPage.jsx` | 3단계 스테퍼 UI로 전면 개편 |
| `client/src/pages/RegisterPage.css` | 신규 |
| `client/src/api/index.js` | `coursesAPI.saveCompleted`, `usersAPI` 추가 |

---

### fix: LLM에 개설교과목 컨텍스트 주입 및 intent 추천 엔진 연결 (`e6c8684`)

기존에는 LLM이 어떤 과목이 있는지 모른 채 응답했고, LLM 응답이 추천 엔진에 실제로 반영되지 않았습니다.

**수정 내용:**

- `server/routes/chat.js`
  - DB에서 전체 개설 과목을 조회해 system prompt에 포함
  - 현재 시간표도 포맷해서 LLM에 전달
  - LLM 응답 구조 변경: `remove_codes` · `exclude_days` · `exclude_before` · `include_codes` · `reply` 필드
- `server/utils/recommender.js`
  - `applyIntent()` 함수 신규 추가
    - `remove_codes`: 특정 과목 제거
    - `exclude_days`: 특정 요일 수업 제외
    - `exclude_before`: 특정 시간 이전 수업 제외
    - `include_codes`: 특정 과목 우선 배치
  - `generateRecommendations()`가 intent를 실제로 적용하도록 수정
- `client/src/components/Chat/Chat.jsx`
  - LLM이 직접 생성한 `reply` 문장을 채팅창에 표시

---

### fix: 코드 전체 검토 후 버그 일괄 수정 (`199df36`)

#### 보안
- `server/routes/auth.js` — 로그인 시 `@kentech.ac.kr` 검증 누락 수정
- `server/routes/tracker.js` — 경쟁률 API에 인증 미들웨어 추가

#### 데이터베이스
- `server/routes/schedule.js` — `ON CONFLICT DO NOTHING` → `ON CONFLICT (user_id, course_id, semester) DO NOTHING`
- `server/routes/courses.js` — `ON CONFLICT DO NOTHING` → `ON CONFLICT (user_id, course_id) DO NOTHING`
- `database/schema.sql` — `prerequisites` FK에 `ON DELETE CASCADE` 추가
- `database/schema.sql` — 성능 인덱스 6개 추가 (Supabase에 즉시 적용)
  - `completed_courses(user_id)`
  - `planned_schedules(user_id)`, `planned_schedules(semester)`
  - `courses(semester)`, `courses(category)`
  - `prerequisites(course_id)`

#### LLM 안정성
- `server/routes/chat.js` — LLM JSON 파싱 실패 시 500 대신 명확한 에러 메시지 반환
- `server/routes/chat.js` — `action` 필드 존재 여부 검증 추가

#### 추천 알고리즘
- `server/utils/recommender.js` — Plan A/B/C 다양성 개선
  - 기존: 고정 오프셋 로테이션 → 거의 동일한 플랜 생성
  - 변경: 이전 플랜에서 선택된 과목을 후순위로 밀어 다양한 플랜 생성 (fresh-first)

#### 프론트엔드
- `server/routes/users.js` — `GET /api/users/me` 신규 추가
- `client/src/App.jsx` — 새로고침 시 토큰으로 유저 정보 자동 복원, 토큰 만료 시 자동 로그아웃
- `client/src/api/index.js` — `usersAPI.getMe()` 추가

---

### fix: .env.example 실제 키 제거 (`8b2ccfe`)

`.env.example`에 실수로 포함된 실제 DB 비밀번호 · JWT 시크릿 · API 키를 플레이스홀더로 교체했습니다.
실제 값은 로컬 `.env` 파일에만 보관합니다 (gitignore 처리).
