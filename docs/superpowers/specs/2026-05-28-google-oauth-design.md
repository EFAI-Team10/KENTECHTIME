# Google OAuth 기반 회원가입/로그인 설계

**작성일:** 2026-05-28
**브랜치:** `feat/google-oauth`
**담당:** 구형준

---

## 1. 배경 및 목적

현재 KENTECHTIME의 회원가입/로그인은 이메일과 비밀번호를 사용하며, `@kentech.ac.kr` 도메인 검증은 `email.endsWith('@kentech.ac.kr')` 문자열 비교에만 의존한다. 이는 사용자가 임의로 `someone@kentech.ac.kr` 형태의 가짜 이메일을 입력해도 통과되는 구조이며, KENTECH 재학생 전용 폐쇄형 커뮤니티라는 서비스 정체성을 보장하지 못한다.

본 작업은 Google OAuth (Google Identity Services)를 도입하여 다음을 달성한다:

- Google이 발급하는 ID Token의 `hd` (hosted domain) 클레임으로 실제 `@kentech.ac.kr` Workspace 계정만 가입/로그인 허용
- 비밀번호 관리 책임 제거 (저장·해싱·복구 불필요)
- 사용자 입장에서 단일 클릭 로그인 경험 제공

---

## 2. 범위

### 포함
- 기존 이메일/비밀번호 기반 `/api/auth/register`, `/api/auth/login` 제거
- Google OAuth 단일 인증 경로 도입 (`/api/auth/google`, `/api/auth/google/register`)
- 신규 사용자 온보딩 플로우 재구성 (이름·학번·학기차 → 기수강 → 선호도)
- DB 스키마 변경 (`google_sub`, `semester` 추가, `password_hash` nullable)
- 프론트엔드 단일 진입점 (`AuthPage`) + 온보딩 페이지 리팩토링

### 제외 (별도 작업)
- Google 외 OAuth 제공자(Microsoft, Naver 등)
- 비밀번호 재설정·이메일 인증 메일 (Google이 대체하므로 불필요)
- `users.grade` 컬럼 완전 제거 (호환 유지, 추후 정리)
- 추천 알고리즘의 `semester` 활용 (별도 작업으로 분리)

---

## 3. 인증 플로우

```
[사용자] 클릭: "Google로 시작하기"
   ↓
[프론트엔드] @react-oauth/google 팝업 → 사용자가 @kentech.ac.kr 계정 선택
   ↓
[프론트엔드] Google이 발급한 ID Token 획득
   ↓
[프론트엔드] POST /api/auth/google  { id_token }
   ↓
[백엔드] google-auth-library 로 ID Token 검증
   ├ 서명 + audience(GOOGLE_CLIENT_ID) 검증
   ├ email_verified === true 확인
   └ hd === 'kentech.ac.kr' 확인 (이중 방어: email.endsWith 도 확인)
   ↓
[백엔드] DB에서 google_sub 로 사용자 조회
   ├ 존재 → JWT 발급, 응답: { token, user, is_new_user: false }
   └ 미존재 → 응답: { is_new_user: true, google: { email, name } }
                      (이 시점에는 DB에 INSERT 하지 않음)
   ↓
[프론트엔드] is_new_user 분기
   ├ false → 토큰 저장 → /dashboard
   └ true  → ID Token을 메모리 state에 보관 → /onboarding 으로 이동
              ↓
              Step 1: 이름·학번·학기차 입력
              Step 2: 기수강 과목 선택 (VC/EF/EL 카테고리별)
              Step 3: 선호도 (선호 트랙·공강 요일·아침 수업 기피·최소 공강)
              ↓
              POST /api/auth/google/register
              { id_token, name, student_id, semester, completed_course_ids[], preferences{} }
              ↓
              [백엔드] ID Token 재검증 → 트랜잭션:
                INSERT INTO users (..., google_sub, role='student')
                INSERT INTO completed_courses (...)
                INSERT INTO user_preferences (...)
              → JWT 발급, 응답: { token, user }
              ↓
              [프론트엔드] 토큰 저장 → /dashboard
```

### 설계 포인트
- **신규 사용자는 온보딩 완료 시점에 한 번에 생성한다.** Step 1 직후 user 행만 만들고 Step 2/3에서 추가로 채워 넣는 방식은 "절반만 만들어진 사용자" 상태를 만들고 이메일 UNIQUE 충돌 시 복구가 복잡해진다. ID Token은 1시간 유효하므로 온보딩 중 메모리에 보관하다 마지막에 한 번 더 검증한다.
- **신원 키는 `google_sub`이다.** Google이 발급하는 `sub`는 영구·고유 값이며, 이메일은 이론적으로 변경 가능하다.
- **`hd` 클레임과 `email.endsWith()` 이중 검증.** `hd`는 Workspace 계정에만 존재하지만 변조 가능성을 고려해 이메일 도메인도 추가로 확인한다.

---

