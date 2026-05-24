const express = require('express');
const router = express.Router();
const db = require('../models/db');
const authMiddleware = require('../middleware/auth');
const { generateRecommendations } = require('../utils/recommender');

// POST /api/schedule/recommend
router.post('/recommend', authMiddleware, async (req, res) => {
  const { semester, preferences } = req.body;
  try {
    const plans = await generateRecommendations(req.userId, semester, preferences);
    res.json({ plans });
  } catch (err) {
    res.status(500).json({ error: '추천 생성 실패' });
  }
});

// GET /api/schedule/my
router.get('/my', authMiddleware, async (req, res) => {
  const { semester } = req.query;
  try {
    const result = await db.query(
      `SELECT ps.*, c.name, c.credits, c.timeslots, c.track, c.category
       FROM planned_schedules ps
       JOIN courses c ON ps.course_id = c.id
       WHERE ps.user_id = $1 AND ps.semester = $2`,
      [req.userId, semester]
    );
    res.json({ schedule: result.rows });
  } catch (err) {
    res.status(500).json({ error: '서버 오류' });
  }
});

// POST /api/schedule/save
router.post('/save', authMiddleware, async (req, res) => {
  const { courseIds, semester } = req.body;
  try {
    await db.query(
      'DELETE FROM planned_schedules WHERE user_id = $1 AND semester = $2',
      [req.userId, semester]
    );
    for (const courseId of courseIds) {
      await db.query(
        'INSERT INTO planned_schedules (user_id, course_id, semester) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [req.userId, courseId, semester]
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '저장 실패' });
  }
});

module.exports = router;
