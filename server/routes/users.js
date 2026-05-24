const express = require('express');
const router = express.Router();
const db = require('../models/db');
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

module.exports = router;
