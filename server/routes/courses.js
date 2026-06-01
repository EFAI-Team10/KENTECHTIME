const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const db = require('../models/db');
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');
const { parseTimeslots, getCategoryFromCode } = require('../utils/parser');

const upload = multer({ storage: multer.memoryStorage() });

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

// GET /api/courses/completed — 현재 수강이력 조회
router.get('/completed', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT c.id, c.code, c.name, c.credits, c.category, cc.semester, cc.grade
       FROM completed_courses cc
       JOIN courses c ON cc.course_id = c.id
       WHERE cc.user_id = $1`,
      [req.userId]
    );
    res.json({ courses: result.rows });
  } catch (err) {
    res.status(500).json({ error: '서버 오류' });
  }
});

// POST /api/courses/completed
router.post('/completed', authMiddleware, async (req, res) => {
  const { courses } = req.body; // [{ course_id, semester, grade }]
  try {
    await db.query('DELETE FROM completed_courses WHERE user_id = $1', [req.userId]);
    for (const c of courses) {
      await db.query(
        'INSERT INTO completed_courses (user_id, course_id, semester, grade) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, course_id) DO NOTHING',
        [req.userId, c.course_id, c.semester || '2025-fall', c.grade || 'P']
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '서버 오류' });
  }
});

// POST /api/courses/upload
router.post('/upload', authMiddleware, adminMiddleware, upload.single('file'), async (req, res) => {
  const { semester } = req.body;
  if (!semester) {
    return res.status(400).json({ error: '학기 정보가 누락되었습니다.' });
  }
  if (!req.file) {
    return res.status(400).json({ error: '업로드할 파일이 없습니다.' });
  }

  function parseGrade(gradeStr) {
    if (!gradeStr) return 0;
    const match = gradeStr.match(/(\d)학년/);
    if (match) return parseInt(match[1], 10);
    return 0;
  }

  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (rows.length < 2) {
      return res.status(400).json({ error: '엑셀 파일 구조가 올바르지 않습니다.' });
    }

    const headers = rows[0];
    const colMap = {
      code: headers.indexOf('교과목코드'),
      name: headers.indexOf('교과목명(국문)'),
      category: headers.indexOf('영역\n구분'),
      timetable: headers.indexOf('시간표'),
      credits: headers.indexOf('학점'),
      grade: headers.indexOf('Unnamed: 1') // 수강학년
    };

    if (colMap.code === -1 || colMap.name === -1) {
      return res.status(400).json({ error: '필수 열(교과목코드, 교과목명(국문))을 찾을 수 없습니다.' });
    }

    let count = 0;
    for (let i = 2; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const code = row[colMap.code];
      const name = row[colMap.name];

      if (!code || !name) continue;

      const credits = parseInt(row[colMap.credits], 10) || 0;
      const category = (colMap.category !== -1 && row[colMap.category])
        ? String(row[colMap.category]).trim()
        : getCategoryFromCode(code);
      const rawGrade = row[colMap.grade];
      const targetGrade = parseGrade(rawGrade);
      const timetableStr = row[colMap.timetable];
      const timeslots = parseTimeslots(timetableStr);

      await db.query(
        `INSERT INTO courses (code, name, credits, track, category, semester, target_grade, timeslots)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (code) DO UPDATE SET
           name = EXCLUDED.name,
           credits = EXCLUDED.credits,
           track = EXCLUDED.track,
           category = EXCLUDED.category,
           semester = EXCLUDED.semester,
           target_grade = EXCLUDED.target_grade,
           timeslots = EXCLUDED.timeslots`,
        [
          code.trim(),
          name.trim(),
          credits,
          null,
          category.trim(),
          semester,
          targetGrade,
          JSON.stringify(timeslots)
        ]
      );
      count++;
    }

    res.json({ success: true, count });
  } catch (err) {
    console.error('Upload Error:', err);
    res.status(500).json({ error: '엑셀 데이터 파싱 및 업로드 실패' });
  }
});

// POST /api/courses/import-by-codes — 과목코드 배열로 수강 이력 가져오기
router.post('/import-by-codes', authMiddleware, async (req, res) => {
  const { codes } = req.body; // string[]
  if (!Array.isArray(codes) || codes.length === 0) {
    return res.status(400).json({ error: '과목코드 배열이 필요합니다.' });
  }

  try {
    const result = await db.query(
      `SELECT id, code, name, credits, category FROM courses WHERE code = ANY($1)`,
      [codes]
    );
    const matched = result.rows;
    const matchedCodes = matched.map(c => c.code);
    const unmatched = codes.filter(c => !matchedCodes.includes(c));

    for (const course of matched) {
      await db.query(
        `INSERT INTO completed_courses (user_id, course_id, semester, grade)
         VALUES ($1, $2, 'imported', 'P')
         ON CONFLICT (user_id, course_id) DO NOTHING`,
        [req.userId, course.id]
      );
    }

    res.json({ success: true, matched, unmatched });
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// POST /api/courses/external — 타대 계절학기 등 외부 과목 직접 등록
router.post('/external', authMiddleware, async (req, res) => {
  const { name, source, credits, category } = req.body;
  if (!name || !source || !credits || !category) {
    return res.status(400).json({ error: 'name, source, credits, category는 필수입니다.' });
  }

  const code = `EXT-${req.userId}-${Date.now().toString(36).toUpperCase()}`;

  try {
    const courseResult = await db.query(
      `INSERT INTO courses (code, name, credits, category, semester, track, target_grade, timeslots)
       VALUES ($1, $2, $3, $4, 'external', NULL, 0, '[]')
       RETURNING id`,
      [code, name.trim(), parseInt(credits, 10), category]
    );
    const courseId = courseResult.rows[0].id;

    await db.query(
      `INSERT INTO completed_courses (user_id, course_id, semester, grade)
       VALUES ($1, $2, $3, 'P')
       ON CONFLICT (user_id, course_id) DO NOTHING`,
      [req.userId, courseId, source.trim()]
    );

    res.json({ success: true, code });
  } catch (err) {
    console.error('External course error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

module.exports = router;
