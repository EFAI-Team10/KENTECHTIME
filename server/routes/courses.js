const express = require('express');
const router = express.Router();
const db = require('../models/db');
const authMiddleware = require('../middleware/auth');

// GET /api/courses
router.get('/', async (req, res) => {
  const { semester, track, category } = req.query;
  let query = 'SELECT * FROM courses WHERE 1=1';
  const params = [];

  if (semester) {
    params.push(semester);
    query += ` AND (semester = $${params.length} OR semester = 'both')`;
  }
  if (track) {
    params.push(track);
    query += ` AND track = $${params.length}`;
  }
  if (category) {
    params.push(category);
    query += ` AND category = $${params.length}`;
  }

  try {
    const result = await db.query(query, params);
    res.json({ courses: result.rows });
  } catch (err) {
    res.status(500).json({ error: '서버 오류' });
  }
});

// GET /api/courses/requirements
router.get('/requirements', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT c.category, SUM(c.credits) as earned
       FROM completed_courses cc
       JOIN courses c ON cc.course_id = c.id
       WHERE cc.user_id = $1
       GROUP BY c.category`,
      [req.userId]
    );

    const earned = { VC: 0, EF: 0, EL: 0, total: 0 };
    result.rows.forEach(row => {
      if (earned[row.category] !== undefined) earned[row.category] = parseInt(row.earned);
      earned.total += parseInt(row.earned);
    });

    res.json({ earned, required: { VC: 8, EF: 28, EL: 40, total: 128 } });
  } catch (err) {
    res.status(500).json({ error: '서버 오류' });
  }
});

module.exports = router;