## 4. DB 스키마 변경

`database/schema.sql` 및 운영 DB (Supabase) 모두 적용한다.

```sql
ALTER TABLE users
  ADD COLUMN google_sub VARCHAR(255) UNIQUE,
  ADD COLUMN semester   INTEGER,
  ALTER COLUMN password_hash DROP NOT NULL;
```

- **`google_sub`**: Google 발급 영구 사용자 ID. UNIQUE 제약. NULL 허용 (마이그레이션 기간 동안 기존 행과 호환).
- **`semester`**: 학기차 1~8. NULL 허용 (기존 행 호환).
- **`password_hash`**: NOT NULL 제거. Google OAuth 가입자는 항상 NULL.
- **`grade`**: 컬럼 유지 (DROP 하지 않음). 기존 admin 계정·추천 알고리즘이 참조 중. 추후 별도 작업으로 제거.

### 기존 admin 계정 (`magnesium@kentech.ac.kr`) 처리
- 해당 계정이 처음 Google 로그인 시도할 때, 백엔드는 `email`로 매칭되는 행을 찾으면 그 행의 `google_sub`를 채워 넣는다.
- `role`은 그대로 'admin' 유지된다.
- 즉 백엔드 로직: `google_sub`로 조회 → 없으면 `email`로 조회 → 있으면 `google_sub` 업데이트 후 기존 사용자 취급.

---

## 5. 백엔드 변경

### 5.1 새 의존성
- `google-auth-library` (server)
- `bcryptjs` 제거 가능 여부 확인 (auth.js 외 사용처 없으면 제거)

### 5.2 새 파일

**`server/utils/googleVerify.js`**
- `OAuth2Client(GOOGLE_CLIENT_ID)` 인스턴스
- `verifyIdToken(token)`:
  - `client.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID })`
  - payload에서 `email_verified`, `hd`, `email`, `sub`, `name` 추출
  - 검증 실패 시 throw (호출자가 400/401 응답)
  - 성공 시 `{ sub, email, name }` 반환

### 5.3 `server/routes/auth.js` 전면 재작성

| 엔드포인트 | 메서드 | 동작 |
|----------|------|------|
| `/api/auth/register` | - | **삭제** |
| `/api/auth/login` | - | **삭제** |
| `/api/auth/google` | POST | ID Token 검증 → google_sub/email로 사용자 조회 → 기존 사용자면 JWT 발급, 신규면 `{ is_new_user: true }` |
| `/api/auth/google/register` | POST | ID Token 재검증 → 트랜잭션으로 users/completed_courses/user_preferences INSERT → JWT 발급 |

**에러 응답 규약:**
- ID Token 서명/audience 검증 실패 → `401 Unauthorized`
- `email_verified !== true` 또는 `hd !== 'kentech.ac.kr'` → `403 Forbidden` (`{ error: '@kentech.ac.kr 계정만 사용할 수 있습니다.' }`)
- 요청 본문 누락/형식 오류 → `400 Bad Request`

**`/api/auth/google` 응답 예시:**
```json
// 기존 사용자
{ "token": "<jwt>", "user": { "id": 1, "email": "...", "name": "...", "role": "student" }, "is_new_user": false }

// 신규 사용자
{ "is_new_user": true, "google": { "email": "...", "name": "..." } }
```

**`/api/auth/google/register` 요청 예시:**
```json
{
  "id_token": "<google id token>",
  "name": "구형준",
  "student_id": "20230123",
  "semester": 5,
  "completed_course_ids": [12, 34, 56],
  "preferences": {
    "preferred_tracks": ["AI"],
    "avoid_morning": true,
    "preferred_gap": 60,
    "day_off": ["FRI"]
  }
}
```

### 5.4 JWT 페이로드
기존 패턴 유지: `{ userId, role }`. 변경 없음.

### 5.5 기존 미들웨어
`server/middleware/auth.js`, `admin.js` 변경 없음.

---

## 6. 프론트엔드 변경

### 6.1 새 의존성
- `@react-oauth/google` (client)

### 6.2 환경 변수
`client/.env`에 `REACT_APP_GOOGLE_CLIENT_ID` 추가. `.env.example`에 플레이스홀더 추가.

### 6.3 프로바이더 래핑
`client/src/index.js`에서 `<App />`을 `<GoogleOAuthProvider clientId={process.env.REACT_APP_GOOGLE_CLIENT_ID}>`로 감싼다.

### 6.4 페이지 변경

| 페이지 | 변경 |
|-------|------|
| `LoginPage.jsx` | **삭제** (AuthPage로 통합) |
| `RegisterPage.jsx` | `OnboardingPage.jsx`로 이름 변경 + Step 1 수정 |
| `AuthPage.jsx` | **신규**. "Google로 시작하기" 버튼 하나. `<GoogleLogin>` 컴포넌트 사용. |

