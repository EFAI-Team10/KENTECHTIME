# KENTECHTIME Next.js 마이그레이션 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 CRA(client) + Express(server) 2-폴더 구조를 Next.js 14 App Router 단일 프로젝트로 마이그레이션하여 Vercel 단일 배포 가능하게 만든다. 기능/UI/인증 흐름은 100% 동일하게 유지한다.

**Architecture:**
- Next.js 14 App Router, JavaScript (TS 변환 안 함).
- Server 라우트는 `app/api/**/route.js` Route Handler로 1:1 이식. 비즈니스 로직은 `lib/server/*` (service/utils)로 분리.
- pg raw SQL → `@supabase/supabase-js` SDK. 트랜잭션이 필요한 2 케이스(`auth/register`, `users/delete`)는 **Postgres RPC 함수**로 변환.
- 클라이언트 컴포넌트/페이지/CSS는 그대로 복사 후 `"use client"` 디렉티브 추가 + react-router → next/navigation 치환.
- 환경변수: `.env.local` 단일 파일 (`NEXT_PUBLIC_*` 접두사로 클라이언트 노출 분리).
- Cron 메모리 캐시 → 단순화하여 `/api/tracker`에서 매 요청마다 집계 (Vercel serverless 호환).

**Tech Stack:** Next.js 14 (App Router), React 18, @supabase/supabase-js v2, google-auth-library, jsonwebtoken, openai, zustand, recharts, @react-oauth/google.

---

## File Structure (목표)

```
KENTECHTIME/
├── app/
│   ├── layout.jsx                       # Root layout + GoogleOAuthProvider
│   ├── page.jsx                         # MainPage (대시보드)  (보호 라우트)
│   ├── auth/page.jsx                    # AuthPage (Google 로그인)
│   ├── onboarding/page.jsx              # OnboardingPage (3-step)
│   ├── globals.css                      # 기존 client/src/index.css
│   ├── providers.jsx                    # GoogleOAuthProvider + AuthBootstrap client wrapper
│   └── api/
│       ├── auth/google/route.js
│       ├── auth/google/register/route.js
│       ├── courses/route.js             # GET (list)
│       ├── courses/requirements/route.js
│       ├── courses/completed/route.js   # POST
│       ├── schedule/recommend/route.js
│       ├── schedule/my/route.js
│       ├── schedule/save/route.js
│       ├── chat/route.js
│       ├── tracker/route.js
│       └── users/
│           ├── me/route.js              # GET, DELETE
│           └── preferences/route.js     # GET, POST
├── components/
│   ├── Chat/                            # 그대로 복사 + "use client"
│   ├── Dashboard/
│   ├── Timetable/
│   └── Tracker/
├── lib/
│   ├── store.js                         # Zustand store (use client)
│   ├── api-client.js                    # axios baseURL → /api
│   └── server/
│       ├── supabase.js                  # Supabase 서버 클라이언트 (service role)
│       ├── auth.js                      # JWT verify helper (requireAuth(request))
│       ├── googleVerify.js              # 1:1 복사 (ESM)
│       └── recommender.js               # pg → supabase 재작성
├── database/
│   ├── schema.sql                       # 기존 그대로
│   └── migrations/
│       ├── 001_rpc_register_user.sql
│       └── 002_rpc_delete_user.sql
├── .env.local                           # 로컬 (gitignore)
├── .env.example                         # 통합 예시
├── next.config.js
├── jsconfig.json
├── package.json                         # 루트 단일
├── vercel.json                          # (선택)
└── legacy/                              # 기존 client/, server/ 이동 (참조용)
    ├── client/
    └── server/
```

**파일 분리 원칙:**
- Route handler는 얇게 — 입력 검증 + service 호출 + 응답 포맷만.
- 비즈니스 로직 `lib/server/*.js`. DB 접근은 `lib/server` 내부에서만.
- 클라이언트 상태/페이지 컴포넌트는 모두 `"use client"`.

---

## Phase 0 — 브랜치 및 백업

### Task 0: 새 브랜치 + 기존 코드 백업

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: 새 브랜치 생성**

```bash
git checkout -b feat/nextjs-migration
```

- [ ] **Step 2: 기존 client/, server/를 legacy/로 이동**

```bash
mkdir legacy
git mv client legacy/client
git mv server legacy/server
git mv package.json legacy/root-package.json
```

- [ ] **Step 3: 커밋**

```bash
git add -A
git commit -m "chore: archive legacy client/server into legacy/ before Next.js migration"
```

---

## Phase 1 — Next.js 프로젝트 스캐폴딩

### Task 1: package.json + Next.js 설정

**Files:**
- Create: `package.json`
- Create: `next.config.js`
- Create: `jsconfig.json`
- Modify: `.gitignore`
- Create: `app/layout.jsx` (임시)
- Create: `app/page.jsx` (임시)

- [ ] **Step 1: 루트 package.json 작성**

```json
{
  "name": "kentechtime",
  "version": "2.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "^14.2.5",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "@react-oauth/google": "^0.13.5",
    "@supabase/supabase-js": "^2.45.0",
    "google-auth-library": "^10.6.2",
    "jsonwebtoken": "^9.0.2",
    "openai": "^4.52.0",
    "axios": "^1.7.2",
    "zustand": "^4.5.4",
    "recharts": "^2.12.7"
  },
  "devDependencies": {
    "eslint": "^8.57.0",
    "eslint-config-next": "^14.2.5"
  }
}
```

- [ ] **Step 2: next.config.js**

```js
/** @type {import('next').NextConfig} */
const nextConfig = { reactStrictMode: true };
module.exports = nextConfig;
```

