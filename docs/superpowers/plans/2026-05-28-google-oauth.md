# Google OAuth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace email/password authentication with Google OAuth that verifies `@kentech.ac.kr` Workspace accounts via the `hd` claim, and rewire the existing account-deletion flow to re-authenticate via Google instead of password.

**Architecture:**
- Frontend uses `@react-oauth/google`'s `<GoogleLogin>` component → receives ID Token (JWT) from Google → posts to backend.
- Backend uses `google-auth-library` to cryptographically verify the ID Token, then enforces `hd === 'kentech.ac.kr'` and `email_verified === true`. New users complete a 3-step onboarding before atomic INSERT.
- Account deletion replaces bcrypt password check with the same Google ID Token verification.

**Tech Stack:** Node.js/Express, PostgreSQL (Supabase), React 18, `@react-oauth/google`, `google-auth-library`.

**Spec:** `docs/superpowers/specs/2026-05-28-google-oauth-design.md`

**Branch:** `feat/google-oauth` (already created from `main`)

**Prerequisite (user action, before Task 1):** Create OAuth Client ID in Google Cloud Console per spec section 7. Share Client ID with team. Add to local `server/.env` and `client/.env` as `GOOGLE_CLIENT_ID` and `REACT_APP_GOOGLE_CLIENT_ID`.

---

## Task 1: Database schema migration

**Files:**
- Modify: `database/schema.sql`
- Run against: Supabase (manual SQL execution by user)

- [ ] **Step 1: Update schema.sql**

Edit `database/schema.sql`. Find the `users` table (currently lines 1-10) and replace with:

```sql
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(100) UNIQUE NOT NULL,
  name          VARCHAR(50),
  student_id    VARCHAR(20),
  grade         INTEGER,
  semester      INTEGER,
  google_sub    VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255),
  role          VARCHAR(20) DEFAULT 'student',
  created_at    TIMESTAMP DEFAULT NOW()
);
```

(Changes: `password_hash` no longer `NOT NULL`; added `semester INTEGER` and `google_sub VARCHAR(255) UNIQUE`.)

- [ ] **Step 2: Run migration on Supabase**

Open Supabase SQL editor. Run:

```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255) UNIQUE,
  ADD COLUMN IF NOT EXISTS semester   INTEGER;

ALTER TABLE users
  ALTER COLUMN password_hash DROP NOT NULL;
```

Expected: three `ALTER TABLE` confirmations, no errors.

- [ ] **Step 3: Verify columns exist**

In Supabase SQL editor:

```sql
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_name = 'users'
ORDER BY ordinal_position;
```

Expected output includes rows: `google_sub | YES | character varying`, `semester | YES | integer`, `password_hash | YES | character varying`.

- [ ] **Step 4: Commit**

```bash
git add database/schema.sql
git commit -m "feat(db): add google_sub and semester, make password_hash nullable"
```

---

## Task 2: Install google-auth-library

**Files:**
- Modify: `server/package.json`

- [ ] **Step 1: Install dependency**

```bash
cd server
npm install google-auth-library
```

Expected: `google-auth-library` appears in `dependencies` in `server/package.json`.

- [ ] **Step 2: Verify install**

```bash
node -e "const {OAuth2Client} = require('google-auth-library'); console.log(typeof OAuth2Client);"
```

Expected output: `function`

- [ ] **Step 3: Commit**

```bash
git add server/package.json server/package-lock.json
git commit -m "chore(server): add google-auth-library"
```

---

## Task 3: Add Jest for backend unit tests

This sets up minimal Jest so we can TDD the Google verification helper. Skip if Jest is already configured (check `server/package.json` for `jest` dependency).

**Files:**
- Modify: `server/package.json`

- [ ] **Step 1: Install Jest**

```bash
cd server
npm install --save-dev jest
```

- [ ] **Step 2: Add test script**

Edit `server/package.json`, add to `"scripts"`:

```json
"test": "jest"
```

Resulting `scripts` block:

```json
"scripts": {
  "start": "node app.js",
  "dev": "nodemon app.js",
  "test": "jest"
}
```

- [ ] **Step 3: Verify Jest runs**

```bash
cd server
npx jest --passWithNoTests
```

Expected: `No tests found, exiting with code 0` (because of `--passWithNoTests`).

- [ ] **Step 4: Commit**

```bash
git add server/package.json server/package-lock.json
git commit -m "chore(server): add jest for unit tests"
```

---

## Task 4: googleVerify utility — failing test

**Files:**
- Create: `server/utils/__tests__/googleVerify.test.js`

- [ ] **Step 1: Write the failing test**

Create `server/utils/__tests__/googleVerify.test.js` with:

```javascript
const { verifyIdToken, GoogleAuthError } = require('../googleVerify');

jest.mock('google-auth-library', () => {
  const verifyIdTokenMock = jest.fn();
  return {
    OAuth2Client: jest.fn().mockImplementation(() => ({ verifyIdToken: verifyIdTokenMock })),
    __verifyIdTokenMock: verifyIdTokenMock,
  };
});

const { __verifyIdTokenMock } = require('google-auth-library');

beforeEach(() => {
  __verifyIdTokenMock.mockReset();
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
});

function mockPayload(overrides = {}) {
  return {
    getPayload: () => ({
      sub: '1234567890',
      email: 'student@kentech.ac.kr',
      name: '구형준',
      email_verified: true,
      hd: 'kentech.ac.kr',
      aud: 'test-client-id',
      ...overrides,
    }),
  };
}

test('returns sub/email/name on valid kentech.ac.kr token', async () => {
  __verifyIdTokenMock.mockResolvedValue(mockPayload());
  const result = await verifyIdToken('any.id.token');
  expect(result).toEqual({
    sub: '1234567890',
    email: 'student@kentech.ac.kr',
    name: '구형준',
  });
});

test('throws GoogleAuthError when email_verified is false', async () => {
  __verifyIdTokenMock.mockResolvedValue(mockPayload({ email_verified: false }));
  await expect(verifyIdToken('t')).rejects.toThrow(GoogleAuthError);
  await expect(verifyIdToken('t')).rejects.toMatchObject({ status: 403 });
});

test('throws GoogleAuthError when hd is not kentech.ac.kr', async () => {
  __verifyIdTokenMock.mockResolvedValue(mockPayload({ hd: 'gmail.com', email: 'x@gmail.com' }));
  await expect(verifyIdToken('t')).rejects.toMatchObject({ status: 403 });
});

test('throws GoogleAuthError when email domain is not kentech.ac.kr', async () => {
  __verifyIdTokenMock.mockResolvedValue(mockPayload({ email: 'x@other.com' }));
  await expect(verifyIdToken('t')).rejects.toMatchObject({ status: 403 });
});

test('throws GoogleAuthError with 401 when library rejects token', async () => {
  __verifyIdTokenMock.mockRejectedValue(new Error('Invalid token signature'));
  await expect(verifyIdToken('t')).rejects.toMatchObject({ status: 401 });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd server
npx jest utils/__tests__/googleVerify.test.js
```

Expected: FAIL with "Cannot find module '../googleVerify'".

---

## Task 5: googleVerify utility — implement

**Files:**
- Create: `server/utils/googleVerify.js`

- [ ] **Step 1: Write the implementation**

Create `server/utils/googleVerify.js`:

```javascript
const { OAuth2Client } = require('google-auth-library');

const ALLOWED_DOMAIN = 'kentech.ac.kr';

class GoogleAuthError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'GoogleAuthError';
    this.status = status;
  }
}

let client = null;
function getClient() {
  if (!client) {
    if (!process.env.GOOGLE_CLIENT_ID) {
      throw new Error('GOOGLE_CLIENT_ID is not set in environment');
    }
    client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }
  return client;
}

async function verifyIdToken(idToken) {
  let ticket;
  try {
    ticket = await getClient().verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
  } catch (err) {
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

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name || '',
  };
}

module.exports = { verifyIdToken, GoogleAuthError };
```

- [ ] **Step 2: Run tests to verify pass**

```bash
cd server
npx jest utils/__tests__/googleVerify.test.js
```

Expected: 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git add server/utils/googleVerify.js server/utils/__tests__/googleVerify.test.js
git commit -m "feat(auth): add Google ID Token verifier with hd domain check"
```

---

## Task 6: Replace auth.js routes

**Files:**
- Modify: `server/routes/auth.js` (full rewrite)

- [ ] **Step 1: Rewrite auth.js**

Replace the entire contents of `server/routes/auth.js` with:

```javascript
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../models/db');
const { verifyIdToken, GoogleAuthError } = require('../utils/googleVerify');