**`AuthPage` 흐름:**
1. `<GoogleLogin onSuccess={(resp) => ...}>` 사용. `resp.credential`이 ID Token (JWT). (`useGoogleLogin` 훅은 access_token 흐름이라 ID Token이 안 옴 — 사용하지 않음.)
2. `authAPI.googleLogin(idToken)` 호출
3. `is_new_user === false` → `localStorage.setItem('token', ...)` → `navigate('/dashboard')`
4. `is_new_user === true` → 라우터 state로 `{ idToken, googleProfile }` 전달 → `navigate('/onboarding')`

**`OnboardingPage` 흐름:**
- 라우터 state에서 `idToken` 받음 (없으면 `/auth`로 리다이렉트)
- Step 1: 이메일·비밀번호 입력 필드 제거 → 이름·학번·학기차(1~8 select)만
- Step 2/3: 기존 RegisterPage 로직 그대로 유지
- 마지막 Submit: `authAPI.googleRegister({ idToken, ...formData })` 호출 → 토큰 저장 → `/dashboard`

### 6.5 라우팅 (`App.jsx`)
| 경로 | 컴포넌트 |
|-----|---------|
| `/auth` | `AuthPage` |
| `/onboarding` | `OnboardingPage` (미인증이어도 접근 가능) |
| 기타 보호 경로 | 기존대로 토큰 검사 |

기존 `/login`, `/register` 경로는 `/auth`로 리다이렉트.

### 6.6 API 클라이언트 (`client/src/api/index.js`)
- 제거: `authAPI.register`, `authAPI.login`
- 추가:
  - `authAPI.googleLogin(idToken)` → `POST /api/auth/google`
  - `authAPI.googleRegister(payload)` → `POST /api/auth/google/register`

### 6.7 App 부트스트랩
`App.jsx`의 기존 "토큰 있으면 `/api/users/me` 호출해서 유저 복원" 로직은 변경 없음.

---

## 7. 환경 변수 / 사전 준비

### Google Cloud Console (사용자가 직접 수행)
1. Google Cloud Console에서 프로젝트 생성 또는 선택
2. **OAuth consent screen** 설정:
   - User type: Internal (KENTECH Workspace 도메인 한정 시) 또는 External
   - Scopes: `openid`, `email`, `profile`
3. **Credentials → Create Credentials → OAuth client ID**:
   - Application type: Web application
   - Authorized JavaScript origins:
     - `http://localhost:3000` (개발)
     - 배포 도메인 (있다면 추가)
4. 발급된 **Client ID**를 팀 공유

### `.env` (server)
```
GOOGLE_CLIENT_ID=<발급받은 Web Client ID>
```

### `client/.env`
```
REACT_APP_GOOGLE_CLIENT_ID=<같은 값>
```

### `.env.example` (양쪽 모두)
실제 값 대신 플레이스홀더로 두고 git에 커밋한다.

---

## 8. 검증 계획

### 자동 검증
- 백엔드: `/api/auth/google`에 잘못된 ID Token POST → 400/401 응답 확인
- 백엔드: 유효 ID Token이지만 `hd !== 'kentech.ac.kr'` → 403 확인 (개인 Gmail로 발급한 ID Token 사용)

### 수동 검증 (로컬)
1. 본인 `@kentech.ac.kr` 계정으로 Google 로그인 → 신규 사용자로 인식되어 `/onboarding`으로 이동
2. 온보딩 3단계 완료 → JWT 발급 → 대시보드 진입
3. 로그아웃 후 다시 Google 로그인 → 바로 대시보드 (`is_new_user: false`)
4. 개인 Gmail로 시도 → 도메인 거부 에러 표시
5. `magnesium@kentech.ac.kr` (admin)로 첫 Google 로그인 → google_sub 채워지고 role 'admin' 유지 확인

### DB 검증
- `SELECT email, google_sub, role, semester FROM users WHERE email = '<test>';`로 정상 INSERT 확인
- `password_hash IS NULL`인지 확인

---

## 9. 위험 및 대응

| 위험 | 대응 |
|-----|-----|
| Google Cloud Console 설정 오류로 클라이언트 실패 | 사전 준비 체크리스트(섹션 7)를 README에 추가 |
| 기존 admin 계정 google_sub 매칭 실패 | 첫 로그인 시 email fallback 매칭 로직으로 처리 (섹션 4 참조) |
| ID Token 만료 (온보딩 1시간 초과) | 온보딩 마지막 Submit 시 재검증 실패하면 사용자에게 "다시 로그인" 안내 |
| 비밀번호 컬럼 잔존으로 인한 혼란 | `password_hash` nullable로만 변경, 신규 가입은 항상 NULL. 추후 DROP COLUMN 별도 작업. |

---

## 10. 작업 후 정리

- `bcryptjs` 의존성이 다른 곳에서 안 쓰이면 `server/package.json`에서 제거
- README의 회원가입 섹션 갱신
- CHANGELOG에 항목 추가