- [ ] **Step 3: jsconfig.json (절대경로 alias)**

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./*"] }
  }
}
```

- [ ] **Step 4: .gitignore 갱신**

```gitignore
node_modules
.next
.env.local
.env*.local
.vercel
*.log
.DS_Store
```

- [ ] **Step 5: 임시 layout + page**

`app/layout.jsx`:
```jsx
export const metadata = { title: 'KENTECHTIME' };
export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
```

`app/page.jsx`:
```jsx
export default function Page() { return <main>Next.js 마이그레이션 진행 중</main>; }
```

- [ ] **Step 6: 설치 & 부팅 확인**

```bash
npm install
npm run dev
```
Expected: `http://localhost:3000`에서 "Next.js 마이그레이션 진행 중" 표시.

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "chore: scaffold Next.js 14 app router project"
```

---

## Phase 2 — 환경변수 통합

### Task 2: .env.local + .env.example 통합

**Files:**
- Create: `.env.example`
- Create: `.env.local`

- [ ] **Step 1: 통합 .env.example 작성**

```dotenv
# === Server-side (Route Handlers only) ===
SUPABASE_URL=https://xxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...                      # NEVER expose to client
JWT_SECRET=openssl_rand_hex_32_output
OPENAI_API_KEY=sk-...
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
CURRENT_SEMESTER=2026-spring

# === Client-side (브라우저 노출 OK) ===
NEXT_PUBLIC_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
```

- [ ] **Step 2: .env.local에 실제 값 복사**

기존 `legacy/.env`, `legacy/client/.env`에서 옮기되:
- `REACT_APP_GOOGLE_CLIENT_ID` → `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
- `REACT_APP_API_URL`은 삭제 (same-origin `/api` 사용)
- `DATABASE_URL`은 더 이상 필요 없음 (supabase-js로 대체)

- [ ] **Step 3: 커밋**

```bash
git add .env.example
git commit -m "chore: unify env vars into single .env.local"
```

---

## Phase 3 — Supabase 서버 클라이언트 + RPC 함수

### Task 3: Supabase 서버 클라이언트

**Files:**
- Create: `lib/server/supabase.js`

- [ ] **Step 1: 작성**

```js
import { createClient } from '@supabase/supabase-js';

let _admin = null;
export function getSupabaseAdmin() {
  if (_admin) return _admin;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다.');
  _admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}
```

- [ ] **Step 2: 커밋**

```bash
git add lib/server/supabase.js
git commit -m "feat(server): add supabase admin client"
```

### Task 4: 트랜잭션용 RPC 함수 작성

**Files:**
- Create: `database/migrations/001_rpc_register_user.sql`
- Create: `database/migrations/002_rpc_delete_user.sql`

- [ ] **Step 1: 신규 가입 원자적 처리 RPC**

`database/migrations/001_rpc_register_user.sql`:
```sql
CREATE OR REPLACE FUNCTION fn_register_user(
  p_email             TEXT,
  p_name              TEXT,
  p_student_id        TEXT,
  p_semester          INTEGER,
  p_google_sub        TEXT,
  p_completed_course_ids INTEGER[],
  p_preferred_tracks  TEXT[],
  p_avoid_morning     BOOLEAN,
  p_preferred_gap     INTEGER,
  p_day_off           TEXT[]
)
RETURNS TABLE (id INTEGER, email TEXT, name TEXT, role TEXT, semester INTEGER, student_id TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  v_user_id INTEGER;
  v_grade   INTEGER;
  v_cid     INTEGER;
BEGIN
  v_grade := CEIL(p_semester::NUMERIC / 2);

  INSERT INTO users (email, name, student_id, grade, semester, google_sub, role)
  VALUES (p_email, p_name, p_student_id, v_grade, p_semester, p_google_sub, 'student')
  RETURNING users.id INTO v_user_id;

  IF p_completed_course_ids IS NOT NULL THEN
    FOREACH v_cid IN ARRAY p_completed_course_ids LOOP
      INSERT INTO completed_courses (user_id, course_id)
      VALUES (v_user_id, v_cid)
      ON CONFLICT (user_id, course_id) DO NOTHING;
    END LOOP;
  END IF;

  INSERT INTO user_preferences (user_id, preferred_tracks, avoid_morning, preferred_gap, day_off)
  VALUES (v_user_id, p_preferred_tracks, p_avoid_morning, p_preferred_gap, p_day_off)
  ON CONFLICT (user_id) DO UPDATE SET
    preferred_tracks = EXCLUDED.preferred_tracks,
    avoid_morning    = EXCLUDED.avoid_morning,
    preferred_gap    = EXCLUDED.preferred_gap,
    day_off          = EXCLUDED.day_off;

  RETURN QUERY
    SELECT u.id, u.email, u.name, u.role, u.semester, u.student_id
    FROM users u WHERE u.id = v_user_id;
END $$;
```

- [ ] **Step 2: 회원 탈퇴 원자적 처리 RPC**

`database/migrations/002_rpc_delete_user.sql`:
```sql
CREATE OR REPLACE FUNCTION fn_delete_user(p_user_id INTEGER, p_google_sub TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql AS $$
DECLARE
  v_sub TEXT;
BEGIN
  SELECT google_sub INTO v_sub FROM users WHERE id = p_user_id;
  IF v_sub IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;
  IF v_sub <> p_google_sub THEN
    RAISE EXCEPTION 'GOOGLE_SUB_MISMATCH';
  END IF;

  DELETE FROM reviews            WHERE user_id = p_user_id;
  DELETE FROM planned_schedules  WHERE user_id = p_user_id;
  DELETE FROM completed_courses  WHERE user_id = p_user_id;
  DELETE FROM user_preferences   WHERE user_id = p_user_id;
  DELETE FROM users              WHERE id = p_user_id;
  RETURN TRUE;
END $$;
```

- [ ] **Step 3: Supabase SQL Editor에서 실행 (수동)**

사용자가 Supabase 대시보드 → SQL Editor에 위 두 파일을 붙여넣고 RUN. `select proname from pg_proc where proname like 'fn_%';`로 등록 확인.

- [ ] **Step 4: 커밋**

```bash
git add database/migrations/
git commit -m "feat(db): add RPC functions for atomic register/delete"
```

---

## Phase 4 — 서버 유틸 (Google verify, JWT auth)

### Task 5: googleVerify 이식

**Files:**
- Create: `lib/server/googleVerify.js`

- [ ] **Step 1: 작성 (ESM)**

```js
import { OAuth2Client } from 'google-auth-library';

const ALLOWED_DOMAIN = 'kentech.ac.kr';

export class GoogleAuthError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'GoogleAuthError';
    this.status = status;
  }
}

let client = null;
function getClient() {
  if (!client) {
    if (!process.env.GOOGLE_CLIENT_ID) throw new Error('GOOGLE_CLIENT_ID is not set');
    client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }
  return client;
}

export async function verifyIdToken(idToken) {
  let ticket;
  try {
    ticket = await getClient().verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
  } catch {
    throw new GoogleAuthError('Invalid Google ID Token', 401);
  }
  const payload = ticket.getPayload();
  if (!payload || payload.email_verified !== true) {
    throw new GoogleAuthError('이메일이 확인되지 않은 Google 계정입니다.', 403);
  }
  if (payload.hd !== ALLOWED_DOMAIN) {
    throw new GoogleAuthError('@kentech.ac.kr 계정만 사용할 수 있습니다.', 403);
  }
  if (typeof payload.email !== 'string' || !payload.email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`)) {
    throw new GoogleAuthError('@kentech.ac.kr 계정만 사용할 수 있습니다.', 403);
  }
  return { sub: payload.sub, email: payload.email, name: payload.name || '' };
}
```

- [ ] **Step 2: 커밋**

```bash
git add lib/server/googleVerify.js
git commit -m "feat(server): port googleVerify util to ESM"
```

### Task 6: JWT 인증 helper

**Files:**
- Create: `lib/server/auth.js`

- [ ] **Step 1: 작성**

```js
import jwt from 'jsonwebtoken';

export class AuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

export function signJwt(user) {
  return jwt.sign(
    { userId: user.id, role: user.role || 'student' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

/** Route Handler에서 사용: const { userId, role } = requireAuth(request); */
export function requireAuth(request) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new AuthError('인증이 필요합니다.');
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return { userId: decoded.userId, role: decoded.role || 'student' };
  } catch {
    throw new AuthError('유효하지 않은 토큰입니다.');
  }
}

export function errorJson(err) {
  if (err && typeof err.status === 'number') {
    return Response.json({ error: err.message }, { status: err.status });
  }
  console.error(err);
  return Response.json({ error: '서버 오류' }, { status: 500 });
}
```

- [ ] **Step 2: 커밋**

```bash
git add lib/server/auth.js
git commit -m "feat(server): add JWT auth helper for route handlers"
```

---

## Phase 5 — API Route Handlers (Express 라우트 1:1 이식)

### Task 7: POST /api/auth/google

**Files:**
- Create: `app/api/auth/google/route.js`

- [ ] **Step 1: 구현**

```js
import { getSupabaseAdmin } from '@/lib/server/supabase';
import { verifyIdToken, GoogleAuthError } from '@/lib/server/googleVerify';
import { signJwt, errorJson } from '@/lib/server/auth';

function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name, role: u.role || 'student', semester: u.semester, student_id: u.student_id };
}

export async function POST(request) {
  try {
    const { id_token } = await request.json();
    if (!id_token) return Response.json({ error: 'id_token이 필요합니다.' }, { status: 400 });

    let payload;
    try { payload = await verifyIdToken(id_token); }
    catch (e) {
      if (e instanceof GoogleAuthError) return Response.json({ error: e.message }, { status: e.status });
      throw e;
    }

    const sb = getSupabaseAdmin();

    // google_sub 매칭 우선, 없으면 email로 폴백 (기존 admin 계정 처리)
    let { data: user } = await sb.from('users').select('*').eq('google_sub', payload.sub).maybeSingle();
    if (!user) {
      const { data: byEmail } = await sb.from('users').select('*').eq('email', payload.email).maybeSingle();
      if (byEmail) {
        await sb.from('users').update({ google_sub: payload.sub }).eq('id', byEmail.id);
        byEmail.google_sub = payload.sub;
        user = byEmail;
      }
    }

    if (!user) {
      return Response.json({
        is_new_user: true,
        google: { email: payload.email, name: payload.name },
      });
    }

    const token = signJwt(user);
    return Response.json({ token, user: publicUser(user), is_new_user: false });
  } catch (err) {
    return errorJson(err);
  }
}
```

- [ ] **Step 2: 수동 smoke test**

```bash
curl -X POST http://localhost:3000/api/auth/google -H "Content-Type: application/json" -d '{"id_token":"invalid"}'
```
Expected: `{"error":"Invalid Google ID Token"}` (401)

- [ ] **Step 3: 커밋**

```bash
git add app/api/auth/google/route.js
git commit -m "feat(api): POST /api/auth/google route handler"
```

### Task 8: POST /api/auth/google/register

**Files:**
- Create: `app/api/auth/google/register/route.js`

- [ ] **Step 1: 구현 (RPC 사용)**

```js
import { getSupabaseAdmin } from '@/lib/server/supabase';
import { verifyIdToken, GoogleAuthError } from '@/lib/server/googleVerify';
import { signJwt, errorJson } from '@/lib/server/auth';

