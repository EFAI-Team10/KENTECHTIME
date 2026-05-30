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