function signJwt(user) {
  return jwt.sign(
    { userId: user.id, role: user.role || 'student' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role || 'student',
    semester: row.semester,
    student_id: row.student_id,
  };
}

// POST /api/auth/google — login or check if new user
router.post('/google', async (req, res) => {
  const { id_token } = req.body;
  if (!id_token) return res.status(400).json({ error: 'id_token이 필요합니다.' });

  let payload;
  try {
    payload = await verifyIdToken(id_token);
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('Google verify error:', err);
    return res.status(500).json({ error: '서버 오류' });
  }

  try {
    // First match by google_sub, then fall back to email (handles existing users
    // pre-OAuth, e.g. admin account magnesium@kentech.ac.kr).
    let result = await db.query('SELECT * FROM users WHERE google_sub = $1', [payload.sub]);
    if (result.rowCount === 0) {
      result = await db.query('SELECT * FROM users WHERE email = $1', [payload.email]);
      if (result.rowCount > 0) {
        await db.query('UPDATE users SET google_sub = $1 WHERE id = $2', [payload.sub, result.rows[0].id]);
        result.rows[0].google_sub = payload.sub;
      }
    }

    if (result.rowCount === 0) {
      return res.json({
        is_new_user: true,
        google: { email: payload.email, name: payload.name },
      });
    }

    const user = result.rows[0];
    const token = signJwt(user);
    return res.json({ token, user: publicUser(user), is_new_user: false });
  } catch (err) {
    console.error('Google login error:', err);
    return res.status(500).json({ error: '서버 오류' });
  }
});

// POST /api/auth/google/register — atomic onboarding submission
router.post('/google/register', async (req, res) => {
  const { id_token, name, student_id, semester, completed_course_ids, preferences } = req.body;

  if (!id_token) return res.status(400).json({ error: 'id_token이 필요합니다.' });
  if (!name || typeof name !== 'string') return res.status(400).json({ error: '이름을 입력해주세요.' });
  if (!student_id || typeof student_id !== 'string') return res.status(400).json({ error: '학번을 입력해주세요.' });
  if (!Number.isInteger(semester) || semester < 1 || semester > 8) {
    return res.status(400).json({ error: '학기차는 1~8 사이의 정수여야 합니다.' });
  }

  let payload;
  try {
    payload = await verifyIdToken(id_token);
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('Google verify error:', err);
    return res.status(500).json({ error: '서버 오류' });
  }

  const courseIds = Array.isArray(completed_course_ids) ? completed_course_ids.filter(Number.isInteger) : [];
  const prefs = preferences || {};

  try {
    // Guard: existing user — bounce them to login flow.
    const existing = await db.query(
      'SELECT id FROM users WHERE google_sub = $1 OR email = $2',
      [payload.sub, payload.email]
    );
    if (existing.rowCount > 0) {
      return res.status(409).json({ error: '이미 가입된 계정입니다. 로그인해주세요.' });
    }

    await db.query('BEGIN');
    try {
      const grade = Math.ceil(semester / 2);
      const userRes = await db.query(
        `INSERT INTO users (email, name, student_id, grade, semester, google_sub, role)
         VALUES ($1, $2, $3, $4, $5, $6, 'student')
         RETURNING id, email, name, role, semester, student_id`,
        [payload.email, name, student_id, grade, semester, payload.sub]
      );
      const user = userRes.rows[0];

      for (const courseId of courseIds) {
        await db.query(
          `INSERT INTO completed_courses (user_id, course_id)
           VALUES ($1, $2)
           ON CONFLICT (user_id, course_id) DO NOTHING`,
          [user.id, courseId]
        );
      }

      await db.query(
        `INSERT INTO user_preferences (user_id, preferred_tracks, avoid_morning, preferred_gap, day_off)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO UPDATE SET
           preferred_tracks = EXCLUDED.preferred_tracks,
           avoid_morning    = EXCLUDED.avoid_morning,
           preferred_gap    = EXCLUDED.preferred_gap,
           day_off          = EXCLUDED.day_off`,
        [
          user.id,
          Array.isArray(prefs.preferred_tracks) ? prefs.preferred_tracks : [],
          !!prefs.avoid_morning,
          Number.isInteger(prefs.preferred_gap) ? prefs.preferred_gap : 60,
          Array.isArray(prefs.day_off) ? prefs.day_off : [],
        ]
      );

      await db.query('COMMIT');

      const token = signJwt(user);
      return res.status(201).json({ token, user: publicUser(user) });
    } catch (innerErr) {
      await db.query('ROLLBACK');
      throw innerErr;
    }
  } catch (err) {
    console.error('Google register error:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: '이미 가입된 이메일입니다.' });
    }
    return res.status(500).json({ error: '서버 오류' });
  }
});

module.exports = router;
```

- [ ] **Step 2: Smoke-test the route file loads**

```bash
cd server
node -e "require('./routes/auth')"
```

Expected: no output, no error (module loads).

- [ ] **Step 3: Start server, hit endpoint with invalid token**

In one terminal:

```bash
cd server
npm run dev
```

In another terminal:

```bash
curl -X POST http://localhost:4000/api/auth/google \
  -H "Content-Type: application/json" \
  -d '{"id_token":"not-a-real-token"}'
```

Expected: `{"error":"Invalid Google ID Token"}` with HTTP 401.

Stop server (Ctrl+C).

- [ ] **Step 4: Commit**

```bash
git add server/routes/auth.js
git commit -m "feat(auth): replace register/login with Google OAuth endpoints"
```

---

## Task 7: Update DELETE /api/users/me to use Google re-auth

**Files:**
- Modify: `server/routes/users.js`

- [ ] **Step 1: Replace bcrypt import and DELETE handler**

In `server/routes/users.js`, remove the line `const bcrypt = require('bcryptjs');` (line 3) and add directly above the existing line `const db = require('../models/db');`:

```javascript
const { verifyIdToken, GoogleAuthError } = require('../utils/googleVerify');
```

Then replace the entire `DELETE /api/users/me` handler (currently lines 54-84) with:

```javascript
// DELETE /api/users/me — 회원 탈퇴 (Google 재인증 후 모든 데이터 삭제)
router.delete('/me', authMiddleware, async (req, res) => {
  const { id_token } = req.body;
  if (!id_token) return res.status(400).json({ error: 'Google 재인증이 필요합니다.' });

  let payload;
  try {
    payload = await verifyIdToken(id_token);
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('Google verify error:', err);
    return res.status(500).json({ error: '서버 오류' });
  }

  try {
    const result = await db.query('SELECT google_sub FROM users WHERE id = $1', [req.userId]);
    if (result.rowCount === 0) return res.status(404).json({ error: '유저 없음' });

    if (result.rows[0].google_sub !== payload.sub) {
      return res.status(403).json({ error: '본인 계정으로 재인증해주세요.' });
    }

    await db.query('BEGIN');
    try {
      await db.query('DELETE FROM reviews WHERE user_id = $1', [req.userId]);
      await db.query('DELETE FROM planned_schedules WHERE user_id = $1', [req.userId]);
      await db.query('DELETE FROM completed_courses WHERE user_id = $1', [req.userId]);
      await db.query('DELETE FROM user_preferences WHERE user_id = $1', [req.userId]);
      await db.query('DELETE FROM users WHERE id = $1', [req.userId]);
      await db.query('COMMIT');
    } catch (innerErr) {
      await db.query('ROLLBACK');
      throw innerErr;
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Delete Account Error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});
```

- [ ] **Step 2: Smoke-test module loads**

```bash
cd server
node -e "require('./routes/users')"
```

Expected: no error.

- [ ] **Step 3: Commit**

```bash
git add server/routes/users.js
git commit -m "feat(users): require Google re-auth for account deletion"
```

---

## Task 8: Verify GET /api/courses is unauthenticated

The new onboarding flow must fetch the course catalog *before* the user exists (no JWT yet). Confirm the courses listing endpoint allows this.

**Files:**
- Read: `server/routes/courses.js`
- Modify (if needed): `server/routes/courses.js`

- [ ] **Step 1: Inspect courses.js**

Read `server/routes/courses.js`. Find the `GET /` (i.e. `GET /api/courses`) handler. Check whether `authMiddleware` is applied to it.

- [ ] **Step 2: If `authMiddleware` is applied to GET /, remove it**

Remove the `authMiddleware` argument from the `router.get('/', ...)` call. Keep `authMiddleware` on routes that mutate data (`POST /completed` etc.).

If `authMiddleware` is *not* applied to `GET /`, skip this step.

- [ ] **Step 3: Smoke-test unauthenticated access**

Start server (`cd server && npm run dev`), then:

```bash
curl http://localhost:4000/api/courses
```

Expected: HTTP 200 with `{"courses":[...]}` (or empty array). NOT a 401.

Stop server.

- [ ] **Step 4: Commit (only if you changed the file)**

```bash
git add server/routes/courses.js
git commit -m "fix(courses): allow unauthenticated catalog listing for onboarding"
```

---

## Task 9: Install @react-oauth/google

**Files:**
- Modify: `client/package.json`

- [ ] **Step 1: Install**

```bash
cd client
npm install @react-oauth/google
```

- [ ] **Step 2: Verify**

```bash
node -e "console.log(require('@react-oauth/google').GoogleLogin ? 'ok' : 'missing')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add client/package.json client/package-lock.json
git commit -m "chore(client): add @react-oauth/google"
```

---

## Task 10: Wrap App in GoogleOAuthProvider

**Files:**
- Modify: `client/src/index.js`

- [ ] **Step 1: Edit index.js**

Replace the contents of `client/src/index.js` with:

```javascript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App';
import './index.css';

const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;
if (!clientId) {
  // eslint-disable-next-line no-console
  console.error('REACT_APP_GOOGLE_CLIENT_ID is not set. Google login will not work.');
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={clientId || ''}>
      <App />
    </GoogleOAuthProvider>
  </React.StrictMode>
);
```

- [ ] **Step 2: Commit**

```bash
git add client/src/index.js
git commit -m "feat(client): wrap App in GoogleOAuthProvider"
```

---

## Task 11: Update API client (`client/src/api/index.js`)

**Files:**
- Modify: `client/src/api/index.js`

- [ ] **Step 1: Replace authAPI and deleteAccount signature**

Edit `client/src/api/index.js`. Replace the `authAPI` export (currently lines 13-16) with:

```javascript
export const authAPI = {
  googleLogin: (id_token) => api.post('/auth/google', { id_token }),
  googleRegister: (payload) => api.post('/auth/google/register', payload),
};
```

And replace the `usersAPI.deleteAccount` line with:

```javascript
  deleteAccount: (id_token) => api.delete('/users/me', { data: { id_token } }),
```

Final `usersAPI` block:

```javascript
export const usersAPI = {
  getMe: () => api.get('/users/me'),
  savePreferences: (data) => api.post('/users/preferences', data),
  getPreferences: () => api.get('/users/preferences'),
  deleteAccount: (id_token) => api.delete('/users/me', { data: { id_token } }),
};
```

- [ ] **Step 2: Commit**

```bash
git add client/src/api/index.js
git commit -m "feat(client): swap email/password auth API for Google OAuth"
```

---

## Task 12: Create AuthPage

**Files:**
- Create: `client/src/pages/AuthPage.jsx`
- Create: `client/src/pages/AuthPage.css`

- [ ] **Step 1: Write AuthPage.jsx**

Create `client/src/pages/AuthPage.jsx`:

```jsx
import React, { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../api';
import useStore from '../store';
import './AuthPage.css';

export default function AuthPage() {
  const [error, setError] = useState('');
  const { setToken, setUser } = useStore();
  const navigate = useNavigate();

  const handleGoogleSuccess = async (credentialResponse) => {
    setError('');
    const idToken = credentialResponse?.credential;
    if (!idToken) {
      setError('Google 인증 응답이 비어있습니다.');
      return;
    }
    try {
      const res = await authAPI.googleLogin(idToken);
      if (res.data.is_new_user) {
        navigate('/onboarding', {
          state: { idToken, googleProfile: res.data.google },
        });
        return;
      }
      setToken(res.data.token);
      setUser(res.data.user);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || '로그인에 실패했습니다.');
    }
  };

  const handleGoogleError = () => {
    setError('Google 로그인이 취소되었거나 실패했습니다.');
  };

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

- [ ] **Step 2: Write AuthPage.css**

Create `client/src/pages/AuthPage.css`:

```css
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f7fb;
}

.auth-card {
  background: #fff;
  padding: 40px;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  width: 360px;
  text-align: center;
}

.auth-card h1 {
  margin: 0 0 8px;
  font-size: 28px;
}

.auth-card .subtitle {
  color: #666;
  margin: 0 0 24px;
  font-size: 14px;
}

.auth-card .auth-hint {
  color: #888;
  font-size: 13px;
  margin: 0 0 16px;
}

.google-btn-wrapper {
  display: flex;
  justify-content: center;
  margin: 16px 0;
}

.auth-card .error {
  color: #d32f2f;
  font-size: 13px;
  margin-top: 12px;
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/AuthPage.jsx client/src/pages/AuthPage.css
git commit -m "feat(client): add AuthPage with Google sign-in"
```

---

## Task 13: Rename RegisterPage → OnboardingPage and defer all saves

**Files:**
- Rename: `client/src/pages/RegisterPage.jsx` → `client/src/pages/OnboardingPage.jsx`
- Rename: `client/src/pages/RegisterPage.css` → `client/src/pages/OnboardingPage.css`
- Modify: contents of new OnboardingPage.jsx

- [ ] **Step 1: Rename files**

```bash
cd client/src/pages
git mv RegisterPage.jsx OnboardingPage.jsx
git mv RegisterPage.css OnboardingPage.css
```

- [ ] **Step 2: Rewrite OnboardingPage.jsx**

Replace the entire contents of `client/src/pages/OnboardingPage.jsx` with:

```jsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { authAPI, coursesAPI } from '../api';
import useStore from '../store';
import './OnboardingPage.css';

const STEPS = ['기본 정보', '기수강 과목', '선호도'];
const TRACKS = ['AI', '신소재', '에너지그리드', '공통'];
const DAYS = [
  { value: 'MON', label: '월' },
  { value: 'TUE', label: '화' },
  { value: 'WED', label: '수' },
  { value: 'THU', label: '목' },
  { value: 'FRI', label: '금' },
];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const idToken = location.state?.idToken;
  const googleProfile = location.state?.googleProfile;
  const { setToken, setUser } = useStore();

  useEffect(() => {
    if (!idToken) navigate('/auth', { replace: true });
  }, [idToken, navigate]);

  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name: googleProfile?.name || '',
    student_id: '',
    semester: '',
  });

  const [allCourses, setAllCourses] = useState([]);
  const [selectedCourseIds, setSelectedCourseIds] = useState(new Set());
  const [courseSearch, setCourseSearch] = useState('');

  const [prefs, setPrefs] = useState({
    preferred_tracks: [],
    avoid_morning: false,
    day_off: [],
    preferred_gap: 60,
  });

  useEffect(() => {
    if (step === 1 && allCourses.length === 0) {
      coursesAPI.getAll().then(res => setAllCourses(res.data.courses || [])).catch(() => {});
    }
  }, [step, allCourses.length]);

  const handleStep1Next = (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim() || !form.student_id.trim() || !form.semester) {
      setError('이름·학번·학기차를 모두 입력해주세요.');
      return;
    }
    setStep(1);
  };

  const handleStep2Next = () => {
    setStep(2);
  };

  const handleFinish = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await authAPI.googleRegister({
        id_token: idToken,
        name: form.name.trim(),
        student_id: form.student_id.trim(),
        semester: Number(form.semester),
        completed_course_ids: [...selectedCourseIds],
        preferences: prefs,
      });
      setToken(res.data.token);
      setUser(res.data.user);
      navigate('/');
    } catch (err) {
      const msg = err.response?.data?.error || '가입에 실패했습니다.';
      setError(msg);
      if (err.response?.status === 401 || err.response?.status === 403) {
        setTimeout(() => navigate('/auth', { replace: true }), 1500);
      }
    } finally {
      setLoading(false);
    }
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
      return {
        ...prev,
        [key]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value],
      };
    });
  };

  const filteredCourses = allCourses.filter(c =>
    c.name.includes(courseSearch) || c.code.includes(courseSearch)
  );
  const coursesByCategory = ['VC', 'EF', 'EL'].reduce((acc, cat) => {
    acc[cat] = filteredCourses.filter(c => c.category === cat);
    return acc;
  }, {});

  if (!idToken) return null;

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
            <input
              type="text"
              placeholder="이름"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              required
            />
            <input
              type="text"
              placeholder="학번"
              value={form.student_id}
              onChange={e => setForm({ ...form, student_id: e.target.value })}
              required
            />
            <select
              value={form.semester}
              onChange={e => setForm({ ...form, semester: e.target.value })}
              required
            >
              <option value="">학기차 선택</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                <option key={s} value={s}>{s}학기차</option>
              ))}
            </select>
            <button type="submit" disabled={loading}>다음</button>
          </form>
        )}

        {step === 1 && (
          <div className="step-content">
            <h2>기수강 과목 선택</h2>
            <p className="step-desc">이전에 수강 완료한 과목을 모두 선택해주세요.</p>
            <input
              className="search-input"
              type="text"
              placeholder="과목명 또는 코드 검색..."
              value={courseSearch}
              onChange={e => setCourseSearch(e.target.value)}
            />
            {allCourses.length === 0 ? (
              <p className="empty-msg">아직 개설 과목 데이터가 없습니다.<br />관리자가 추가한 후 마이페이지에서 설정할 수 있습니다.</p>
            ) : (
              <div className="course-list">
                {['VC', 'EF', 'EL'].map(cat => coursesByCategory[cat].length > 0 && (
                  <div key={cat} className="course-category">
                    <h3 className={`cat-title cat-${cat}`}>{cat}</h3>
                    {coursesByCategory[cat].map(course => (
                      <label key={course.id} className={`course-item ${selectedCourseIds.has(course.id) ? 'checked' : ''}`}>
                        <input
                          type="checkbox"
                          checked={selectedCourseIds.has(course.id)}
                          onChange={() => toggleCourse(course.id)}
                        />
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
                  <button
                    key={track}
                    type="button"
                    className={`chip ${prefs.preferred_tracks.includes(track) ? 'selected' : ''}`}
                    onClick={() => togglePrefArray('preferred_tracks', track)}
                  >
                    {track}
                  </button>
                ))}
              </div>
            </div>

            <div className="pref-section">
              <label className="pref-label">공강 요일</label>
              <div className="chip-group">
                {DAYS.map(d => (
                  <button
                    key={d.value}
                    type="button"
                    className={`chip ${prefs.day_off.includes(d.value) ? 'selected' : ''}`}
                    onClick={() => togglePrefArray('day_off', d.value)}
                  >
                    {d.label}요일
                  </button>
                ))}
              </div>
            </div>

            <div className="pref-section">
              <label className="pref-label">아침 수업 기피 (9:00 이전)</label>
              <div className="toggle-row">
                <span>{prefs.avoid_morning ? '기피함' : '상관없음'}</span>
                <button
                  type="button"
                  className={`toggle ${prefs.avoid_morning ? 'on' : ''}`}
                  onClick={() => setPrefs(p => ({ ...p, avoid_morning: !p.avoid_morning }))}
                >
                  <div className="toggle-thumb" />
                </button>
              </div>
            </div>

            <div className="pref-section">
              <label className="pref-label">최소 공강 시간: {prefs.preferred_gap}분</label>
              <input
                type="range"
                min="0"
                max="120"
                step="15"
                value={prefs.preferred_gap}
                onChange={e => setPrefs(p => ({ ...p, preferred_gap: Number(e.target.value) }))}
                className="range-input"
              />
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

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/OnboardingPage.jsx client/src/pages/OnboardingPage.css
git commit -m "feat(client): convert RegisterPage to OnboardingPage with deferred submission"
```

---

## Task 14: Update App.jsx routing and delete LoginPage

**Files:**
- Modify: `client/src/App.jsx`
- Delete: `client/src/pages/LoginPage.jsx`

- [ ] **Step 1: Rewrite App.jsx**

Replace the contents of `client/src/App.jsx` with:

```jsx
import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AuthPage from './pages/AuthPage';
import OnboardingPage from './pages/OnboardingPage';
import MainPage from './pages/MainPage';
import useStore from './store';
import { usersAPI } from './api';

function PrivateRoute({ children }) {
  const token = useStore(s => s.token);
  return token ? children : <Navigate to="/auth" replace />;
}

export default function App() {
  const { token, user, setUser, logout } = useStore();

  useEffect(() => {
    if (token && !user) {
      usersAPI.getMe()
        .then(res => setUser(res.data.user))
        .catch(() => logout());
    }
  }, [token]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/login" element={<Navigate to="/auth" replace />} />
        <Route path="/register" element={<Navigate to="/auth" replace />} />
        <Route path="/" element={<PrivateRoute><MainPage /></PrivateRoute>} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 2: Delete LoginPage**

```bash
git rm client/src/pages/LoginPage.jsx
```

- [ ] **Step 3: Commit**

```bash
git add client/src/App.jsx
git commit -m "feat(client): route /auth and /onboarding, remove LoginPage"
```

---

## Task 15: Update MainPage withdraw modal to use Google re-auth

**Files:**
- Modify: `client/src/pages/MainPage.jsx`
- Modify: `client/src/pages/MainPage.css`

- [ ] **Step 1: Update MainPage.jsx imports**

In `client/src/pages/MainPage.jsx`, add to the existing imports near the top (alongside the existing react-router or api imports):

```javascript
import { GoogleLogin } from '@react-oauth/google';
```

- [ ] **Step 2: Replace withdraw state and handlers**

In `MainPage.jsx`, find the existing withdraw state block (the lines declaring `showWithdrawModal`, `withdrawPassword`, `withdrawError`, `withdrawLoading`) and replace with:

```javascript
const [showWithdrawModal, setShowWithdrawModal] = useState(false);
const [withdrawError, setWithdrawError] = useState('');
const [withdrawLoading, setWithdrawLoading] = useState(false);
```

(Removes `withdrawPassword`.)

Find the existing `handleWithdraw` function and replace it with:

```javascript
const handleWithdrawSuccess = async (credentialResponse) => {
  setWithdrawError('');
  setWithdrawLoading(true);
  const idToken = credentialResponse?.credential;
  if (!idToken) {
    setWithdrawError('Google 인증 응답이 비어있습니다.');
    setWithdrawLoading(false);
    return;
  }
  try {
    await usersAPI.deleteAccount(idToken);
    logout();
  } catch (err) {
    setWithdrawError(err.response?.data?.error || '탈퇴 처리 중 오류가 발생했습니다.');
  } finally {
    setWithdrawLoading(false);
  }
};

const handleWithdrawError = () => {
  setWithdrawError('Google 재인증이 취소되었거나 실패했습니다.');
};
```

Find the existing `openWithdrawModal` function and replace with:

```javascript
const openWithdrawModal = () => {
  setWithdrawError('');
  setShowWithdrawModal(true);
};
```

- [ ] **Step 3: Replace modal JSX**

Find the `{showWithdrawModal && (...)}` block in the JSX and replace with:

```jsx
{showWithdrawModal && (
  <div className="modal-overlay" onClick={() => setShowWithdrawModal(false)}>
    <div className="withdraw-modal" onClick={(e) => e.stopPropagation()}>
      <h3>회원 탈퇴</h3>
      <p>탈퇴하면 시간표, 수강 기록, 선호도 등 모든 데이터가 <strong>영구 삭제</strong>됩니다.</p>
      <p>계속하려면 Google 계정으로 다시 인증해주세요.</p>
      {withdrawError && <p className="withdraw-error">{withdrawError}</p>}
      <div className="withdraw-google-wrapper">
        {withdrawLoading ? (
          <p>처리 중...</p>
        ) : (
          <GoogleLogin onSuccess={handleWithdrawSuccess} onError={handleWithdrawError} />
        )}
      </div>
      <div className="withdraw-modal-btns">
        <button onClick={() => setShowWithdrawModal(false)} disabled={withdrawLoading}>취소</button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 4: Add CSS for google wrapper**

Append to `client/src/pages/MainPage.css`:

```css
.withdraw-google-wrapper {
  display: flex;
  justify-content: center;
  margin: 16px 0;
}
```

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/MainPage.jsx client/src/pages/MainPage.css
git commit -m "feat(client): require Google re-auth on withdraw modal"
```

---

## Task 16: Update .env.example files

**Files:**
- Modify or create: `.env.example` (root)
- Create: `client/.env.example`

- [ ] **Step 1: Inspect existing .env.example**

```bash
ls -la .env.example server/.env.example client/.env.example 2>&1 | grep -v "No such"
```

Find which `.env.example` files exist and which holds backend vars.

- [ ] **Step 2: Add GOOGLE_CLIENT_ID to backend .env.example**

Open the existing backend-related `.env.example` (most likely repo root `.env.example`) and add:

```
# Google OAuth — get from Google Cloud Console → Credentials → OAuth client ID (Web application)
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

- [ ] **Step 3: Create client/.env.example**

If `client/.env.example` does not exist, create it with:

```
# Must match GOOGLE_CLIENT_ID in backend .env
REACT_APP_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

- [ ] **Step 4: Commit**

```bash
git add .env.example client/.env.example 2>/dev/null || git add client/.env.example
git add -u
git commit -m "docs: add GOOGLE_CLIENT_ID to .env.example files"
```

---

## Task 17: Remove bcryptjs

Now that auth.js and users.js no longer use bcrypt, remove the dependency.

**Files:**
- Modify: `server/package.json`

- [ ] **Step 1: Confirm no remaining usage**

```bash
cd server
grep -r "bcryptjs\|require('bcrypt" --include="*.js" .
```

Expected: no matches outside `node_modules/`. If any application code still imports bcrypt, STOP and resolve before continuing.

- [ ] **Step 2: Uninstall**

```bash
cd server
npm uninstall bcryptjs
```

- [ ] **Step 3: Commit**

```bash
git add server/package.json server/package-lock.json
git commit -m "chore(server): remove unused bcryptjs"
```

---

## Task 18: Manual end-to-end verification

**Files:** (none modified — exploratory testing)

- [ ] **Step 1: Confirm .env files contain real Client ID**

```bash
grep GOOGLE_CLIENT_ID .env server/.env client/.env 2>/dev/null
```

Expected: real Client ID from Google Cloud Console in both server-side and client-side env.

- [ ] **Step 2: Start server and client**

Two terminals:

```bash
cd server && npm run dev
```

```bash
cd client && npm start
```

Browser should open `http://localhost:3000`.

- [ ] **Step 3: New user happy path**

1. Navigate to `http://localhost:3000` → should redirect to `/auth`.
2. Click `Sign in with Google` → choose your `@kentech.ac.kr` account.
3. Should redirect to `/onboarding` with email pre-shown.
4. Fill name, student_id, pick `5학기차` → Next.
5. Skip or pick a few courses → Next.
6. Set preferences → 완료.
7. Should land at `/` (MainPage) with your name in header.

Verify in Supabase:
```sql
SELECT email, google_sub, name, student_id, semester, role FROM users WHERE email = '<your email>';
```
Expected: row present with non-null `google_sub` and `semester`.

- [ ] **Step 4: Returning user happy path**

1. Click 로그아웃.
2. Should land on `/auth`.
3. Sign in with same Google account.
4. Should land directly at `/` (no onboarding).

- [ ] **Step 5: Non-kentech rejection**

1. Logout. In Google account picker, choose a personal `@gmail.com` account.
2. Expected: page shows error "`@kentech.ac.kr 계정만 사용할 수 있습니다.`" — stays on `/auth`.

- [ ] **Step 6: Admin account preservation (if accessible)**

If you can sign in as `magnesium@kentech.ac.kr`:
1. Sign in.
2. Verify in DB: `SELECT role, google_sub FROM users WHERE email = 'magnesium@kentech.ac.kr';` → `role = 'admin'`, `google_sub` populated.

If not accessible, ask the admin account holder to test this once.

- [ ] **Step 7: Account deletion**

1. Sign in as a *test* account (NOT your real account).
2. Click 회원 탈퇴.
3. Click Google sign-in in the modal → reauthenticate with the same account.
4. Expected: logged out, redirected to `/auth`.
5. Verify in DB: `SELECT id FROM users WHERE email = '<test email>';` → empty result.

- [ ] **Step 8: Wrong-account deletion rejection**

1. Sign in as account A.
2. Open withdraw modal.
3. In Google picker, choose account B (different `@kentech.ac.kr` user).
4. Expected: modal shows "본인 계정으로 재인증해주세요." — A's record unchanged.

If steps 1-8 pass, the feature is complete.

- [ ] **Step 9: Final commit (CHANGELOG/README)**

Edit `CHANGELOG.md` to add a top entry summarizing the Google OAuth migration. Edit `README.md` 빠른 시작 section to reflect Google Client ID setup. Then:

```bash
git add CHANGELOG.md README.md
git commit -m "docs: document Google OAuth setup and migration"
```

- [ ] **Step 10: Push the branch and open PR**

```bash
git push -u origin feat/google-oauth
gh pr create --title "feat: Google OAuth authentication" --body "$(cat <<'EOF'
## Summary
- Replace email/password auth with Google OAuth (`@kentech.ac.kr` hd verification)
- Rewire account deletion to use Google re-authentication
- Add `google_sub`/`semester` columns; make `password_hash` nullable

## Test plan
- [x] New user onboarding via Google
- [x] Returning user direct login
- [x] Non-kentech account rejected
- [x] Admin account preserved
- [x] Account deletion via Google re-auth
- [x] Wrong-account deletion rejected

See `docs/superpowers/specs/2026-05-28-google-oauth-design.md` for design.
EOF
)"
```

---

## Files Touched (Summary)

**Created:**
- `server/utils/googleVerify.js`
- `server/utils/__tests__/googleVerify.test.js`
- `client/src/pages/AuthPage.jsx`
- `client/src/pages/AuthPage.css`
- `client/.env.example`

**Modified:**
- `database/schema.sql`
- `server/package.json`
- `server/routes/auth.js` (full rewrite)
- `server/routes/users.js` (DELETE handler rewritten, bcrypt removed)
- `server/routes/courses.js` (potentially — only if auth was applied to GET /)
- `client/package.json`
- `client/src/index.js`
- `client/src/api/index.js`
- `client/src/App.jsx`
- `client/src/pages/MainPage.jsx`
- `client/src/pages/MainPage.css`
- `.env.example` (root)
- `CHANGELOG.md`
- `README.md`

**Renamed:**
- `client/src/pages/RegisterPage.jsx` → `OnboardingPage.jsx`
- `client/src/pages/RegisterPage.css` → `OnboardingPage.css`

**Deleted:**
- `client/src/pages/LoginPage.jsx`