function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name, role: u.role || 'student', semester: u.semester, student_id: u.student_id };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { id_token, name, student_id, semester, completed_course_ids, preferences } = body;

    if (!id_token) return Response.json({ error: 'id_token이 필요합니다.' }, { status: 400 });
    if (!name || typeof name !== 'string') return Response.json({ error: '이름을 입력해주세요.' }, { status: 400 });
    if (!student_id || typeof student_id !== 'string') return Response.json({ error: '학번을 입력해주세요.' }, { status: 400 });
    if (!Number.isInteger(semester) || semester < 1 || semester > 8) {
      return Response.json({ error: '학기차는 1~8 사이의 정수여야 합니다.' }, { status: 400 });
    }

    let payload;
    try { payload = await verifyIdToken(id_token); }
    catch (e) {
      if (e instanceof GoogleAuthError) return Response.json({ error: e.message }, { status: e.status });
      throw e;
    }

    const sb = getSupabaseAdmin();
    const { data: existing } = await sb
      .from('users').select('id')
      .or(`google_sub.eq.${payload.sub},email.eq.${payload.email}`)
      .maybeSingle();
    if (existing) return Response.json({ error: '이미 가입된 계정입니다. 로그인해주세요.' }, { status: 409 });

    const courseIds = Array.isArray(completed_course_ids) ? completed_course_ids.filter(Number.isInteger) : [];
    const prefs = preferences || {};

    const { data: rows, error } = await sb.rpc('fn_register_user', {
      p_email: payload.email,
      p_name: name,
      p_student_id: student_id,
      p_semester: semester,
      p_google_sub: payload.sub,
      p_completed_course_ids: courseIds,
      p_preferred_tracks: Array.isArray(prefs.preferred_tracks) ? prefs.preferred_tracks : [],
      p_avoid_morning: !!prefs.avoid_morning,
      p_preferred_gap: Number.isInteger(prefs.preferred_gap) ? prefs.preferred_gap : 60,
      p_day_off: Array.isArray(prefs.day_off) ? prefs.day_off : [],
    });
    if (error) {
      if (error.code === '23505') return Response.json({ error: '이미 가입된 이메일입니다.' }, { status: 409 });
      throw error;
    }

    const user = Array.isArray(rows) ? rows[0] : rows;
    const token = signJwt(user);
    return Response.json({ token, user: publicUser(user) }, { status: 201 });
  } catch (err) {
    return errorJson(err);
  }
}
```

- [ ] **Step 2: 커밋**

```bash
git add app/api/auth/google/register/route.js
git commit -m "feat(api): POST /api/auth/google/register via RPC"
```

### Task 9: GET /api/courses

**Files:**
- Create: `app/api/courses/route.js`

- [ ] **Step 1: 구현**

```js
import { getSupabaseAdmin } from '@/lib/server/supabase';
import { errorJson } from '@/lib/server/auth';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const semester = searchParams.get('semester');
    const track    = searchParams.get('track');
    const category = searchParams.get('category');

    const sb = getSupabaseAdmin();
    let q = sb.from('courses').select('*');
    if (semester) q = q.or(`semester.eq.${semester},semester.eq.both`);
    if (track)    q = q.eq('track', track);
    if (category) q = q.eq('category', category);

    const { data, error } = await q;
    if (error) throw error;
    return Response.json({ courses: data });
  } catch (err) { return errorJson(err); }
}
```

- [ ] **Step 2: 커밋**

```bash
git add app/api/courses/route.js
git commit -m "feat(api): GET /api/courses"
```

### Task 10: GET /api/courses/requirements

**Files:**
- Create: `app/api/courses/requirements/route.js`

- [ ] **Step 1: 구현**

```js
import { getSupabaseAdmin } from '@/lib/server/supabase';
import { requireAuth, errorJson } from '@/lib/server/auth';

export async function GET(request) {
  try {
    const { userId } = requireAuth(request);
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('completed_courses')
      .select('courses(category, credits)')
      .eq('user_id', userId);
    if (error) throw error;

    const earned = { VC: 0, EF: 0, EL: 0, total: 0 };
    for (const row of data || []) {
      const c = row.courses;
      if (!c) continue;
      if (earned[c.category] !== undefined) earned[c.category] += c.credits;
      earned.total += c.credits;
    }
    return Response.json({ earned, required: { VC: 8, EF: 28, EL: 40, total: 128 } });
  } catch (err) { return errorJson(err); }
}
```

- [ ] **Step 2: 커밋**

```bash
git add app/api/courses/requirements/route.js
git commit -m "feat(api): GET /api/courses/requirements"
```

### Task 11: POST /api/courses/completed

**Files:**
- Create: `app/api/courses/completed/route.js`

- [ ] **Step 1: 구현**

```js
import { getSupabaseAdmin } from '@/lib/server/supabase';
import { requireAuth, errorJson } from '@/lib/server/auth';

export async function POST(request) {
  try {
    const { userId } = requireAuth(request);
    const { courses } = await request.json();
    const sb = getSupabaseAdmin();

    const { error: delErr } = await sb.from('completed_courses').delete().eq('user_id', userId);
    if (delErr) throw delErr;

    if (Array.isArray(courses) && courses.length) {
      const rows = courses.map(c => ({
        user_id: userId,
        course_id: c.course_id,
        semester: c.semester || '2025-fall',
        grade: c.grade || 'P',
      }));
      const { error: insErr } = await sb.from('completed_courses')
        .upsert(rows, { onConflict: 'user_id,course_id', ignoreDuplicates: true });
      if (insErr) throw insErr;
    }
    return Response.json({ success: true });
  } catch (err) { return errorJson(err); }
}
```

- [ ] **Step 2: 커밋**

```bash
git add app/api/courses/completed/route.js
git commit -m "feat(api): POST /api/courses/completed"
```

### Task 12: recommender 이식 (pg → supabase)

**Files:**
- Create: `lib/server/recommender.js`

- [ ] **Step 1: legacy/server/utils/recommender.js를 supabase 기반으로 재작성**

```js
import { getSupabaseAdmin } from './supabase';

