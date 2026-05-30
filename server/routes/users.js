const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { verifyIdToken, GoogleAuthError } = require('../utils/googleVerify');
const authMiddleware = require('../middleware/auth');

// POST /api/users/preferences
router.post('/preferences', authMiddleware, async (req, res) => {
  const { preferred_tracks, avoid_morning, preferred_gap, day_off } = req.body;
  try {
    await db.query(
      `INSERT INTO user_preferences (user_id, preferred_tracks, avoid_morning, preferred_gap, day_off)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
         preferred_tracks = EXCLUDED.preferred_tracks,
         avoid_morning    = EXCLUDED.avoid_morning,
         preferred_gap    = EXCLUDED.preferred_gap,
         day_off          = EXCLUDED.day_off`,
      [req.userId, preferred_tracks, avoid_morning, preferred_gap ?? 60, day_off]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '서버 오류' });
  }
});

// GET /api/users/preferences
router.get('/preferences', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM user_preferences WHERE user_id = $1',
      [req.userId]
    );
    res.json({ preferences: result.rows[0] || null });
  } catch (err) {
    res.status(500).json({ error: '서버 오류' });
  }
});

// GET /api/users/me — 새로고침 시 유저 정보 복원용
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, email, name, grade, student_id, role FROM users WHERE id = $1',
      [req.userId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: '유저 없음' });
    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: '서버 오류' });
  }
});

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

module.exports = router;