async function getRequiredCourses(userId, semester) {
  const sb = getSupabaseAdmin();
  const { data: completed } = await sb.from('completed_courses').select('course_id').eq('user_id', userId);
  const completedIds = (completed || []).map(r => r.course_id);

  let q = sb.from('courses').select('*')
    .in('category', ['VC', 'EF', 'EL'])
    .order('target_grade', { ascending: true })
    .or(`semester.eq.${semester},semester.eq.both`);
  if (completedIds.length) q = q.not('id', 'in', `(${completedIds.join(',')})`);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function checkPrerequisites(userId, courseList) {
  const sb = getSupabaseAdmin();
  const { data: completed } = await sb.from('completed_courses').select('course_id').eq('user_id', userId);
  const completedIds = new Set((completed || []).map(r => r.course_id));

  const ids = courseList.map(c => c.id);
  if (!ids.length) return [];
  const { data: prereqs } = await sb.from('prerequisites').select('course_id, required_id').in('course_id', ids);
  const byCourse = new Map();
  for (const p of prereqs || []) {
    if (!byCourse.has(p.course_id)) byCourse.set(p.course_id, []);
    byCourse.get(p.course_id).push(p.required_id);
  }
  return courseList.filter(c => (byCourse.get(c.id) || []).every(id => completedIds.has(id)));
}

function hasTimeConflict(a, b) {
  for (const sa of a.timeslots || []) {
    for (const sb of b.timeslots || []) {
      if (sa.day === sb.day && sa.start < sb.end && sb.start < sa.end) return true;
    }
  }
  return false;
}

function applyHardConstraints(courses, prefs = {}) {
  return courses.filter(c => {
    if (prefs.avoid_morning && (c.timeslots || []).some(s => s.start < '09:30')) return false;
    if (prefs.day_off?.length && (c.timeslots || []).some(s => prefs.day_off.includes(s.day))) return false;
    return true;
  });
}

function applyIntent(courses, intent) {
  if (!intent) return courses;
  let r = [...courses];
  if (intent.remove_codes?.length)  r = r.filter(c => !intent.remove_codes.includes(c.code));
  if (intent.exclude_days?.length)  r = r.filter(c => !(c.timeslots || []).some(s => intent.exclude_days.includes(s.day)));
  if (intent.exclude_before)        r = r.filter(c => !(c.timeslots || []).some(s => s.start < intent.exclude_before));
  if (intent.include_codes?.length) {
    const pri  = r.filter(c => intent.include_codes.includes(c.code));
    const rest = r.filter(c => !intent.include_codes.includes(c.code));
    r = [...pri, ...rest];
  }
  return r;
}

function buildPlan(candidates, maxCredits = 21) {
  const plan = []; let total = 0;
  for (const c of candidates) {
    if (total + c.credits > maxCredits) continue;
    if (plan.some(p => hasTimeConflict(p, c))) continue;
    plan.push(c); total += c.credits;
  }
  return plan;
}

export async function generateRecommendations(userId, semester, preferences = {}, n = 3, intent = null) {
  const required = await getRequiredCourses(userId, semester);
  const eligible = await checkPrerequisites(userId, required);
  let filtered = applyHardConstraints(eligible, preferences);
  filtered = applyIntent(filtered, intent);

  const plans = [];
  for (let i = 0; i < n; i++) {
    const used = new Set(plans.flatMap(p => p.map(c => c.code)));
    const fresh  = filtered.filter(c => !used.has(c.code));
    const reused = filtered.filter(c =>  used.has(c.code));
    plans.push(buildPlan([...fresh, ...reused]));
  }
  return plans;
}
```

- [ ] **Step 2: 커밋**

```bash
git add lib/server/recommender.js
git commit -m "feat(server): port recommender to supabase-js"
```

### Task 13: schedule 라우트 3개

**Files:**
- Create: `app/api/schedule/recommend/route.js`
- Create: `app/api/schedule/my/route.js`
- Create: `app/api/schedule/save/route.js`

- [ ] **Step 1: recommend**

```js
import { requireAuth, errorJson } from '@/lib/server/auth';
import { generateRecommendations } from '@/lib/server/recommender';

export async function POST(request) {
  try {
    const { userId } = requireAuth(request);
    const { semester, preferences } = await request.json();
    const plans = await generateRecommendations(userId, semester, preferences);
    return Response.json({ plans });
  } catch (err) { return errorJson(err); }
}
```

- [ ] **Step 2: my**

```js
import { getSupabaseAdmin } from '@/lib/server/supabase';
import { requireAuth, errorJson } from '@/lib/server/auth';

export async function GET(request) {
  try {
    const { userId } = requireAuth(request);
    const semester = new URL(request.url).searchParams.get('semester');
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('planned_schedules')
      .select('user_id, course_id, semester, courses(name, credits, timeslots, track, category)')
      .eq('user_id', userId).eq('semester', semester);
    if (error) throw error;
    const schedule = (data || []).map(r => ({ ...r, ...(r.courses || {}) }));
    return Response.json({ schedule });
  } catch (err) { return errorJson(err); }
}
```

- [ ] **Step 3: save**

```js
import { getSupabaseAdmin } from '@/lib/server/supabase';
import { requireAuth, errorJson } from '@/lib/server/auth';

export async function POST(request) {
  try {
    const { userId } = requireAuth(request);
    const { courseIds, semester } = await request.json();
    const sb = getSupabaseAdmin();
    const { error: delErr } = await sb.from('planned_schedules').delete().eq('user_id', userId).eq('semester', semester);
    if (delErr) throw delErr;
    if (Array.isArray(courseIds) && courseIds.length) {
      const rows = courseIds.map(id => ({ user_id: userId, course_id: id, semester }));
      const { error: insErr } = await sb.from('planned_schedules')
        .upsert(rows, { onConflict: 'user_id,course_id,semester', ignoreDuplicates: true });
      if (insErr) throw insErr;
    }
    return Response.json({ success: true });
  } catch (err) { return errorJson(err); }
}
```

- [ ] **Step 4: 커밋**

```bash
git add app/api/schedule/
git commit -m "feat(api): schedule routes (recommend/my/save)"
```

### Task 14: POST /api/chat

**Files:**
- Create: `app/api/chat/route.js`

- [ ] **Step 1: 구현 — legacy/server/routes/chat.js 로직 그대로**

```js
import OpenAI from 'openai';
import { getSupabaseAdmin } from '@/lib/server/supabase';
import { requireAuth, errorJson } from '@/lib/server/auth';
import { generateRecommendations } from '@/lib/server/recommender';

export async function POST(request) {
  try {
    const { userId } = requireAuth(request);
    const { message, currentSchedule, semester } = await request.json();
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const sb = getSupabaseAdmin();

    const { data: allCourses } = await sb
      .from('courses')
      .select('id, code, name, credits, track, category, timeslots')
      .or(`semester.eq.${semester},semester.eq.both`);

    const courseListText = (allCourses || []).length
      ? allCourses.map(c => {
          const slots = (c.timeslots || []).map(s => `${s.day} ${s.start}-${s.end}`).join(', ');
          return `[${c.code}] ${c.name} (${c.category}, ${c.credits}학점, ${c.track || '공통'}) | ${slots || '시간미정'}`;
        }).join('\n')
      : '(개설 과목 데이터 없음)';

    const scheduleText = (currentSchedule || []).length
      ? currentSchedule.map(c => {
          const slots = (c.timeslots || []).map(s => `${s.day} ${s.start}-${s.end}`).join(', ');
          return `[${c.code}] ${c.name} | ${slots}`;
        }).join('\n')
      : '(없음)';

    const systemPrompt = `당신은 KENTECH 시간표 추천 도우미입니다. 아래 정보를 바탕으로 사용자의 요청을 분석하세요.

[현재 시간표]
${scheduleText}

[전체 개설 과목 목록]
${courseListText}

사용자 요청을 분석하여 반드시 아래 JSON 형식으로만 응답하세요:
{
  "action": "remove" | "add" | "replace" | "filter",
  "remove_codes": ["제거할 과목코드 배열, 없으면 []"],
  "exclude_days": ["제외할 요일 MON/TUE/WED/THU/FRI, 없으면 []"],
  "exclude_before": "HH:MM 형식 이 시간 이전 수업 제외, 없으면 null",
  "include_codes": ["추가/우선 포함할 과목코드 배열, 없으면 []"],
  "reply": "사용자에게 보여줄 한국어 응답 메시지 1~2문장"
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: message }],
      response_format: { type: 'json_object' },
    });

    let intent;
    try { intent = JSON.parse(completion.choices[0].message.content); }
    catch { return Response.json({ error: 'LLM 응답 파싱 실패. 다시 시도해주세요.' }, { status: 500 }); }
    if (!intent.action) return Response.json({ error: 'LLM 응답 형식 오류. 다시 시도해주세요.' }, { status: 500 });

    const plans = await generateRecommendations(userId, semester, {}, 3, intent);
    return Response.json({ intent, plans, reply: intent.reply });
  } catch (err) { return errorJson(err); }
}
```

- [ ] **Step 2: 커밋**

```bash
git add app/api/chat/route.js
git commit -m "feat(api): POST /api/chat"
```

### Task 15: GET /api/tracker (on-demand 집계)

**Files:**
- Create: `app/api/tracker/route.js`

- [ ] **Step 1: 구현 — cron 메모리 캐시 제거, 매 요청마다 집계**

```js
import { getSupabaseAdmin } from '@/lib/server/supabase';
import { requireAuth, errorJson } from '@/lib/server/auth';

export async function GET(request) {
  try {
    requireAuth(request);
    const semester = process.env.CURRENT_SEMESTER || '2026-spring';
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from('planned_schedules').select('course_id').eq('semester', semester);
    if (error) throw error;
    const counts = new Map();
    for (const r of data || []) counts.set(r.course_id, (counts.get(r.course_id) || 0) + 1);
    const tracker = [...counts.entries()].map(([course_id, applicants]) => ({ course_id, applicants }));
    return Response.json({ tracker });
  } catch (err) { return errorJson(err); }
}
```

- [ ] **Step 2: 커밋**

```bash
git add app/api/tracker/route.js
git commit -m "feat(api): GET /api/tracker (on-demand aggregation, no cron cache)"
```

### Task 16: GET/POST /api/users/preferences

**Files:**
- Create: `app/api/users/preferences/route.js`

- [ ] **Step 1: 구현**

```js
import { getSupabaseAdmin } from '@/lib/server/supabase';
import { requireAuth, errorJson } from '@/lib/server/auth';

export async function GET(request) {
  try {
    const { userId } = requireAuth(request);
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from('user_preferences').select('*').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return Response.json({ preferences: data || null });
  } catch (err) { return errorJson(err); }
}

export async function POST(request) {
  try {
    const { userId } = requireAuth(request);
    const { preferred_tracks, avoid_morning, preferred_gap, day_off } = await request.json();
    const sb = getSupabaseAdmin();
    const { error } = await sb.from('user_preferences').upsert({
      user_id: userId,
      preferred_tracks,
      avoid_morning,
      preferred_gap: preferred_gap ?? 60,
      day_off,
    }, { onConflict: 'user_id' });
    if (error) throw error;
    return Response.json({ success: true });
  } catch (err) { return errorJson(err); }
}
```

- [ ] **Step 2: 커밋**

```bash
git add app/api/users/preferences/route.js
git commit -m "feat(api): users/preferences GET+POST"
```

### Task 17: GET/DELETE /api/users/me

**Files:**
- Create: `app/api/users/me/route.js`

- [ ] **Step 1: 구현 — DELETE는 RPC fn_delete_user 호출**

```js
import { getSupabaseAdmin } from '@/lib/server/supabase';
import { requireAuth, errorJson } from '@/lib/server/auth';
import { verifyIdToken, GoogleAuthError } from '@/lib/server/googleVerify';

export async function GET(request) {
  try {
    const { userId } = requireAuth(request);
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from('users').select('id, email, name, grade, student_id, role').eq('id', userId).maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ error: '유저 없음' }, { status: 404 });
    return Response.json({ user: data });
  } catch (err) { return errorJson(err); }
}

export async function DELETE(request) {
  try {
    const { userId } = requireAuth(request);
    const { id_token } = await request.json();
    if (!id_token) return Response.json({ error: 'Google 재인증이 필요합니다.' }, { status: 400 });

    let payload;
    try { payload = await verifyIdToken(id_token); }
    catch (e) {
      if (e instanceof GoogleAuthError) return Response.json({ error: e.message }, { status: e.status });
      throw e;
    }

    const sb = getSupabaseAdmin();
    const { error } = await sb.rpc('fn_delete_user', { p_user_id: userId, p_google_sub: payload.sub });
    if (error) {
      if (error.message.includes('USER_NOT_FOUND'))      return Response.json({ error: '유저 없음' }, { status: 404 });
      if (error.message.includes('GOOGLE_SUB_MISMATCH')) return Response.json({ error: '본인 계정으로 재인증해주세요.' }, { status: 403 });
      throw error;
    }
    return Response.json({ success: true });
  } catch (err) { return errorJson(err); }
}
```

- [ ] **Step 2: 커밋**

```bash
git add app/api/users/me/route.js
git commit -m "feat(api): users/me GET+DELETE (delete via RPC)"
```

---

## Phase 6 — 클라이언트 코드 이식

### Task 18: 공통 CSS, store, api-client

**Files:**
- Create: `app/globals.css` (from legacy/client/src/index.css)
- Create: `lib/store.js`
- Create: `lib/api-client.js`

- [ ] **Step 1: index.css → globals.css 복사**

```bash
cp "legacy/client/src/index.css" "app/globals.css"
```

- [ ] **Step 2: lib/store.js (Next.js 호환 — SSR 브라우저 체크)**

```js
'use client';
import { create } from 'zustand';

const getInitialToken = () => (typeof window !== 'undefined' ? localStorage.getItem('token') : null);

const useStore = create((set) => ({
  user: null,
  token: getInitialToken(),
  currentSchedule: [],
  semester: '2025-spring',
  setUser: (user) => set({ user }),
  setToken: (token) => {
    if (typeof window !== 'undefined') localStorage.setItem('token', token);
    set({ token });
  },
  logout: () => {
    if (typeof window !== 'undefined') localStorage.removeItem('token');
    set({ user: null, token: null, currentSchedule: [] });
  },
  setCurrentSchedule: (schedule) => set({ currentSchedule: schedule }),
  setSemester: (semester) => set({ semester }),
}));

export default useStore;
```

- [ ] **Step 3: lib/api-client.js (baseURL `/api`)**

```js
'use client';
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use(config => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authAPI = {
  googleLogin:    (id_token) => api.post('/auth/google', { id_token }),
  googleRegister: (payload)  => api.post('/auth/google/register', payload),
};
export const scheduleAPI = {
  recommend: (data)     => api.post('/schedule/recommend', data),
  getMy:     (semester) => api.get(`/schedule/my?semester=${semester}`),
  save:      (data)     => api.post('/schedule/save', data),
};
export const coursesAPI = {
  getAll:          (params)  => api.get('/courses', { params }),
  getRequirements: ()        => api.get('/courses/requirements'),
  saveCompleted:   (courses) => api.post('/courses/completed', { courses }),
};
export const usersAPI = {
  getMe:           ()         => api.get('/users/me'),
  savePreferences: (data)     => api.post('/users/preferences', data),
  getPreferences:  ()         => api.get('/users/preferences'),
  deleteAccount:   (id_token) => api.delete('/users/me', { data: { id_token } }),
};
export const chatAPI    = { send: (data) => api.post('/chat', data) };
export const trackerAPI = { get:  ()     => api.get('/tracker') };

export default api;
```

- [ ] **Step 4: 커밋**

```bash
git add app/globals.css lib/store.js lib/api-client.js
git commit -m "feat(client): port store, api client, global styles"
```

### Task 19: components 이식 (4개)

**Files:**
- Create: `components/Chat/Chat.jsx`, `components/Chat/Chat.css`
- Create: `components/Dashboard/Dashboard.jsx`, `components/Dashboard/Dashboard.css`
- Create: `components/Timetable/TimetableGrid.jsx`, `components/Timetable/TimetableGrid.css`
- Create: `components/Tracker/Tracker.jsx`, `components/Tracker/Tracker.css`

- [ ] **Step 1: 4개 컴포넌트 + CSS 복사**

```bash
cp -r "legacy/client/src/components/." components/
```

- [ ] **Step 2: 각 .jsx 파일을 다음 규칙대로 수정**

각 컴포넌트 파일에서:
1. 1행에 `'use client';` 삽입
2. `from '../../api'` → `from '@/lib/api-client'`
3. `from '../../store'` → `from '@/lib/store'`

예시 — `components/Chat/Chat.jsx` 시작부:
```jsx
'use client';
import React, { useState, useRef, useEffect } from 'react';
import { chatAPI } from '@/lib/api-client';
import useStore from '@/lib/store';
import './Chat.css';
// (이하 기존 로직 그대로)
```

`components/Dashboard/Dashboard.jsx`:
```jsx
'use client';
import React, { useEffect, useState } from 'react';
import { RadialBarChart, RadialBar, Legend, ResponsiveContainer } from 'recharts';
import { coursesAPI } from '@/lib/api-client';
import './Dashboard.css';
// (이하 기존 로직 그대로)
```

`components/Timetable/TimetableGrid.jsx`:
```jsx
'use client';
import React from 'react';
import './TimetableGrid.css';
// (이하 기존 로직 그대로)
```

`components/Tracker/Tracker.jsx`:
```jsx
'use client';
import React, { useEffect, useState } from 'react';
import { trackerAPI } from '@/lib/api-client';
import './Tracker.css';
// (이하 기존 로직 그대로)
```

- [ ] **Step 3: 커밋**

```bash
git add components/
git commit -m "feat(client): port Chat/Dashboard/Timetable/Tracker components"
```

### Task 20: Providers (GoogleOAuthProvider + auth bootstrap) + Root layout 갱신

**Files:**
- Create: `app/providers.jsx`
- Modify: `app/layout.jsx`

- [ ] **Step 1: app/providers.jsx**

```jsx
'use client';
import { useEffect } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import useStore from '@/lib/store';
import { usersAPI } from '@/lib/api-client';

function AuthBootstrap({ children }) {
  const { token, user, setUser, logout } = useStore();
  useEffect(() => {
    if (token && !user) {
      usersAPI.getMe().then(r => setUser(r.data.user)).catch(() => logout());
    }
  }, [token]);
  return children;
}

export default function Providers({ children }) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
  return (
    <GoogleOAuthProvider clientId={clientId}>
      <AuthBootstrap>{children}</AuthBootstrap>
    </GoogleOAuthProvider>
  );
}
```

- [ ] **Step 2: app/layout.jsx 교체**

```jsx
import './globals.css';
import Providers from './providers';

export const metadata = { title: 'KENTECHTIME', description: 'KENTECH 맞춤형 시간표 추천' };

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: 커밋**

```bash
git add app/providers.jsx app/layout.jsx
git commit -m "feat(client): root layout with GoogleOAuthProvider + auth bootstrap"
```

### Task 21: AuthPage 이식

**Files:**
- Create: `app/auth/page.jsx`
- Create: `app/auth/AuthPage.css`

- [ ] **Step 1: CSS 복사**

```bash
mkdir -p app/auth
cp "legacy/client/src/pages/AuthPage.css" "app/auth/AuthPage.css"
```

- [ ] **Step 2: app/auth/page.jsx**

```jsx
'use client';
import { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useRouter } from 'next/navigation';
import { authAPI } from '@/lib/api-client';
import useStore from '@/lib/store';
import './AuthPage.css';

export default function AuthPage() {
  const [error, setError] = useState('');
  const { setToken, setUser } = useStore();
  const router = useRouter();

  const handleGoogleSuccess = async (credentialResponse) => {
    setError('');
    const idToken = credentialResponse?.credential;
    if (!idToken) { setError('Google 인증 응답이 비어있습니다.'); return; }
    try {
      const res = await authAPI.googleLogin(idToken);
      if (res.data.is_new_user) {
        // next/navigation은 location.state 미지원 → sessionStorage 사용
        sessionStorage.setItem('onboarding', JSON.stringify({ idToken, googleProfile: res.data.google }));
        router.push('/onboarding');
        return;
      }
      setToken(res.data.token);
      setUser(res.data.user);
      router.push('/');
    } catch (err) {
      setError(err.response?.data?.error || '로그인에 실패했습니다.');
    }
  };

  const handleGoogleError = () => setError('Google 로그인이 취소되었거나 실패했습니다.');

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>KENTECHTIME</h1>
        <p className="subtitle">KENTECH 맞춤형 시간표 추천 서비스</p>
        <p className="auth-hint">@kentech.ac.kr 계정으로 시작하세요</p>
        <div className="google-btn-wrapper">
          <GoogleLogin onSuccess={handleGoogleSuccess} onError={handleGoogleError} />
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 커밋**

```bash
git add app/auth/
git commit -m "feat(client): port AuthPage to app router"
```

### Task 22: OnboardingPage 이식

**Files:**
- Create: `app/onboarding/page.jsx`
- Create: `app/onboarding/OnboardingPage.css`

- [ ] **Step 1: CSS 복사**

```bash
mkdir -p app/onboarding
cp "legacy/client/src/pages/OnboardingPage.css" "app/onboarding/OnboardingPage.css"
```

- [ ] **Step 2: page.jsx — `legacy/client/src/pages/OnboardingPage.jsx` 의 로직을 100% 이식하되 다음만 수정**

변경 규칙:
- 1행에 `'use client';` 추가
- `import { useNavigate, useLocation } from 'react-router-dom';` → `import { useRouter } from 'next/navigation';`
- `import { authAPI, coursesAPI } from '../api';` → `import { authAPI, coursesAPI } from '@/lib/api-client';`
- `import useStore from '../store';` → `import useStore from '@/lib/store';`
- `useNavigate()` / `useLocation()` 사용 부분 → `useRouter()` + `sessionStorage`
- `navigate('/auth', { replace: true })` → `router.replace('/auth')`
- `navigate('/onboarding', { state: {...} })` 는 AuthPage가 sessionStorage에 저장하므로 여기선 **읽기**만 함:

```jsx
'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authAPI, coursesAPI } from '@/lib/api-client';
import useStore from '@/lib/store';
import './OnboardingPage.css';

const STEPS = ['기본 정보', '기수강 과목', '선호도'];
const TRACKS = ['AI', '신소재', '에너지그리드', '공통'];
const DAYS = [
  { value: 'MON', label: '월' }, { value: 'TUE', label: '화' },
  { value: 'WED', label: '수' }, { value: 'THU', label: '목' },
  { value: 'FRI', label: '금' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { setToken, setUser } = useStore();

  const [idToken, setIdToken] = useState(null);
  const [googleProfile, setGoogleProfile] = useState(null);

  useEffect(() => {
    const raw = typeof window !== 'undefined' ? sessionStorage.getItem('onboarding') : null;
    if (!raw) { router.replace('/auth'); return; }
    try {
      const { idToken: t, googleProfile: g } = JSON.parse(raw);
      if (!t) { router.replace('/auth'); return; }
      setIdToken(t); setGoogleProfile(g || null);
    } catch { router.replace('/auth'); }
  }, [router]);

  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({ name: '', student_id: '', semester: '' });
  useEffect(() => {
    if (googleProfile?.name) setForm(f => f.name ? f : { ...f, name: googleProfile.name });
  }, [googleProfile]);

  const [allCourses, setAllCourses] = useState([]);
  const [selectedCourseIds, setSelectedCourseIds] = useState(new Set());
  const [courseSearch, setCourseSearch] = useState('');
  const [prefs, setPrefs] = useState({ preferred_tracks: [], avoid_morning: false, day_off: [], preferred_gap: 60 });

  useEffect(() => {
    if (step === 1 && allCourses.length === 0) {
      coursesAPI.getAll().then(res => setAllCourses(res.data.courses || [])).catch(() => {});
    }
  }, [step, allCourses.length]);

  const handleStep1Next = (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim() || !form.student_id.trim() || !form.semester) {
      setError('이름·학번·학기차를 모두 입력해주세요.'); return;
    }
    setStep(1);
  };
  const handleStep2Next = () => setStep(2);
  const handleFinish = async () => {
    setError(''); setLoading(true);
    try {
      const res = await authAPI.googleRegister({
        id_token: idToken,
        name: form.name.trim(),
        student_id: form.student_id.trim(),
        semester: Number(form.semester),
        completed_course_ids: [...selectedCourseIds],
        preferences: prefs,
      });
      sessionStorage.removeItem('onboarding');
      setToken(res.data.token);
      setUser(res.data.user);
      router.push('/');
    } catch (err) {
      const msg = err.response?.data?.error || '가입에 실패했습니다.';
      setError(msg);
      if (err.response?.status === 401 || err.response?.status === 403) {
        setTimeout(() => router.replace('/auth'), 1500);
      }
    } finally { setLoading(false); }
  };

  const toggleCourse = (id) => {
    setSelectedCourseIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const togglePrefArray = (key, value) => {
    setPrefs(prev => {
      const arr = prev[key];
      return { ...prev, [key]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] };
    });
  };

  const filteredCourses = allCourses.filter(c => c.name.includes(courseSearch) || c.code.includes(courseSearch));
  const coursesByCategory = ['VC', 'EF', 'EL'].reduce((acc, cat) => {
    acc[cat] = filteredCourses.filter(c => c.category === cat); return acc;
  }, {});

  if (!idToken) return null;

  // === 아래 JSX는 legacy/client/src/pages/OnboardingPage.jsx 의 line 123-289 와 100% 동일하게 복사 ===
  // (stepper, step 0 form, step 1 list, step 2 prefs 마크업 그대로)
  return (
    <div className="auth-page">
      <div className="register-card">
        <div className="stepper">
          {STEPS.map((label, i) => (
            <React.Fragment key={i}>
              <div className={`step-item ${i <= step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
                <div className="step-circle">{i < step ? '✓' : i + 1}</div>
                <span className="step-label">{label}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`step-line ${i < step ? 'done' : ''}`} />}
            </React.Fragment>
          ))}
        </div>

        {error && <p className="error">{error}</p>}

        {step === 0 && (
          <form onSubmit={handleStep1Next}>
            <h2>기본 정보 입력</h2>
            {googleProfile?.email && (
              <p className="step-desc">{googleProfile.email}로 가입을 진행합니다.</p>
            )}
            <input type="text" placeholder="이름" value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })} required />
            <input type="text" placeholder="학번" value={form.student_id}
              onChange={e => setForm({ ...form, student_id: e.target.value })} required />
            <select value={form.semester}
              onChange={e => setForm({ ...form, semester: e.target.value })} required>
              <option value="">학기차 선택</option>
              {[1,2,3,4,5,6,7,8].map(s => <option key={s} value={s}>{s}학기차</option>)}
            </select>
            <button type="submit" disabled={loading}>다음</button>
          </form>
        )}

        {step === 1 && (
          <div className="step-content">
            <h2>기수강 과목 선택</h2>
            <p className="step-desc">이전에 수강 완료한 과목을 모두 선택해주세요.</p>
            <input className="search-input" type="text"
              placeholder="과목명 또는 코드 검색..."
              value={courseSearch} onChange={e => setCourseSearch(e.target.value)} />
            {allCourses.length === 0 ? (
              <p className="empty-msg">아직 개설 과목 데이터가 없습니다.<br />관리자가 추가한 후 마이페이지에서 설정할 수 있습니다.</p>
            ) : (
              <div className="course-list">
                {['VC','EF','EL'].map(cat => coursesByCategory[cat].length > 0 && (
                  <div key={cat} className="course-category">
                    <h3 className={`cat-title cat-${cat}`}>{cat}</h3>
                    {coursesByCategory[cat].map(course => (
                      <label key={course.id} className={`course-item ${selectedCourseIds.has(course.id) ? 'checked' : ''}`}>
                        <input type="checkbox"
                          checked={selectedCourseIds.has(course.id)}
                          onChange={() => toggleCourse(course.id)} />
                        <span className="course-name">{course.name}</span>
                        <span className="course-meta">{course.code} · {course.credits}학점</span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            )}
            <div className="step-footer">
              <span className="selected-count">선택: {selectedCourseIds.size}과목</span>
              <button className="btn-secondary" onClick={() => setStep(0)}>이전</button>
              <button onClick={handleStep2Next}>다음</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="step-content">
            <h2>선호도 설정</h2>
            <p className="step-desc">시간표 추천에 활용됩니다.</p>

            <div className="pref-section">
              <label className="pref-label">관심 트랙</label>
              <div className="chip-group">
                {TRACKS.map(track => (
                  <button key={track} type="button"
                    className={`chip ${prefs.preferred_tracks.includes(track) ? 'selected' : ''}`}
                    onClick={() => togglePrefArray('preferred_tracks', track)}>{track}</button>
                ))}
              </div>
            </div>

            <div className="pref-section">
              <label className="pref-label">공강 요일</label>
              <div className="chip-group">
                {DAYS.map(d => (
                  <button key={d.value} type="button"
                    className={`chip ${prefs.day_off.includes(d.value) ? 'selected' : ''}`}
                    onClick={() => togglePrefArray('day_off', d.value)}>{d.label}요일</button>
                ))}
              </div>
            </div>

            <div className="pref-section">
              <label className="pref-label">아침 수업 기피 (9:00 이전)</label>
              <div className="toggle-row">
                <span>{prefs.avoid_morning ? '기피함' : '상관없음'}</span>
                <button type="button"
                  className={`toggle ${prefs.avoid_morning ? 'on' : ''}`}
                  onClick={() => setPrefs(p => ({ ...p, avoid_morning: !p.avoid_morning }))}>
                  <div className="toggle-thumb" />
                </button>
              </div>
            </div>

            <div className="pref-section">
              <label className="pref-label">최소 공강 시간: {prefs.preferred_gap}분</label>
              <input type="range" min="0" max="120" step="15"
                value={prefs.preferred_gap}
                onChange={e => setPrefs(p => ({ ...p, preferred_gap: Number(e.target.value) }))}
                className="range-input" />
              <div className="range-labels"><span>0분</span><span>120분</span></div>
            </div>

            <div className="step-footer">
              <button className="btn-secondary" onClick={() => setStep(1)}>이전</button>
              <button onClick={handleFinish} disabled={loading}>
                {loading ? '가입 중...' : '완료'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 커밋**

```bash
git add app/onboarding/
git commit -m "feat(client): port OnboardingPage to app router (sessionStorage state passing)"
```

### Task 23: MainPage 이식 + 보호 라우트

**Files:**
- Modify: `app/page.jsx` (replace placeholder)
- Create: `app/MainPage.css`

- [ ] **Step 1: CSS 복사**

```bash
cp "legacy/client/src/pages/MainPage.css" "app/MainPage.css"
```

- [ ] **Step 2: app/page.jsx 교체 — 토큰 없으면 /auth 리다이렉트**

```jsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GoogleLogin } from '@react-oauth/google';
import TimetableGrid from '@/components/Timetable/TimetableGrid';
import Dashboard from '@/components/Dashboard/Dashboard';
import Chat from '@/components/Chat/Chat';
import Tracker from '@/components/Tracker/Tracker';
import { scheduleAPI, usersAPI } from '@/lib/api-client';
import useStore from '@/lib/store';
import './MainPage.css';

export default function MainPage() {
  const router = useRouter();
  const { token, semester, currentSchedule, setCurrentSchedule, user, logout } = useStore();
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawError, setWithdrawError] = useState('');
  const [withdrawLoading, setWithdrawLoading] = useState(false);

  useEffect(() => { if (!token) router.replace('/auth'); }, [token, router]);

  const loadRecommendations = async () => {
    setLoading(true);
    try {
      const res = await scheduleAPI.recommend({ semester });
      setPlans(res.data.plans);
      if (res.data.plans.length > 0) {
        setCurrentSchedule(res.data.plans[0]);
        setSelectedPlan(0);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (token) loadRecommendations(); }, [token]);

  const handlePlanSelect = (i) => { setSelectedPlan(i); setCurrentSchedule(plans[i]); };

  const handleWithdrawSuccess = async (credentialResponse) => {
    setWithdrawError(''); setWithdrawLoading(true);
    const idToken = credentialResponse?.credential;
    if (!idToken) { setWithdrawError('Google 인증 응답이 비어있습니다.'); setWithdrawLoading(false); return; }
    try {
      await usersAPI.deleteAccount(idToken);
      logout();
      router.replace('/auth');
    } catch (err) {
      setWithdrawError(err.response?.data?.error || '탈퇴 처리 중 오류가 발생했습니다.');
    } finally { setWithdrawLoading(false); }
  };
  const handleWithdrawError = () => setWithdrawError('Google 재인증이 취소되었거나 실패했습니다.');
  const openWithdrawModal = () => { setWithdrawError(''); setShowWithdrawModal(true); };

  const saveSchedule = async () => {
    const courseIds = currentSchedule.map(c => c.id);
    try { await scheduleAPI.save({ courseIds, semester }); alert('시간표가 저장되었습니다.'); }
    catch { alert('저장에 실패했습니다.'); }
  };

  if (!token) return null;

  return (
    <div className="main-page">
      <header className="main-header">
        <span className="logo">KENTECHTIME</span>
        <div className="header-right">
          {user && <span className="username">{user.name}</span>}
          <button className="logout-btn" onClick={() => { logout(); router.replace('/auth'); }}>로그아웃</button>
          <button className="withdraw-btn" onClick={openWithdrawModal}>회원 탈퇴</button>
        </div>
      </header>

      {showWithdrawModal && (
        <div className="modal-overlay" onClick={() => setShowWithdrawModal(false)}>
          <div className="withdraw-modal" onClick={(e) => e.stopPropagation()}>
            <h3>회원 탈퇴</h3>
            <p>탈퇴하면 시간표, 수강 기록, 선호도 등 모든 데이터가 <strong>영구 삭제</strong>됩니다.</p>
            <p>계속하려면 Google 계정으로 다시 인증해주세요.</p>
            {withdrawError && <p className="withdraw-error">{withdrawError}</p>}
            <div className="withdraw-google-wrapper">
              {withdrawLoading
                ? <p>처리 중...</p>
                : <GoogleLogin onSuccess={handleWithdrawSuccess} onError={handleWithdrawError} />}
            </div>
            <div className="withdraw-modal-btns">
              <button onClick={() => setShowWithdrawModal(false)} disabled={withdrawLoading}>취소</button>
            </div>
          </div>
        </div>
      )}

      <div className="main-content">
        <Dashboard />

        <section className="schedule-section">
          <div className="plan-controls">
            <div className="plan-tabs">
              {plans.map((_, i) => (
                <button key={i}
                  className={selectedPlan === i ? 'active' : ''}
                  onClick={() => handlePlanSelect(i)}>
                  Plan {String.fromCharCode(65 + i)}
                </button>
              ))}
            </div>
            <div className="action-btns">
              <button onClick={loadRecommendations} disabled={loading}>
                {loading ? '생성 중...' : '새 추천'}
              </button>
              <button className="save-btn" onClick={saveSchedule}>저장</button>
            </div>
          </div>
          <TimetableGrid courses={currentSchedule} />
        </section>

        <Chat semester={semester} onScheduleUpdate={setCurrentSchedule} />
        <Tracker />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 커밋**

```bash
git add app/page.jsx app/MainPage.css
git commit -m "feat(client): port MainPage to app router with route protection"
```

---

## Phase 7 — 통합 검증

### Task 24: 로컬 dev 서버 전체 플로우 점검

검증만, 파일 수정 없음.

- [ ] **Step 1: 서버 기동**

```bash
npm run dev
```
Expected: `http://localhost:3000` ready, 콘솔 에러 없음.

- [ ] **Step 2: 비로그인 접근 → /auth 리다이렉트**

브라우저에서 `http://localhost:3000` 접속.
Expected: `/auth` 화면 표시.

- [ ] **Step 3: 신규 가입 플로우**

1. Google 로그인 (kentech.ac.kr 계정) → `/onboarding`으로 이동
2. 3-step 진행 → 완료 → `/` (MainPage) 표시
3. Network 탭: `/api/auth/google` (200, is_new_user:true) → `/api/auth/google/register` (201) 확인
4. Supabase 콘솔: users / completed_courses / user_preferences 모두 새 row 확인

- [ ] **Step 4: 기존 유저 로그인**

로그아웃 후 같은 계정으로 다시 로그인 → 곧바로 `/`로 이동 (onboarding 스킵).

- [ ] **Step 5: MainPage 기능**

- 추천 Plan A/B/C 탭 동작
- 시간표 저장 → alert "시간표가 저장되었습니다."
- 챗봇에 "월요일 수업 빼줘" → AI 응답 + plans 갱신
- Tracker 표시 (수강 희망자 데이터)
- 졸업 요건 대시보드 표시

- [ ] **Step 6: 회원 탈퇴**

탈퇴 모달 → Google 재인증 → 성공 → `/auth`로 이동. Supabase에서 user 및 관련 row 모두 삭제 확인.

- [ ] **Step 7: 검증 통과 커밋**

```bash
git commit --allow-empty -m "test: verified full migration flow (signup/login/recommend/chat/tracker/withdraw)"
```

### Task 25: 프로덕션 빌드 확인

- [ ] **Step 1: 빌드**

```bash
npm run build
```
Expected: 빌드 성공, 모든 API route가 ƒ (dynamic)로 표시. 에러 없음.

- [ ] **Step 2: 프로덕션 모드 기동**

```bash
npm start
```
Expected: `http://localhost:3000`에서 모든 페이지 정상 동작.

- [ ] **Step 3: 커밋**

```bash
git commit --allow-empty -m "test: production build succeeds"
```

---

## Phase 8 — Vercel 배포 준비

### Task 26: Vercel 설정 + 문서 업데이트

**Files:**
- Create: `vercel.json` (선택)
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: vercel.json (최소)**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json"
}
```

(cron이 필요해지면 `crons: [{ "path": "/api/cron/tracker", "schedule": "*/10 * * * *" }]` 추가. 현재 plan은 on-demand 집계이므로 생략.)

- [ ] **Step 2: README.md 갱신**

기존 client/server 2-폴더 안내 섹션을 삭제하고:

```md
## 로컬 실행

```bash
npm install
cp .env.example .env.local   # 값 채우기
npm run dev
```

브라우저: http://localhost:3000

## 환경변수

`.env.local` 하나에 모두 설정. `NEXT_PUBLIC_*` 접두사가 붙은 변수만 브라우저에 노출됩니다.

## 배포

Vercel에 루트 폴더(이 디렉토리)를 그대로 연결.
환경변수는 Vercel Dashboard → Settings → Environment Variables 에서 설정.
```

- [ ] **Step 3: CHANGELOG.md 추가**

```md
## [2.0.0] - 2026-05-29

### Changed
- 전체 스택을 Next.js 14 App Router 단일 프로젝트로 통합 (기존 CRA + Express)
- pg raw SQL → @supabase/supabase-js SDK
- 트랜잭션(register/delete)을 Postgres RPC 함수로 분리
- Vercel 단일 배포 구조 채택
- 환경변수를 `.env.local` 하나로 통합
- 기존 코드는 legacy/ 폴더에 보존

### Removed
- concurrently 기반 dual-process dev (`npm run dev:client` + `npm run dev:server`)
- node-cron 기반 tracker 캐시 (serverless 호환을 위해 on-demand 집계로 단순화)
```

- [ ] **Step 4: legacy/ 보존 결정**

본 PR에서는 legacy/ 유지. 마이그레이션 동작 검증이 끝난 뒤 별도 PR에서 제거.

- [ ] **Step 5: 최종 커밋 + 푸시**

```bash
git add vercel.json README.md CHANGELOG.md
git commit -m "docs: update README/CHANGELOG for Next.js migration; add vercel.json"
git push -u origin feat/nextjs-migration
```

---

## Self-Review Checklist

| 항목 | 위치 |
|---|---|
| 모든 Express 라우트(8개)가 Route Handler로 이식 | Tasks 7–17 |
| 트랜잭션 2개(register/delete)가 RPC로 변환 | Task 4 |
| Google OAuth `hd === 'kentech.ac.kr'` 검증 유지 | Task 5 |
| JWT 7일 만료 유지 | Task 6 |
| 클라이언트 페이지 3개(Auth/Onboarding/Main) 이식 | Tasks 21, 22, 23 |
| 컴포넌트 4개(Chat/Dashboard/Timetable/Tracker) 이식 | Task 19 |
| recharts / zustand / @react-oauth/google 그대로 사용 | Tasks 19, 20 |
| axios baseURL `/api` (same-origin) | Task 18 |
| `.env.local` 단일화, `NEXT_PUBLIC_GOOGLE_CLIENT_ID` 변경 | Task 2 |
| Vercel 단일 배포 가능 구조 | Task 26 |
| 기존 코드 legacy/에 보존 | Task 0 |
| 새 브랜치 `feat/nextjs-migration`에서 작업 | Task 0 |

---

## 알려진 트레이드오프

1. **트래커 캐시 제거**: 기존 10분 cron 메모리 캐시 → 매 요청 집계 (현재 데이터셋 작아 부담 없음). 트래픽 증가 시 `tracker_cache` 테이블 + Vercel Cron 도입.
2. **`legacy/` 폴더 보존**: PR 사이즈 증가하지만 참조에 유리. 검증 후 별도 PR에서 제거 권장.
3. **JavaScript 유지**: TS 변환은 별도 작업으로 남김.
4. **Clean Architecture(Project_2 수준) 미적용**: KENTECHTIME 규모(8 routes, ~1300 LoC)에서 model/repo/rule/srv 4-layer는 과도. `lib/server/{supabase,auth,googleVerify,recommender}.js` 수준의 얕은 분리만 적용. 향후 확장 시 도입 가능.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-29-nextjs-migration.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — 새 세션에서 task 단위로 subagent를 dispatch, task 간 리뷰. 빠른 이터레이션, 메인 컨텍스트 보존.

**2. Inline Execution** — 본 세션에서 executing-plans 스킬로 batch 실행, checkpoint마다 리뷰.

**어느 쪽으로 진행할까요?**
